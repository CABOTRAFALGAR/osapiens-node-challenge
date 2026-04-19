import { Job } from './Job';
import { Task } from '../models/Task';
import * as turf from '@turf/turf';

export class PolygonAreaJob implements Job {
    async run(task: Task): Promise<void> {
        console.log(`Calculating polygon area for task ${task.taskId}...`);

        try {
            // Parse the GeoJSON input
            const geoJson = JSON.parse(task.geoJson);

            // Validate that the GeoJSON is a Polygon
            if (geoJson.type !== 'Polygon') {
                throw new Error('GeoJSON must be of type Polygon.');
            }

            // Calculate the area using Turf.js
            const area = turf.area(geoJson);
            
            // Update the task with the result
            task.output = JSON.stringify({
              areaInSquareMeters: area
            });

            console.log(`Area calculated: ${area} square meters`);

        } catch (error: any) {
            console.error(`Error calculating area: ${error.message}`);
            task.output = JSON.stringify({ error: error.message });
            throw error; // TaskRunner will handle the error and update the task status to failed
        }
    }
}
