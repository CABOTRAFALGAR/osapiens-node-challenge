# Workflow Execution Flow

This document explains the complete flow of the system from when a request arrives until the workflow completes.

## System Overview

The system uses an **asynchronous task execution model** where:
- Workflows are created immediately (synchronous)
- Tasks are executed in the background (asynchronous)
- Dependencies between tasks are enforced
- A worker polls for tasks every 5 seconds

---

## Complete Flow

### **1. User sends POST request to `/analysis`**

```http
POST http://localhost:3005/analysis
Content-Type: application/json

{
  "clientId": "client123",
  "geoJson": {
    "type": "Polygon",
    "coordinates": [...]
  }
}
```

↓

### **2. analysisRoutes.ts receives the request**

**File:** `src/routes/analysisRoutes.ts`

```typescript
router.post('/', async (req, res) => {
    const { clientId, geoJson } = req.body;
    const workflowFile = path.join(__dirname, '../workflows/example_workflow.yml');
    
    // Call WorkflowFactory
    const workflow = await workflowFactory.createWorkflowFromYAML(
        workflowFile, 
        clientId, 
        JSON.stringify(geoJson)
    );
    
    // Respond immediately (doesn't wait for task execution)
    res.status(202).json({
        workflowId: workflow.workflowId,
        message: 'Workflow created and tasks queued'
    });
});
```

**What happens:**
- Extracts `clientId` and `geoJson` from request body
- Calls `WorkflowFactory.createWorkflowFromYAML()`
- Returns **202 Accepted** with `workflowId` immediately
- **Does NOT wait** for tasks to execute

↓

### **3. WorkflowFactory.createWorkflowFromYAML()**

**File:** `src/workflows/WorkflowFactory.ts`

```typescript
async createWorkflowFromYAML(filePath, clientId, geoJson) {
    // 1. Read and parse YAML file
    const workflowDef = yaml.load(fileContent);
    
    // 2. Create Workflow entity in database
    const workflow = new Workflow();
    workflow.clientId = clientId;
    workflow.status = 'initial';
    await workflowRepository.save(workflow);
    
    // 3. Create Task entities (all with status = 'queued')
    const tasks = workflowDef.steps.map(step => {
        const task = new Task();
        task.taskType = step.taskType;
        task.status = 'queued'; // ← IMPORTANT
        task.stepNumber = step.stepNumber;
        task.workflow = workflow;
        task.geoJson = geoJson;
        return task;
    });
    
    // 4. Save tasks to database
    const savedTasks = await taskRepository.save(tasks);
    
    // 5. Resolve dependencies (taskType → taskId)
    // Create a map: taskType → taskId
    const taskTypeToIdMap = {};
    savedTasks.forEach(task => {
        taskTypeToIdMap[task.taskType] = task.taskId;
    });
    
    // 6. Update dependsOn field with actual taskIds
    for (let i = 0; i < workflowDef.steps.length; i++) {
        const step = workflowDef.steps[i];
        if (step.dependsOn) {
            const dependentTaskId = taskTypeToIdMap[step.dependsOn];
            if (!dependentTaskId) {
                throw new Error(`Task ${step.taskType} depends on ${step.dependsOn}, but it was not found`);
            }
            savedTasks[i].dependsOn = dependentTaskId;
            console.log(`Task ${savedTasks[i].taskType} depends on ${step.dependsOn} (${dependentTaskId})`);
        }
    }
    
    // 7. Save tasks with resolved dependencies
    await taskRepository.save(savedTasks);
    
    return workflow;
}
```

**What happens:**
- Creates 1 Workflow record in database
- Creates 4 Task records (all with `status = 'queued'`):
  - `analysis` (step 1, no dependency)
  - `polygonArea` (step 2, depends on analysis)
  - `notification` (step 3, depends on polygonArea)
  - `report` (step 4, depends on notification)
- Resolves dependencies: converts `taskType` strings to actual `taskId` UUIDs
- Logs dependency information for debugging

