# Backend Coding Challenge

This repository demonstrates a backend architecture that handles asynchronous tasks, workflows, and job execution using TypeScript, Express.js, and TypeORM. The project showcases how to:

- Define and manage entities such as `Task` and `Workflow`.
- Use a `WorkflowFactory` to create workflows from YAML configurations.
- Implement a `TaskRunner` that executes jobs associated with tasks and manages task and workflow states.
- Run tasks asynchronously using a background worker.

## Key Features

1. **Entity Modeling with TypeORM**  
   - **Task Entity:** Represents an individual unit of work with attributes like `taskType`, `status`, `progress`, and references to a `Workflow`.
   - **Workflow Entity:** Groups multiple tasks into a defined sequence or steps, allowing complex multi-step processes.

2. **Workflow Creation from YAML**  
   - Use `WorkflowFactory` to load workflow definitions from a YAML file.
   - Dynamically create workflows and tasks without code changes by updating YAML files.

3. **Asynchronous Task Execution**  
   - A background worker (`taskWorker`) continuously polls for `queued` tasks.
   - The `TaskRunner` runs the appropriate job based on a task’s `taskType`.

4. **Robust Status Management**  
   - `TaskRunner` updates the status of tasks (from `queued` to `in_progress`, `completed`, or `failed`).
   - Workflow status is evaluated after each task completes, ensuring you know when the entire workflow is `completed` or `failed`.

5. **Dependency Injection and Decoupling**  
   - `TaskRunner` takes in only the `Task` and determines the correct job internally.
   - `TaskRunner` handles task state transitions, leaving the background worker clean and focused on orchestration.

## Project Structure

```
src
├─ models/
│   ├─ world_data.json  # Contains world data for analysis
│   
├─ models/
│   ├─ Result.ts        # Defines the Result entity
│   ├─ Task.ts          # Defines the Task entity
│   ├─ Workflow.ts      # Defines the Workflow entity
│   
├─ jobs/
│   ├─ Job.ts           # Job interface
│   ├─ JobFactory.ts    # getJobForTaskType function for mapping taskType to a Job
│   ├─ TaskRunner.ts    # Handles job execution & task/workflow state transitions
│   ├─ DataAnalysisJob.ts (example)
│   ├─ EmailNotificationJob.ts (example)
│
├─ workflows/
│   ├─ WorkflowFactory.ts  # Creates workflows & tasks from a YAML definition
│
├─ workers/
│   ├─ taskWorker.ts    # Background worker that fetches queued tasks & runs them
│
├─ routes/
│   ├─ analysisRoutes.ts # POST /analysis endpoint to create workflows
│   ├─ workflowRoutes.ts # GET /workflow/:id/status and GET /workflow/:id/results
│   ├─ defaultRoute.ts   # Default route
│
├─ data-source.ts       # TypeORM DataSource configuration
└─ index.ts             # Express.js server initialization & starting the worker
```

## API Endpoints

> **For detailed API documentation, see [API_DOCUMENTATION.md](API_DOCUMENTATION.md)**

> **A Postman collection is included: `Osapiens_API.postman_collection.json`**  
> Import this collection into Postman for easy testing with pre-configured requests and automatic variable management.

### Quick Reference

**POST /analysis**
- Creates a new workflow with tasks based on YAML configuration
- Returns `202 Accepted` with `workflowId`

**GET /workflow/:id/status**
- Retrieves workflow status and progress
- Returns `200 OK` with status, completedTasks, and totalTasks

**GET /workflow/:id/results**
- Retrieves final results of completed workflow
- Returns `200 OK` with aggregated task outputs
- Returns `400 Bad Request` if workflow is not yet completed

## Getting Started

### Prerequisites
- Node.js (LTS recommended)
- npm or yarn
- SQLite or another supported database

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/backend-coding-challenge.git
   cd backend-coding-challenge
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure TypeORM:**
    - Edit `data-source.ts` to ensure the `entities` array includes `Task` and `Workflow` entities.
    - Confirm database settings (e.g. SQLite file path).

4. **Create or Update the Workflow YAML:**
    - Place a YAML file (e.g. `example_workflow.yml`) in a `workflows/` directory.
    - Define steps, for example:
      ```yaml
      name: "example_workflow"
      steps:
        - taskType: "analysis"
          stepNumber: 1
        - taskType: "notification"
          stepNumber: 2
      ```

