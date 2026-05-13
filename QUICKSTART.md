# TaskVerify Backend - Quick Start Guide

## 5-Minute Setup

### 1. Install Dependencies
```bash
cd taskverify-app/backend
npm install
```

### 2. Setup Database
Make sure PostgreSQL is running, then create database:
```bash
createdb taskverify_db
```

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
- **Database**: PostgreSQL connection details
- **Squad API**: Get from https://dashboard.squad.app
- **Claude AI**: Get from https://console.anthropic.com

### 4. Initialize Database
```bash
npm run migrate
npm run seed
```

### 5. Start Server
```bash
npm run dev
```

You should see:
```
[Server] Initializing database...
[Server] Database initialized successfully
[Server] TaskVerify API running on port 3001
```

## Verify Installation

Test the health endpoint:
```bash
curl http://localhost:3001/health
```

Open the interactive API docs in your browser:
```bash
http://localhost:3001/api/docs
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-05-13T10:00:00Z",
  "environment": "development"
}
```

## Common Issues

### PostgreSQL Connection Error
**Error**: `connect ECONNREFUSED`
- Make sure PostgreSQL is running: `brew services start postgresql` (Mac) or `sudo service postgresql start` (Linux)
- Check DATABASE_URL in .env

### Squad API Error
**Error**: `401 Unauthorized`
- Verify SQUAD_API_KEY in .env
- Check Squad dashboard for API key validity

### Claude API Error
**Error**: `401 Unauthorized`
- Verify ANTHROPIC_API_KEY in .env
- Check https://console.anthropic.com for valid key

### Port Already in Use
**Error**: `EADDRINUSE: address already in use :::3001`
- Change PORT in .env or kill process: `lsof -i :3001`

## Development Commands

```bash
# Start development server with auto-reload
npm run dev

# Build TypeScript
npm run build

# Type checking
npm run type-check

# Database seed with demo data
npm run seed

# Run migrations
npm run migrate

# Production build
npm run build && npm start
```

## Project Structure

```
src/
├── server.ts                # Main Express app
├── seed.ts                  # Demo data seeding
├── db/
│   ├── pool.ts             # DB connection
│   ├── init.ts             # Schema creation
│   └── migrate.ts          # Migrations
├── routes/
│   ├── tasks.ts            # /api/v1/tasks
│   ├── workers.ts          # /api/v1/workers
│   └── webhooks.ts         # /api/v1/webhooks
├── services/
│   ├── ai-matching.ts      # Claude matching
│   └── squad-service.ts    # Squad integration
├── middleware/
│   └── index.ts            # Middlewares
└── types/
    └── index.ts            # TypeScript types
```

## Testing the API

### Create a Task
```bash
curl -X POST http://localhost:3001/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "House Cleaning",
    "description": "Clean a 2-bedroom apartment",
    "client_name": "John Doe",
    "client_email": "john@example.com",
    "required_skills": ["cleaning"],
    "amount_naira": 15000,
    "task_location": "Akure, Ondo State",
    "location_latitude": 7.2571,
    "location_longitude": 5.1944,
    "due_date": "2024-05-20T23:59:59Z",
    "deliverable_spec": {
      "type": "cleaning",
      "checklist": ["Dust", "Vacuum", "Clean bathrooms"]
    }
  }'
```

### List Workers
```bash
curl "http://localhost:3001/api/v1/workers?location=Akure&minRating=4.5"
```

### Get Worker Details
```bash
curl http://localhost:3001/api/v1/workers/1
```

### Assign Worker to Task
```bash
curl -X POST http://localhost:3001/api/v1/tasks/1/assign \
  -H "Content-Type: application/json" \
  -d '{"worker_id": 1}'
```

## Environment Variables Reference

```
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/taskverify_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskverify_db
DB_USER=postgres
DB_PASSWORD=your_password

# Server
PORT=3001
NODE_ENV=development

# External APIs
SQUAD_API_KEY=your_api_key
SQUAD_WEBHOOK_SECRET=your_webhook_secret
ANTHROPIC_API_KEY=your_api_key
```

## Docker Setup (Optional)

Build image:
```bash
docker build -t taskverify-backend .
```

Run container:
```bash
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://... \
  -e SQUAD_API_KEY=... \
  -e ANTHROPIC_API_KEY=... \
  taskverify-backend
```

## Debugging

Enable debug logging:
```bash
DEBUG=taskverify:* npm run dev
```

Check database directly:
```bash
psql taskverify_db
\d  # List tables
SELECT * FROM workers;
```

## Next Steps

1. ✅ Backend API is running
2. 📱 Build frontend (React/Next.js)
3. 🔗 Connect frontend to backend
4. 🧪 Write integration tests
5. 🚀 Deploy to production

## Resources

- [API Documentation](./API_DOCS.md)
- [Implementation Guide](../IMPLEMENTATION_GUIDE.md)
- [Squad API Docs](https://squad.app/developers)
- [Claude API Docs](https://docs.anthropic.com)
- [Express.js Guide](https://expressjs.com)

## Support

For issues:
1. Check `.env` configuration
2. Verify database connection
3. Check logs for error messages
4. Review API_DOCS.md for endpoint details
