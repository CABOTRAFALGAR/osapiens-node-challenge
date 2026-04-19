import { Job } from './Job';
import { Task } from '../models/Task';
import { AppDataSource } from '../data-source';

export class ReportGenerationJob implements Job {
    async run(task: Task): Promise<void> {
        console.log(`Generating report for task ${task.taskId}...`);

        try {
            // Get the task repository from AppDataSource
            const taskRepository = AppDataSource.getRepository(Task);

            // Get all tasks from the current workflow
            const allTasks = await taskRepository.find({
                where: { workflow: { workflowId: task.workflow.workflowId } },
                order: { stepNumber: 'ASC' }
            });

            console.log(`Found ${allTasks.length} tasks in workflow ${task.workflow.workflowId}`);

            // Filter only preceding tasks (exclude current task)
            const precedingTasks = allTasks.filter(t => t.taskId !== task.taskId);

            // Build the report
            const report = {
                workflowId: task.workflow.workflowId,
                tasks: precedingTasks.map(t => ({
                    taskId: t.taskId,
                    type: t.taskType,
                    status: t.status,
                    output: t.output ? JSON.parse(t.output) : null
                })),
                finalReport: "Aggregated data and results from all tasks"
            };

            // Save the report as output
            task.output = JSON.stringify(report, null, 2);

            console.log(`Report generated with ${precedingTasks.length} tasks`);

        } catch (error: any) {
            console.error(`Error generating report: ${error.message}`);
            task.output = JSON.stringify({ error: error.message });
            throw error;
        }
    }
}