### Running the Application

1. **Compile TypeScript (optional if using `ts-node`):**
   ```bash
   npx tsc
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

   If using `ts-node`, this will start the Express.js server and the background worker after database initialization.

3. **Create a Workflow (e.g. via `/analysis`):**
   ```bash
   curl -X POST http://localhost:3005/analysis \
   -H "Content-Type: application/json" \
   -d '{
    "clientId": "client123",
    "geoJson": {
        "type": "Polygon",
        "coordinates": [
            [
                [
                    -63.624885020050996,
                    -10.311050368263523
                ],
                [
                    -63.624885020050996,
                    -10.367865108370523
                ],
                [
                    -63.61278302732815,
                    -10.367865108370523
                ],
                [
                    -63.61278302732815,
                    -10.311050368263523
                ],
                [
                    -63.624885020050996,
                    -10.311050368263523
                ]
            ]
        ]
    }
    }'
   ```

   This will read the configured workflow YAML, create a workflow and tasks, and queue them for processing.

4. **Check Logs:**
    - The worker picks up tasks from `queued` state.
    - `TaskRunner` runs the corresponding job (e.g., data analysis, email notification) and updates states.
    - Once tasks are done, the workflow is marked as `completed`.


### **Coding Challenge Tasks for the Interviewee**

The following tasks must be completed to enhance the backend system:

---

### **1. Add a New Job to Calculate Polygon Area**
**Objective:**  
Create a new job class to calculate the area of a polygon from the GeoJSON provided in the task.

#### **Steps:**
1. Create a new job file `PolygonAreaJob.ts` in the `src/jobs/` directory.
2. Implement the `Job` interface in this new class.
3. Use `@turf/area` to calculate the polygon area from the `geoJson` field in the task.
4. Save the result in the `output` field of the task.

#### **Requirements:**
- The `output` should include the calculated area in square meters.
- Ensure that the job handles invalid GeoJSON gracefully and marks the task as failed.

---

### **2. Add a Job to Generate a Report**
**Objective:**  
Create a new job class to generate a report by aggregating the outputs of multiple tasks in the workflow.

#### **Steps:**
1. Create a new job file `ReportGenerationJob.ts` in the `src/jobs/` directory.
2. Implement the `Job` interface in this new class.
3. Aggregate outputs from all preceding tasks in the workflow into a JSON report. For example:
   ```json
   {
       "workflowId": "<workflow-id>",
       "tasks": [
           { "taskId": "<task-1-id>", "type": "polygonArea", "output": "<area>" },
           { "taskId": "<task-2-id>", "type": "dataAnalysis", "output": "<analysis result>" }
       ],
       "finalReport": "Aggregated data and results"
   }
   ```
4. Save the report as the `output` of the `ReportGenerationJob`.

#### **Requirements:**
- Ensure the job runs only after all preceding tasks are complete.
- Handle cases where tasks fail, and include error information in the report.

---

### **3. Support Interdependent Tasks in Workflows**
**Objective:**  
Modify the system to support workflows with tasks that depend on the outputs of earlier tasks.

#### **Steps:**
1. Update the `Task` entity to include a `dependency` field that references another task
2. Modify the `TaskRunner` to wait for dependent tasks to complete and pass their outputs as inputs to the current task.
3. Extend the workflow YAML format to specify task dependencies (e.g., `dependsOn`).
4. Update the `WorkflowFactory` to parse dependencies and create tasks accordingly.

#### **Requirements:**
- Ensure dependent tasks do not execute until their dependencies are completed.
- Test workflows where tasks are chained through dependencies.

---

### **4. Ensure Final Workflow Results Are Properly Saved**
**Objective:**  
Save the aggregated results of all tasks in the workflow as the `finalResult` field of the `Workflow` entity.

#### **Steps:**
1. Modify the `Workflow` entity to include a `finalResult` field:
2. Aggregate the outputs of all tasks in the workflow after the last task completes.
3. Save the aggregated results in the `finalResult` field.

#### **Requirements:**
- The `finalResult` must include outputs from all completed tasks.
- Handle cases where tasks fail, and include failure information in the final result.

---

### **5. Create an Endpoint for Getting Workflow Status**
**Objective:**  
Implement an API endpoint to retrieve the current status of a workflow.

#### **Endpoint Specification:**
- **URL:** `/workflow/:id/status`
- **Method:** `GET`
- **Response Example:**
   ```json
   {
       "workflowId": "3433c76d-f226-4c91-afb5-7dfc7accab24",
       "status": "in_progress",
       "completedTasks": 3,
       "totalTasks": 5
   }
   ```

#### **Requirements:**
- Include the number of completed tasks and the total number of tasks in the workflow.
- Return a `404` response if the workflow ID does not exist.

---

### **6. Create an Endpoint for Retrieving Workflow Results**
**Objective:**  
Implement an API endpoint to retrieve the final results of a completed workflow.

#### **Endpoint Specification:**
- **URL:** `/workflow/:id/results`
- **Method:** `GET`
- **Response Example:**
   ```json
   {
       "workflowId": "3433c76d-f226-4c91-afb5-7dfc7accab24",
       "status": "completed",
       "finalResult": "Aggregated workflow results go here"
   }
   ```

#### **Requirements:**
- Return the `finalResult` field of the workflow if it is completed.
- Return a `404` response if the workflow ID does not exist.
- Return a `400` response if the workflow is not yet completed.

---

### **Deliverables**

#### **Completed Tasks:**
- ✅ **Task 1:** `PolygonAreaJob` - Calculate polygon area using @turf/area
- ✅ **Task 2:** `ReportGenerationJob` - Aggregate outputs from all tasks
- ✅ **Task 3:** Interdependent tasks support with `dependsOn` field and YAML configuration
- ✅ **Task 4:** Workflow final results aggregation and storage
- ✅ **Task 5:** `GET /workflow/:id/status` endpoint implementation
- ✅ **Task 6:** `GET /workflow/:id/results` endpoint implementation

#### **Implementation Highlights:**
- **New Jobs:** 
  - `PolygonAreaJob.ts` - Calculates polygon area in square meters
  - `ReportGenerationJob.ts` - Generates aggregated report from all task outputs
  - `DataAnalysisJob.ts` - Performs geospatial analysis using @turf/boolean-within
  - `EmailNotificationJob.ts` - Email notification placeholder

- **Enhanced Workflow Support:**
  - Task dependencies via `dependsOn` field in YAML configuration
  - Automatic dependency resolution in `WorkflowFactory`
  - Sequential task execution based on dependency chain

- **API Endpoints:**
  - `POST /analysis` - Create workflow from YAML definition
  - `GET /workflow/:id/status` - Get workflow progress and status
  - `GET /workflow/:id/results` - Get final aggregated results (only when completed)

- **Testing Resources:**
  - Postman collection: `Osapiens_API.postman_collection.json`
  - Detailed API documentation: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
  - Example workflow YAML: `src/workflows/example_workflow.yml`

---

## Quick Testing Guide

### Using Postman Collection (Recommended)

1. **Import the Collection:**
   - Open Postman
   - Click "Import" and select `Osapiens_API.postman_collection.json`

2. **Run with Collection Runner:**
   - Click on the collection and select "Run"
   - Configure:
     - Iterations: 1
     - Delay: 3000-5000 ms (to allow workflow to complete)
   - Click "Start Run"

3. **Manual Testing:**
   - Run "1. Create Workflow (Analysis)" - saves `workflowId` automatically
   - Run "2. Get Workflow Status" - uses saved `workflowId`
   - Run "3. Get Workflow Results" - retrieves final aggregated results

### Expected Workflow

```
1. POST /analysis → Returns workflowId
   ↓
