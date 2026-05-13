# TaskVerify Backend API Documentation

## Base URL
```
http://localhost:3001/api/v1
```

## Authentication
Currently, API endpoints are open. Authentication layer (JWT/API Keys) will be added in production.

## Response Format
All responses are JSON with the following structure:

**Success:**
```json
{
  "data": { ... },
  "message": "Operation successful"
}
```

**Error:**
```json
{
  "error": "Error message",
  "status": 400
}
```

---

## Tasks Endpoints

### List Tasks
```
GET /tasks
```

**Query Parameters:**
- `status` (optional): Filter by status (posted, assigned, submitted, verified, funded, completed, disputed, cancelled)
- `location` (optional): Filter by location (partial string match)

**Example:**
```
GET /tasks?status=posted&location=Akure
```

**Response:**
```json
[
  {
    "id": 1,
    "task_uuid": "uuid-string",
    "title": "House Cleaning",
    "description": "Clean a 2-bedroom apartment",
    "required_skills": ["cleaning", "physical-labor"],
    "amount_naira": 15000,
    "status": "posted",
    "task_location": "Akure, Ondo State",
    "location_latitude": 7.2571,
    "location_longitude": 5.1944,
    "due_date": "2024-05-20T23:59:59Z",
    "deliverable_spec": { ... },
    "created_at": "2024-05-13T10:00:00Z"
  }
]
```

### Get Task Details
```
GET /tasks/:id
```

**Response:** Single task object (see above)

### Create Task
```
POST /tasks
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "House Cleaning",
  "description": "Clean a 2-bedroom apartment thoroughly",
  "client_name": "John Doe",
  "client_email": "john@example.com",
  "required_skills": ["cleaning", "physical-labor"],
  "amount_naira": 15000,
  "task_location": "Akure, Ondo State",
  "location_latitude": 7.2571,
  "location_longitude": 5.1944,
  "due_date": "2024-05-20T23:59:59Z",
  "deliverable_spec": {
    "type": "cleaning",
    "rooms": 2,
    "checklist": [
      "Dust all surfaces",
      "Vacuum floors",
      "Clean bathrooms",
      "Mop floors"
    ]
  }
}
```

**Response:**
```json
{
  "task": { ... },
  "matches": [
    {
      "worker_id": 1,
      "name": "Amaka O.",
      "match_score": 92,
      "reasons": ["2 skill matches", "Rating: 4.8/5", "Distance: 2km"],
      "distance_km": 2.3
    }
  ]
}
```

### Assign Worker to Task
```
POST /tasks/:id/assign
Content-Type: application/json
```

**Request Body:**
```json
{
  "worker_id": 1
}
```

**Response:**
```json
{
  "task": { ... },
  "escrow": {
    "squad_va_number": "1234567890",
    "squad_bank_code": "058",
    "squad_bank_name": "Guaranty Trust Bank"
  }
}
```

### Submit Task Completion Proof
```
POST /tasks/:id/submit-proof
Content-Type: application/json
```

**Request Body:**
```json
{
  "proof_submission": {
    "images": [
      "https://example.com/before.jpg",
      "https://example.com/after.jpg"
    ],
    "description": "Completed all items in the checklist",
    "completed_at": "2024-05-18T14:30:00Z"
  }
}
```

**Response:** Updated task object

### Get Task Status
```
GET /tasks/:id/status
```

**Response:**
```json
{
  "id": 1,
  "status": "submitted",
  "assigned_worker_id": 1,
  "submitted_at": "2024-05-18T14:30:00Z",
  "verified_at": null
}
```

---

## Workers Endpoints

### List Workers
```
GET /workers
```

**Query Parameters:**
- `location` (optional): Filter by location
- `skill` (optional): Filter by skill (exact match)
- `minRating` (optional): Filter by minimum rating (0-5)