**Database state after this step:**

```
Workflow: 
  - workflowId: "abc-123"
  - status: "initial"
  - finalResult: null

Tasks:
  - analysis:      status="queued", dependsOn=null, stepNumber=1
  - polygonArea:   status="queued", dependsOn="<analysis-taskId>", stepNumber=2
  - notification:  status="queued", dependsOn="<polygonArea-taskId>", stepNumber=3
  - report:        status="queued", dependsOn="<notification-taskId>", stepNumber=4
```

↓

### **4. taskWorker (running in background since server start)**

**File:** `src/workers/taskWorker.ts`

This code runs **CONTINUOUSLY** in an infinite loop since the server starts.

```typescript
export async function taskWorker() {
    while (true) { // ← INFINITE LOOP
        // Find the queued task with the LOWEST stepNumber
        const task = await taskRepository.findOne({
            where: { status: 'queued' },
            order: { stepNumber: 'ASC' }, // ← IMPORTANT: execute in order
            relations: ['workflow']
        });

        if (task) {
            try {
                // Try to execute the task
                await taskRunner.run(task);
            } catch (error) {
                // Error expected if dependencies not ready
                // Task stays queued and will retry in next cycle
            }
        }

        // Wait 5 seconds before next cycle
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}
```

**What it does:**
- Every 5 seconds, searches for a task with `status = 'queued'`
- **Orders by `stepNumber ASC`** to process tasks in the correct sequence
- If found, calls `TaskRunner.run(task)`
- If dependencies are not completed → error, task stays `queued`
- If no dependencies or dependencies completed → executes task
- Silently catches errors (dependencies not ready) and retries later

---

## Task Execution Cycles

### **Cycle 1 (T+0s): Execute analysis**

**taskWorker finds:** `analysis` (status = 'queued', stepNumber = 1, no dependencies)

↓

**TaskRunner.run(analysis):**

```typescript
async run(task: Task) {
    // 1. Check dependencies BEFORE changing status
    if (task.dependsOn) {
        // analysis has NO dependsOn → SKIP this check
    }
    
    // 2. Mark task as in_progress
    task.status = 'in_progress';
    await taskRepository.save(task);
    
    // 3. Get and execute the job
    const job = getJobForTaskType('analysis'); // → DataAnalysisJob
    await job.run(task);
    // DataAnalysisJob analyzes which country the polygon is in
    
    // 4. Mark task as completed
    task.status = 'completed';
    await taskRepository.save(task);
    
    // 5. Update workflow status
    const workflow = await findWorkflow(task.workflow.workflowId);
    if (allTasksCompleted) {
        workflow.status = 'completed';
    } else {
        workflow.status = 'in_progress';
    }
    await workflowRepository.save(workflow);
}
```

**Database state after:**
```
Workflow: status = "in_progress"
Tasks:
  - analysis:      status="completed", output="Brazil"
  - polygonArea:   status="queued"
  - notification:  status="queued"
  - report:        status="queued"
```

↓

### **Cycle 2 (T+5s): Execute polygonArea**

**taskWorker finds:** `polygonArea` (status = 'queued', stepNumber = 2)

↓

**TaskRunner.run(polygonArea):**

```typescript
async run(task: Task) {
    // 1. Check dependencies FIRST (before changing status)
    if (task.dependsOn) { // polygonArea.dependsOn = '<analysis-taskId>'
        const dependentTask = await taskRepository.findOne({
            where: { taskId: task.dependsOn }
        }); // → finds analysis task
        
        if (!dependentTask) {
            throw new Error(`Dependent task ${task.dependsOn} not found`);
        }
        
        if (dependentTask.status !== 'completed') {
            throw new Error(`Dependent task ${dependentTask.taskType} is not completed yet (status: ${dependentTask.status})`);
            // TaskWorker catches error
            // Task stays 'queued'
            // Will retry in next cycle
        }
        
        // analysis IS completed → CONTINUE
        if (dependentTask.output) {
            console.log(`Task ${task.taskType} gets the output from ${dependentTask.taskType}`);
        }
    }
    
    // 2. Mark as in_progress AFTER dependency check
    task.status = 'in_progress';
    await taskRepository.save(task);
    
    // 3. Execute PolygonAreaJob
    const job = getJobForTaskType('polygonArea');
    await job.run(task);
    // Calculates polygon area using Turf.js
    
    // 4. Mark as completed
    task.status = 'completed';
    await taskRepository.save(task);
}
```

