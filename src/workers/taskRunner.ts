import { Repository } from 'typeorm';
import { Task } from '../models/Task';
import { getJobForTaskType } from '../jobs/JobFactory';
import {WorkflowStatus} from "../workflows/WorkflowFactory";
import {Workflow} from "../models/Workflow";
import {Result} from "../models/Result";

export enum TaskStatus {
    Queued = 'queued',
    InProgress = 'in_progress',
    Completed = 'completed',
    Failed = 'failed'
}

export class TaskRunner {
    constructor(
        private taskRepository: Repository<Task>,
    ) {}

    /**
     * Runs the appropriate job based on the task's type, managing the task's status.
     * @param task - The task entity that determines which job to run.
     * @throws If the job fails, it rethrows the error.
     */
    async run(task: Task): Promise<void> {
        // Check if task has dependencies
        if (task.dependsOn) {
            const previousTask = await this.taskRepository.findOne({
                where: { taskId: task.dependsOn }
            });

            if (!previousTask) {
                throw new Error(`Previous task ${task.dependsOn} not found`);
            }

            if (previousTask.status !== TaskStatus.Completed) {
                throw new Error(`Previous task ${previousTask.taskType} is not completed yet (status: ${previousTask.status})`);
            }

            // Pass the output of the dependent task as input to current task
            if (previousTask.output) {
                console.log(`Task ${task.taskType} gets the output from ${previousTask.taskType}`);
                task.progress = `Previous ${previousTask.taskType} completed`;
            }
        }

        task.status = TaskStatus.InProgress;
        task.progress = 'Starting job...';
        await this.taskRepository.save(task);
        const job = getJobForTaskType(task.taskType);

        try {
            console.log(`Starting job ${task.taskType} for task ${task.taskId}...`);
            const resultRepository = this.taskRepository.manager.getRepository(Result);
            const taskResult = await job.run(task);
            console.log(`Job ${task.taskType} for task ${task.taskId} completed successfully.`);
            const result = new Result();
            result.taskId = task.taskId!;
            result.data = JSON.stringify(taskResult || {});
            await resultRepository.save(result);
            task.resultId = result.resultId!;
            task.status = TaskStatus.Completed;
            task.progress = null;
            await this.taskRepository.save(task);

        } catch (error: any) {
            console.error(`Error running job ${task.taskType} for task ${task.taskId}:`, error);

            task.status = TaskStatus.Failed;
            task.progress = null;
            await this.taskRepository.save(task);

            throw error;
        }

        const workflowRepository = this.taskRepository.manager.getRepository(Workflow);
        const currentWorkflow = await workflowRepository.findOne({ 
          where: { workflowId: task.workflow.workflowId }, 
          relations: ['tasks'] 
        });

        if (currentWorkflow) {
            const allCompleted = currentWorkflow.tasks.every(t => t.status === TaskStatus.Completed);
            const anyFailed = currentWorkflow.tasks.some(t => t.status === TaskStatus.Failed);

            if (anyFailed) {
                // Aggregate results even if failed, including error information
                const failedResults = currentWorkflow.tasks.map(t => ({
                    taskId: t.taskId,
                    taskType: t.taskType,
                    status: t.status,
                    output: t.output ? JSON.parse(t.output) : null
                }));
                currentWorkflow.finalResult = JSON.stringify({
                    workflowId: currentWorkflow.workflowId,
                    status: 'failed',
                    tasks: failedResults
                }, null, 2);
            } else if (allCompleted) {
                 currentWorkflow.status = WorkflowStatus.Completed;
        
                // Find the report task and use its output as finalResult
                const reportTask = currentWorkflow.tasks.find(t => t.taskType === 'report');
                if (reportTask && reportTask.output) {
                    currentWorkflow.finalResult = reportTask.output;
                    console.log(`Workflow ${currentWorkflow.workflowId} completed. Final result saved.`);
                } else {
                    // If no report task, aggregate all task outputs
                    const aggregatedResults = currentWorkflow.tasks.map(t => ({
                        taskId: t.taskId,
                        taskType: t.taskType,
                        status: t.status,
                        output: t.output ? JSON.parse(t.output) : null
                    }));
                    currentWorkflow.finalResult = JSON.stringify({
                        workflowId: currentWorkflow.workflowId,
                        status: 'completed',
                        tasks: aggregatedResults
                    }, null, 2);
                }
            } else {
                currentWorkflow.status = WorkflowStatus.InProgress;
            }

            await workflowRepository.save(currentWorkflow);
        }
    }
}