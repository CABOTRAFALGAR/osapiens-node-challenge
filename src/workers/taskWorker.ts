import {AppDataSource} from '../data-source';
import {Task} from '../models/Task';
import {TaskRunner, TaskStatus} from './taskRunner';

export async function taskWorker() {
    const taskRepository = AppDataSource.getRepository(Task);
    const taskRunner = new TaskRunner(taskRepository);

    while (true) {
        // Find the queued task with the LOWEST stepNumber
        const task = await taskRepository.findOne({
            where: { status: TaskStatus.Queued },
            order: { stepNumber: 'ASC' }, // ← IMPORTANTE: orden por stepNumber
            relations: ['workflow']
        });

        if (task) {
            try {
                await taskRunner.run(task);

            } catch (error) {
                // Error esperado si las dependencias no están listas
                // La task sigue queued y se reintentará en el próximo ciclo
            }
        }

        // Wait before checking for the next task again
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}