**Database state after:**
```
Tasks:
  - analysis:      status="completed"
  - polygonArea:   status="completed", output='{"areaInSquareMeters":8363324.27}'
  - notification:  status="queued"
  - report:        status="queued"
```

↓

### **Cycle 3 (T+10s): Execute notification**

**taskWorker finds:** `notification` (status = 'queued', stepNumber = 3)

Same process:
- Checks that `polygonArea` (its dependency) is completed ✅
- Logs: `Task notification gets the output from polygonArea`
- Executes `EmailNotificationJob`
- Marks as completed

**Database state after:**
```
Tasks:
  - analysis:      status="completed"
  - polygonArea:   status="completed"
  - notification:  status="completed", output=null
  - report:        status="queued"
```

↓

### **Cycle 4 (T+15s): Execute report**

**taskWorker finds:** `report` (status = 'queued', stepNumber = 4)

↓

**TaskRunner.run(report):**

```typescript
async run(task: Task) {
    // 1. Check dependencies
    if (task.dependsOn) { // report.dependsOn = '<notification-taskId>'
        const dependentTask = await find(task.dependsOn);
        if (dependentTask.status !== 'completed') {
            throw new Error('Dependency not completed');
        }
        // notification IS completed → CONTINUE
    }
    
    // 2. Execute ReportGenerationJob
    const job = getJobForTaskType('report');
    await job.run(task);
    // ReportGenerationJob:
    //   - Fetches all tasks from the workflow
    //   - Filters out the current task (excludes self)
    //   - Aggregates outputs from preceding tasks
    //   - Creates final report JSON
    
    // 3. Mark as completed
    task.status = 'completed';
    await taskRepository.save(task);
    
    // 4. Update workflow - check if ALL tasks are completed
    const workflow = await workflowRepository.findOne({
        where: { workflowId: task.workflow.workflowId },
        relations: ['tasks']
    });
    
    const allCompleted = workflow.tasks.every(t => t.status === 'completed');
    
    if (allCompleted) {
        workflow.status = 'completed';
        
        // Save the final result from the report task
        const reportTask = workflow.tasks.find(t => t.taskType === 'report');
        if (reportTask && reportTask.output) {
            workflow.finalResult = reportTask.output;
            console.log(`Workflow ${workflow.workflowId} completed. Final result saved.`);
        }
    }
    
    await workflowRepository.save(workflow);
}
```

**Final database state:**
```
Workflow: 
  - status = "completed"
  - finalResult = '{"workflowId":"...", "tasks":[...], "finalReport":"..."}'

Tasks:
  - analysis:      status="completed", output="Brazil"
  - polygonArea:   status="completed", output='{"areaInSquareMeters":8363324.27}'
  - notification:  status="completed", output=null
  - report:        status="completed", output='{"workflowId":"...", "tasks":[...]}'
```

**Key Points:**
- Report task aggregates outputs from **preceding tasks only** (excludes itself)
- Workflow `finalResult` is populated from the report task output
- Workflow status changes to `completed` when ALL tasks are completed
- Final result is saved in both the report task AND the workflow entity

---

## Flow Summary Diagram