**Example:**
```
GET /workers?location=Akure&skill=cleaning&minRating=4.5
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Amaka O.",
    "email": "amaka@taskverify.app",
    "phone": "08012345601",
    "skills": ["cleaning", "physical-labor", "laundry"],
    "bio": "Professional house cleaner with 5 years experience",
    "primary_location": "Akure, Ondo State",
    "latitude": 7.2571,
    "longitude": 5.1944,
    "avatar_url": null,
    "trust_score": 847,
    "tasks_completed": 47,
    "tasks_successful": 45,
    "on_time_rate": 96,
    "avg_rating": 4.8,
    "total_earnings": 234500,
    "current_month_earnings": 67200,
    "is_active": true,
    "created_at": "2024-05-01T10:00:00Z"
  }
]
```

### Get Worker Profile
```
GET /workers/:id
```

**Response:** Single worker object (see above)

### Create Worker Profile
```
POST /workers
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Chidi Okafor",
  "email": "chidi@example.com",
  "phone": "08098765432",
  "skills": ["delivery", "dispatch"],
  "bio": "Professional courier with 3 years experience",
  "primary_location": "Lagos, Lagos State",
  "latitude": 6.5244,
  "longitude": 3.3792,
  "avatar_url": "https://example.com/avatar.jpg"
}
```

**Response:** Created worker object

### Update Worker Profile
```
PUT /workers/:id
Content-Type: application/json
```

**Request Body:** (Only fields to update)
```json
{
  "phone": "08098765433",
  "bio": "Professional courier with 4 years experience",
  "skills": ["delivery", "dispatch", "errands"]
}
```

**Response:** Updated worker object

### Get Worker Statistics
```
GET /workers/:id/stats
```

**Response:**
```json
{
  "tasks_completed": 47,
  "tasks_successful": 45,
  "on_time_rate": 96,
  "avg_rating": 4.8,
  "total_earnings": 234500,
  "current_month_earnings": 67200,
  "trust_score": 847
}
```

---

## Webhooks Endpoints

### Squad Webhook
```
POST /webhooks/squad
Content-Type: application/json
X-Squad-Signature: [HMAC signature]
```

**Handles Events:**
- `payment.successful` - Payment received in escrow
- `virtual_account.funded` - Virtual account credited
- `transfer.completed` - Payment transferred to worker
- `transfer.failed` - Payment transfer failed

### Verification Webhook
```
POST /webhooks/verification
Content-Type: application/json
```

**Request Body:**
```json
{
  "task_id": 1,
  "verification_result": true,
  "ai_confidence": 94
}
```

**Response:**
```json
{
  "task": { ... },
  "message": "Task verification recorded"
}
```

### Health Check
```
GET /webhooks/health
```

**Response:**
```json
{
  "status": "webhook service healthy"
}
```

---

## Error Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid credentials |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal server error |

---

## Rate Limiting

- **Window**: 60 seconds
- **Limit**: 100 requests per IP
- **Headers**: Rate limit info included in response headers

---

## Examples

### Complete Task Flow

1. **Create Task**
```bash
curl -X POST http://localhost:3001/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "House Cleaning",
    "description": "Clean apartment",
    "amount_naira": 15000,
    "task_location": "Akure, Ondo State",
    "location_latitude": 7.2571,
    "location_longitude": 5.1944,
    "due_date": "2024-05-20T23:59:59Z",
    "deliverable_spec": {"type": "cleaning"}
  }'
```

2. **Get Matches** (included in response)
3. **Assign Worker**
```bash
curl -X POST http://localhost:3001/api/v1/tasks/1/assign \
  -H "Content-Type: application/json" \
  -d '{"worker_id": 1}'
```

4. **Client Funds Escrow** (via Squad)

5. **Worker Submits Proof**
```bash
curl -X POST http://localhost:3001/api/v1/tasks/1/submit-proof \
  -H "Content-Type: application/json" \
  -d '{
    "proof_submission": {
      "images": ["url1", "url2"],
      "description": "Completed"
    }
  }'
```

6. **AI Verification** (via webhook)

7. **Payment Released** (via Squad webhook)

---

## Best Practices

1. **Error Handling**: Always check response status and handle errors
2. **Pagination**: Use limit/offset parameters for large datasets (coming soon)
3. **Caching**: Cache worker and task lists locally (safe for 5 min)
4. **Webhook Verification**: Always verify Squad webhook signatures
5. **Retry Logic**: Implement exponential backoff for failed requests