2. Background worker processes tasks:
   - analysis (identify country)
   - polygonArea (calculate area)
   - notification (send email)
   - report (aggregate results)
   ↓
3. GET /workflow/:id/status → Check progress
   ↓
4. GET /workflow/:id/results → Get final results (when completed)
```

For detailed endpoint documentation, see [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

---

## Testing the Implemented Features

### **Prerequisites**
- Server running on `http://localhost:3005`
- Postman, Pluto, or similar HTTP client
- DB Browser for SQLite (optional, for database inspection)
- Node.js 22 LTS or higher

---

### **Feature 1: PolygonAreaJob - Calculate Polygon Area**

#### **Test Case 1: Valid Polygon (Success)**

**Request:**
```http
POST http://localhost:3005/analysis
Content-Type: application/json

{
  "clientId": "test-polygon-area",
  "geoJson": {
    "type": "Polygon",
    "coordinates": [
      [
        [-63.624885020050996, -10.311050368263523],
        [-63.624885020050996, -10.367865108370523],
        [-63.61278302732815, -10.367865108370523],
        [-63.61278302732815, -10.311050368263523],
        [-63.624885020050996, -10.311050368263523]
      ]
    ]
  }
}
```

**Expected Response:**
```json
{
  "workflowId": "uuid-here",
  "message": "Workflow created and tasks queued from YAML definition."
}
```