```
POST /analysis
    ↓
WorkflowFactory creates Workflow + 4 Tasks (all queued)
    ↓
Response 202 Accepted (immediate)

[In parallel, taskWorker executes every 5 seconds:]
    ↓
Cycle 1 (T+0s):  analysis (no deps) → completed
    ↓
Cycle 2 (T+5s):  polygonArea (waits for analysis) → completed
    ↓
Cycle 3 (T+10s): notification (waits for polygonArea) → completed
    ↓
Cycle 4 (T+15s): report (waits for notification) → completed
                 └─> Workflow.finalResult saved
    ↓
Workflow status = 'completed'
```

---

## Key Components

### **WorkflowFactory**
- **Purpose:** Creates workflows and tasks from YAML definitions
- **Input:** YAML file, clientId, geoJson
- **Output:** Workflow entity with associated tasks
- **Responsibility:** Parse YAML, create entities, resolve dependencies

### **taskWorker**
- **Purpose:** Continuously polls for queued tasks
- **Runs:** Infinite loop, checks every 5 seconds
- **Responsibility:** Find queued tasks and delegate to TaskRunner

### **TaskRunner**
- **Purpose:** Execute individual tasks
- **Checks:** Dependencies before execution
- **Responsibility:** 
  - Verify dependencies are completed
  - Execute the appropriate job
  - Update task status
  - Update workflow status

### **Jobs** (PolygonAreaJob, DataAnalysisJob, etc.)
- **Purpose:** Perform the actual work
- **Input:** Task entity
- **Output:** Updates `task.output` field
- **Responsibility:** Business logic execution

---

## Dependency Resolution

**YAML Definition:**
```yaml
steps:
  - taskType: "analysis"
    stepNumber: 1
    
  - taskType: "polygonArea"
    stepNumber: 2
    dependsOn: "analysis"  # ← taskType (string)
    
  - taskType: "notification"
    stepNumber: 3
    dependsOn: "polygonArea"
    
  - taskType: "report"
    stepNumber: 4
    dependsOn: "notification"
```

**WorkflowFactory Process:**
1. Creates all tasks
2. Saves them to get UUIDs
3. Creates map: `{ "analysis": "uuid-123", "polygonArea": "uuid-456", ... }`
4. Resolves: `polygonArea.dependsOn = "analysis"` → `polygonArea.dependsOn = "uuid-123"`
5. Logs dependency information: `Task polygonArea depends on analysis (uuid-123)`
6. Saves tasks with resolved dependencies

**TaskRunner Verification:**
```typescript
if (task.dependsOn) {
    const dependentTask = await find(task.dependsOn); // Finds by UUID
    if (dependentTask.status !== 'completed') {
        throw new Error(); // Task stays queued
    }
}
```

---

## Error Handling

### **If a task fails:**
1. TaskRunner catches the error
2. Sets `task.status = 'failed'`
3. Sets `task.output = '{"error":"..."}'`
4. Saves task to database
5. Updates workflow: `workflow.status = 'failed'`

### **If a dependency is not completed:**
1. TaskRunner throws error BEFORE marking task as in_progress
2. taskWorker catches the error
3. Task stays `queued`
4. Will retry in next cycle (5 seconds later)

---

## Timeline Example

```
T+0s:   User sends POST /analysis
T+0.1s: Workflow + 4 tasks created in DB (all queued)
        - Dependencies resolved: analysis→polygonArea→notification→report
T+0.1s: Response 202 sent to user
T+0.2s: taskWorker cycle 1 → executes analysis (no dependencies)
T+5.2s: taskWorker cycle 2 → executes polygonArea (analysis completed)
T+10.2s: taskWorker cycle 3 → executes notification (polygonArea completed)
T+15.2s: taskWorker cycle 4 → executes report (notification completed)
T+15.3s: Workflow status = 'completed', finalResult saved
```

Total execution time: ~15 seconds for this example workflow.

---

## Notes

- The system is **asynchronous** - API responds immediately, tasks execute in background
- Tasks are executed **sequentially** due to dependencies enforced by `dependsOn` field
- Tasks are ordered by `stepNumber` to ensure correct execution sequence
- If tasks have no dependencies, they execute immediately (but still respect stepNumber order)
- The 5-second interval is configurable in `taskWorker.ts`
- All task outputs are stored in the `output` field of the Task entity
- The final aggregated result is stored in both:
  - The `report` task's `output` field
  - The workflow's `finalResult` field
