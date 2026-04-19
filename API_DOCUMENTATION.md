# API Documentation

This document provides detailed documentation for the workflow management API endpoints.

## Quick Start with Postman

A Postman collection is included in the project root: `Osapiens_API.postman_collection.json`

**To use:**
1. Import the collection into Postman
2. The collection includes 3 requests with automatic variable management
3. Run them in sequence or use the Collection Runner with a 3-5 second delay between requests

---

## Base URL

```
http://localhost:3005
```

---

## Endpoints

### 1. Create Workflow (Analysis)

Creates a new workflow with tasks defined in the YAML configuration file.

**Endpoint:** `POST /analysis`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
    "clientId": "string",
    "geoJson": {
        "type": "Feature",
        "properties": {
            "name": "string (optional)"
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [longitude, latitude],
                    [longitude, latitude],
                    [longitude, latitude],
                    [longitude, latitude],
                    [longitude, latitude]
                ]
            ]
        }
    }
}
```

**Supported GeoJSON Formats:**
- `Feature<Polygon>` (recommended)
- `Polygon` (raw geometry)

**Example Request:**
```json
{
    "clientId": "client-123",
    "geoJson": {
        "type": "Feature",
        "properties": {
            "name": "Test Area"
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [-74.006, 40.7128],
                    [-74.006, 40.7228],
                    [-73.996, 40.7228],
                    [-73.996, 40.7128],
                    [-74.006, 40.7128]
                ]
            ]
        }
    }
}
```

**Success Response:** `202 Accepted`
```json
{
    "workflowId": "a4cacb4d-7bba-4cf0-9a7e-41177c863491",
    "message": "Workflow created and tasks queued from YAML definition."
}
```

**Error Responses:**
- `400 Bad Request` - Invalid request body
- `500 Internal Server Error` - Failed to create workflow

**Notes:**
- The workflow is created asynchronously
- Tasks are queued for execution by the background worker
- Save the `workflowId` for subsequent status and results queries

---

### 2. Get Workflow Status

Retrieves the current status and progress of a workflow.

**Endpoint:** `GET /workflow/:id/status`

**Path Parameters:**
- `id` (string, required) - The workflow ID returned from the create workflow endpoint

**Example Request:**
```
GET /workflow/a4cacb4d-7bba-4cf0-9a7e-41177c863491/status
```

**Success Response:** `200 OK`
```json
{
    "workflowId": "a4cacb4d-7bba-4cf0-9a7e-41177c863491",
    "status": "in-progress",
    "completedTasks": 2,
    "totalTasks": 4
}
```

**Response Fields:**
- `workflowId` (string) - The unique identifier of the workflow
- `status` (string) - Current status of the workflow
  - `initial` - Workflow created, tasks not yet started
  - `in_progress` - One or more tasks are being executed
  - `completed` - All tasks completed successfully
  - `failed` - One or more tasks failed
- `completedTasks` (number) - Number of tasks completed
- `totalTasks` (number) - Total number of tasks in the workflow

**Error Responses:**
- `404 Not Found` - Workflow does not exist
  ```json
  {
      "message": "Workflow not found"
  }
  ```
- `500 Internal Server Error` - Failed to fetch workflow status

**Notes:**
- This endpoint can be called multiple times to track progress
- Use this endpoint to poll for workflow completion before calling the results endpoint

---

### 3. Get Workflow Results

Retrieves the final results of a completed workflow.

**Endpoint:** `GET /workflow/:id/results`

**Path Parameters:**
- `id` (string, required) - The workflow ID returned from the create workflow endpoint

**Example Request:**
```
GET /workflow/a4cacb4d-7bba-4cf0-9a7e-41177c863491/results
```

**Success Response:** `200 OK`
```json
{
    "workflowId": "a4cacb4d-7bba-4cf0-9a7e-41177c863491",
    "status": "completed",
    "finalResult": {
        "workflowId": "a4cacb4d-7bba-4cf0-9a7e-41177c863491",
        "tasks": [
            {
                "taskId": "7e215aa5-c80f-4421-8e56-94496d813f60",
                "type": "analysis",
                "status": "completed",
                "output": "United States"
            },
            {
                "taskId": "a88bf11f-25b3-4084-a8e5-01b6f1eb99f6",
                "type": "polygonArea",
                "status": "completed",
                "output": {
                    "areaInSquareMeters": 8363324.273315565
                }
            },
            {
                "taskId": "efa828bf-07ec-4912-af19-5bbf5c7b1eb0",
                "type": "notification",
                "status": "completed",
                "output": null
            },
            {
                "taskId": "2f3a9c8d-4b1e-4f2a-9d3c-7e8f9a0b1c2d",
                "type": "report",
                "status": "completed",
                "output": null
            }
        ],
        "finalReport": "Aggregated data and results from all tasks"
    }
}
```

**Response Fields:**
- `workflowId` (string) - The unique identifier of the workflow
- `status` (string) - Should always be "completed" for successful responses
- `finalResult` (object) - Aggregated results from all tasks
  - `workflowId` (string) - The workflow ID
  - `tasks` (array) - List of all tasks with their outputs
  - `finalReport` (string) - Summary report of the workflow execution

**Error Responses:**

- `404 Not Found` - Workflow does not exist
  ```json
  {
      "message": "Workflow not found"
  }
  ```

- `400 Bad Request` - Workflow is not yet completed
  ```json
  {
      "message": "Workflow is not yet completed",
      "currentStatus": "in_progress"
  }
  ```

- `500 Internal Server Error` - Failed to fetch workflow results

**Notes:**
- This endpoint only returns results for completed workflows
- If the workflow is still in progress, use the status endpoint to monitor completion
- The `finalResult` is automatically parsed from JSON string to object

---

## Workflow Execution Flow

1. **Create Workflow** - Client sends POST request to `/analysis` with clientId and geoJson
2. **Workflow Created** - System creates workflow and queues tasks based on YAML definition
3. **Background Processing** - Worker processes tasks asynchronously, respecting dependencies
4. **Monitor Progress** - Client polls `/workflow/:id/status` to track completion
5. **Retrieve Results** - Once completed, client calls `/workflow/:id/results` to get final output

## Task Types

The workflow supports the following task types (defined in `example_workflow.yml`):

- **analysis** - Performs geospatial analysis to determine which country the polygon is within
- **polygonArea** - Calculates the area of the polygon in square meters
- **notification** - Sends email notification (placeholder implementation)
- **report** - Generates final report aggregating all task results

## Testing with Postman Collection Runner

1. Import `Osapiens_API.postman_collection.json` into Postman
2. Open the collection and click "Run"
3. Configure the runner:
   - **Iterations:** 1
   - **Delay:** 3000-5000 ms (3-5 seconds between requests)
   - Enable "Persist responses for a session"
   - Enable "Save cookies after collection run"
4. Click "Start Run"

The collection automatically:
- Creates a workflow and saves the `workflowId`
- Waits (delay period)
- Checks the workflow status
- Waits (delay period)
- Retrieves the final results

## Error Handling

All endpoints follow consistent error response format:

```json
{
    "message": "Error description"
}
```

Additional fields may be included depending on the error type (e.g., `currentStatus` for workflow not completed).

## Rate Limiting

Currently, no rate limiting is implemented. Consider adding rate limiting for production use.

## Authentication

Currently, no authentication is required. For production deployment, implement proper authentication and authorization mechanisms.