**Verification:**
- **Server Logs:** Should show `Area calculated: 8363324.273315565 square meters`
- **Database (tasks table):** 
  - Task with `taskType = 'polygonArea'` should have:
    - `status = 'completed'`
    - `output = '{"areaInSquareMeters": 8363324.273315565}'`

#### **Test Case 2: Invalid GeoJSON (Error Handling)**

**Request:**
```http
POST http://localhost:3005/analysis
Content-Type: application/json

{
  "clientId": "test-invalid-geojson",
  "geoJson": {
    "type": "LineString",
    "coordinates": [
      [-63.62, -10.31],
      [-63.61, -10.36]
    ]
  }
}
```

**Expected Response:**
```json
{
  "workflowId": "uuid-here",
  "message": "Workflow created and tasks queued from YAML definition."
}
```

**Verification:**
- **Server Logs:** Should show `Error calculating area: GeoJSON must be of type Polygon.`
- **Database (tasks table):**
  - Task with `taskType = 'polygonArea'` should have:
    - `status = 'failed'`
    - `output = '{"error": "GeoJSON must be of type Polygon."}'`
- **Database (workflows table):**
  - Workflow `status = 'failed'`

---

### **Feature 2: ReportGenerationJob - Aggregate Task Outputs**

**Request:** Same as Feature 1, Test Case 1 (valid polygon)

**Verification:**

**Server Logs:**
```
Generating report for task <uuid>...
Found 4 tasks in workflow <workflow-uuid>
Report generated with 3 tasks
Job report for task <uuid> completed successfully.
```

**Database (tasks table):**
- Task with `taskType = 'report'` should have:
  - `status = 'completed'`
  - `output` containing:
    ```json
    {
      "workflowId": "uuid-here",
      "tasks": [
        {
          "taskId": "uuid-1",
          "type": "analysis",
          "status": "completed",
          "output": "Brazil"
        },
        {
          "taskId": "uuid-2",
          "type": "polygonArea",
          "status": "completed",
          "output": {
            "areaInSquareMeters": 8363324.273315565
          }
        },
        {
          "taskId": "uuid-3",
          "type": "notification",
          "status": "completed",
          "output": null
        }
      ],
      "finalReport": "Aggregated data and results from all tasks"
    }
    ```

**Note:** The report task itself is NOT included in the aggregated results.

---

### **Feature 3: Interdependent Tasks**

#### **Configuration**

The workflow YAML (`src/workflows/example_workflow.yml`) defines task dependencies:

```yaml
name: "example_workflow"
steps:
  - taskType: "analysis"
    stepNumber: 1
    
  - taskType: "polygonArea"
    stepNumber: 2
    dependsOn: "analysis"
    
  - taskType: "notification"
    stepNumber: 3
    dependsOn: "polygonArea"
  
  - taskType: "report"
    stepNumber: 4
    dependsOn: "notification"
```

**Request:** Same as Feature 1, Test Case 1

**Verification:**

**Server Logs (expected execution order):**
```
Task polygonArea depends on analysis (uuid-xxx)
Task notification depends on polygonArea (uuid-yyy)
Task report depends on notification (uuid-zzz)

Starting job analysis for task uuid-1...
Running data analysis for task uuid-1...
The polygon is within Brazil
Job analysis for task uuid-1 completed successfully.

Starting job polygonArea for task uuid-2...
Calculating polygon area for task uuid-2...
Area calculated: 8363324.273315565 square meters
Job polygonArea for task uuid-2 completed successfully.

Starting job notification for task uuid-3...
Task notification gets the output from polygonArea
Sending email notification for task uuid-3...
Email sent!
Job notification for task uuid-3 completed successfully.

Starting job report for task uuid-4...
Generating report for task uuid-4...
Found 4 tasks in workflow <workflow-uuid>
Report generated with 3 tasks
Job report for task uuid-4 completed successfully.
```

