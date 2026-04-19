import { Router, Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Workflow } from '../models/Workflow';

const router = Router();

// GET /workflow/:id/status
router.get('/:id/status', async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const workflowRepository = AppDataSource.getRepository(Workflow);
        const workflow = await workflowRepository.findOne({
            where: { workflowId: id },
            relations: ['tasks']
        });

        if (!workflow) {
            res.status(404).json({ 
                message: 'Workflow not found' 
            });
            return;
        }

        const completedTasks = workflow.tasks.filter(task => task.status === 'completed').length;
        const totalTasks = workflow.tasks.length;

        res.status(200).json({
            workflowId: workflow.workflowId,
            status: workflow.status,
            completedTasks,
            totalTasks
        });
    } catch (error: any) {
        console.error('Error fetching workflow status:', error);
        res.status(500).json({ message: 'Failed to fetch workflow status' });
    }
});

// GET /workflow/:id/results
router.get('/:id/results', async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const workflowRepository = AppDataSource.getRepository(Workflow);
        const workflow = await workflowRepository.findOne({
            where: { workflowId: id }
        });

        if (!workflow) {
            res.status(404).json({ 
                message: 'Workflow not found' 
            });
            return;
        }

        if (workflow.status !== 'completed') {
            res.status(400).json({ 
                message: 'Workflow is not yet completed',
                currentStatus: workflow.status
            });            return;        }

        res.status(200).json({
            workflowId: workflow.workflowId,
            status: workflow.status,
            finalResult: workflow.finalResult 
                ? (typeof workflow.finalResult === 'string' 
                    ? JSON.parse(workflow.finalResult) 
                    : workflow.finalResult)
                : null
        });
    } catch (error: any) {
        console.error('Error fetching workflow results:', error);
        res.status(500).json({ message: 'Failed to fetch workflow results' });
    }
});

export default router;