- Dependencies are resolved at workflow creation time (taskType → taskId)
- TaskRunner verifies dependencies at execution time (prevents running if dependency not completed)

---

## Implemented Features

### **1. PolygonAreaJob**
- Calculates the area of a polygon from GeoJSON input
- Uses `@turf/area` library
- Saves result in `task.output` with multiple units (square meters, kilometers, hectares)
- Handles invalid GeoJSON gracefully (marks task as failed with error message)

### **2. ReportGenerationJob**
- Aggregates outputs from all preceding tasks in the workflow
- Excludes the current (report) task from the aggregation
- Generates a comprehensive JSON report with:
  - Workflow ID
  - Array of completed tasks with their outputs
  - Final report summary
- Saves the aggregated report in `task.output`

### **3. Task Dependencies (dependsOn)**
- Tasks can depend on other tasks via the `dependsOn` field
- Dependencies are specified in YAML by `taskType` and resolved to `taskId` at creation
- TaskRunner enforces dependencies at runtime:
  - Checks if dependent task exists
  - Verifies dependent task is completed before executing current task
  - Throws error if dependency not met (task stays queued for retry)
- Dependencies are logged for debugging and monitoring

### **4. Workflow Final Results**
- Workflow entity has a `finalResult` field
- Automatically populated when workflow completes
- Uses the output from the `report` task
- If workflow fails, includes error information from all tasks
- Provides a single source of truth for workflow results

### **5. Task Ordering**
- TaskWorker now orders tasks by `stepNumber ASC`
- Ensures tasks execute in the correct sequence
- Prevents out-of-order execution even with multiple queued tasks
- Improves predictability and debugging

---

## Architecture Highlights

### **Separation of Concerns**
- **WorkflowFactory**: Creates and configures workflows
- **taskWorker**: Orchestrates task execution (polling and delegation)
- **TaskRunner**: Executes tasks and manages state transitions
- **Jobs**: Contain business logic (data analysis, area calculation, reporting, etc.)

### **State Management**
- Task states: `queued` → `in_progress` → `completed` or `failed`
- Workflow states: `initial` → `in_progress` → `completed` or `failed`
- Status transitions are atomic and persisted to database
- Failed tasks prevent workflow completion

### **Data Flow**
1. User request → Workflow creation (with tasks)
2. Tasks queued in database
3. Worker picks tasks (ordered by stepNumber)
4. Runner verifies dependencies and executes job
5. Job processes data and updates task.output
6. Runner marks task completed and updates workflow
7. Final result saved to workflow.finalResult

### **Extensibility**
- New jobs can be added by:
  1. Creating a new class implementing the `Job` interface
  2. Registering it in `JobFactory`
  3. Adding it to a workflow YAML file
- New task types automatically supported
- Dependencies can be configured in YAML without code changes

---

## Debugging Tips

### **Check Workflow Creation**
Look for these logs when a workflow is created:
```
Task polygonArea depends on analysis (uuid-xxx)
Task notification depends on polygonArea (uuid-yyy)
Task report depends on notification (uuid-zzz)
```

### **Monitor Task Execution**
Each task execution produces logs:
```
Starting job <taskType> for task <uuid>...
Task <taskType> gets the output from <dependency-taskType>
Job <taskType> for task <uuid> completed successfully.
```

### **Verify Final Result**
When workflow completes:
```
Workflow <uuid> completed. Final result saved.
```

### **Common Issues**
- **Tasks not executing**: Check database for task status and dependsOn values
- **Wrong execution order**: Verify stepNumber values are sequential
- **Dependencies not working**: Check that dependsOn contains taskId (UUID) not taskType
- **Missing output**: Verify job is saving data to task.output field