**Database (tasks table) - Check `dependsOn` column:**
- `analysis` task: `dependsOn = NULL` (no dependency)
- `polygonArea` task: `dependsOn = <uuid-of-analysis>`
- `notification` task: `dependsOn = <uuid-of-polygonArea>`
- `report` task: `dependsOn = <uuid-of-notification>`

**Expected Behavior:**
- Tasks execute in **sequential order** based on `stepNumber` (1 → 2 → 3 → 4)
- Each task **waits** for its dependency to complete before executing
- No task executes before its dependency is `completed`
- Total execution time: ~15-20 seconds (5 seconds between each task)

---

### **Feature 4: Workflow Final Results**

**Request:** Same as Feature 1, Test Case 1

**Verification:**

**Server Logs:**
```
Workflow <uuid> completed. Final result saved.
```

**Database (workflows table):**
- `workflowId`: The UUID returned in the POST response
- `status`: `completed`
- `finalResult`: Should contain the complete aggregated report (same as report task output):
  ```json
  {
    "workflowId": "uuid-here",
    "tasks": [
      {
        "taskId": "...",
        "type": "analysis",
        "status": "completed",
        "output": "Brazil"
      },
      {
        "taskId": "...",
        "type": "polygonArea",
        "status": "completed",
        "output": {
          "areaInSquareMeters": 8363324.273315565
        }
      },
      {
        "taskId": "...",
        "type": "notification",
        "status": "completed",
        "output": null
      }
    ],
    "finalReport": "Aggregated data and results from all tasks"
  }
  ```

**Key Points:**
- The `finalResult` is automatically populated when the workflow completes
- It uses the output from the `report` task
- If the workflow fails, `finalResult` contains error information from all tasks

---

### **Feature 5: GET /workflow/:id/status - Workflow Status Endpoint**

This endpoint allows you to check the current status of a workflow and track its progress.

#### **Test Case 1: Get Status of In-Progress Workflow**

**Prerequisites:** Create a workflow using the POST /analysis endpoint from Feature 1

**Request:**
```http
GET http://localhost:3005/workflow/{workflowId}/status
```

Replace `{workflowId}` with the UUID returned from the POST /analysis request.

**Expected Response (while in progress):**
```json
{
  "workflowId": "3433c76d-f226-4c91-afb5-7dfc7accab24",
  "status": "in_progress",
  "completedTasks": 2,
  "totalTasks": 4
}
```

**Expected Response (when completed):**
```json
{
  "workflowId": "3433c76d-f226-4c91-afb5-7dfc7accab24",
  "status": "completed",
  "completedTasks": 4,
  "totalTasks": 4
}
```

#### **Test Case 2: Get Status of Non-Existent Workflow**

**Request:**
```http
GET http://localhost:3005/workflow/non-existent-uuid/status
```

**Expected Response:**
```json
{
  "message": "Workflow not found"
}
```

**HTTP Status:** `404 Not Found`

**Key Points:**
- Returns current workflow status and task completion progress
- `completedTasks` counts tasks with status = 'completed'
- `totalTasks` is the total number of tasks in the workflow
- Useful for building progress indicators in frontend applications

---

### **Feature 6: GET /workflow/:id/results - Workflow Results Endpoint**

This endpoint retrieves the final aggregated results of a completed workflow.

#### **Test Case 1: Get Results of Completed Workflow**

**Prerequisites:** 
1. Create a workflow using POST /analysis
2. Wait ~15-20 seconds for workflow to complete
3. Verify completion using GET /workflow/:id/status

**Request:**
```http
GET http://localhost:3005/workflow/{workflowId}/results
```

**Expected Response:**
```json
{
  "workflowId": "3433c76d-f226-4c91-afb5-7dfc7accab24",
  "status": "completed",
  "finalResult": "{\"workflowId\":\"3433c76d-f226-4c91-afb5-7dfc7accab24\",\"tasks\":[{\"taskId\":\"...\",\"type\":\"analysis\",\"status\":\"completed\",\"output\":\"Brazil\"},{\"taskId\":\"...\",\"type\":\"polygonArea\",\"status\":\"completed\",\"output\":\"{\\\"areaInSquareMeters\\\":8363324.273315565}\"},{\"taskId\":\"...\",\"type\":\"notification\",\"status\":\"completed\",\"output\":null}],\"finalReport\":\"Aggregated data and results from all tasks\"}"
}
```

**Note:** The `finalResult` is a JSON string containing the complete workflow report.

#### **Test Case 2: Get Results of In-Progress Workflow**

**Request:**
```http
GET http://localhost:3005/workflow/{workflowId}/results
```

**Expected Response:**
```json
{
  "message": "Workflow is not yet completed",
  "currentStatus": "in_progress"
}
```

**HTTP Status:** `400 Bad Request`

#### **Test Case 3: Get Results of Non-Existent Workflow**

**Request:**
```http
GET http://localhost:3005/workflow/non-existent-uuid/results
```

**Expected Response:**
```json
{
  "message": "Workflow not found"
}
```

**HTTP Status:** `404 Not Found`

**Key Points:**
- Only returns results for completed workflows
- Returns 400 if workflow exists but is not completed
- Returns 404 if workflow does not exist
- `finalResult` contains the aggregated output from all tasks
- The result is generated by the `ReportGenerationJob`

---

## Database Inspection

To inspect the database during testing:

1. **Open DB Browser for SQLite**
2. **File → Open Database** → Navigate to `data/database.sqlite`
3. **Browse Data tab** → Select table:
   - **`workflows`** - View workflow status and `finalResult`
   - **`tasks`** - View individual task status, `output`, and `dependsOn`
   - **`results`** - View legacy result records
4. **Click Refresh** button after each test to see updated data

**Useful SQL Queries:**

```sql
-- View all workflows with their status
SELECT workflowId, clientId, status FROM workflows;

-- View all tasks for a specific workflow
SELECT taskType, stepNumber, status, dependsOn 
FROM tasks 
WHERE workflowWorkflowId = 'your-workflow-id' 
ORDER BY stepNumber;

-- View task outputs
SELECT taskType, status, output FROM tasks ORDER BY stepNumber;
```

---

## Common Testing Scenarios

### **Scenario 1: Clean Start**

Recommended for testing to avoid conflicts with old data.

```powershell
# Stop the server (Ctrl+C)
Remove-Item data\database.sqlite
npm start
# Send POST request to /analysis
```

### **Scenario 2: Monitor Real-time Execution**

Watch the server logs while sending requests to see tasks execute in real-time.

```powershell
# Server logs will show:
# - Task dependencies being resolved
# - Jobs starting and completing
# - Workflow status updates
# - Tasks execute every ~5 seconds in background
# - Total workflow completion: ~15-20 seconds for 4 tasks
```

### **Scenario 3: Test Error Handling**

Test how the system handles invalid input and failures.

```powershell
# Send invalid GeoJSON (LineString instead of Polygon)
# Expected results:
# - polygonArea task: status = 'failed'
# - Workflow: status = 'failed'
# - Error message saved in task output
# - Other tasks may still complete if they don't depend on the failed task
```

### **Scenario 4: Test Multiple Workflows**

```powershell
# Send multiple POST requests to /analysis
# Each creates a separate workflow
# All workflows execute in parallel
# Tasks within each workflow execute sequentially based on dependencies
```

---

## Troubleshooting

### **Issue: Tasks not executing**
- Check that the server is running and logs show "Server is running at http://localhost:3005"
- Verify the database file exists: `data/database.sqlite`
- Check for errors in server logs

### **Issue: Tasks executing in wrong order**
- Verify `dependsOn` fields in database are correctly set to task UUIDs (not taskTypes)
- Check that `example_workflow.yml` has correct dependency definitions
- Ensure `stepNumber` values are sequential

### **Issue: Database errors**
- Delete the database file and restart: `Remove-Item data\database.sqlite`
- Check that all entities are properly defined in `data-source.ts`
- Verify TypeORM synchronize is set to `true` during development

---

## Additional Documentation

For a detailed explanation of the workflow execution flow, see [WORKFLOW_EXECUTION_FLOW.md](WORKFLOW_EXECUTION_FLOW.md).
