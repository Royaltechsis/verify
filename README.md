# TaskVerify Backend API

A comprehensive backend system for TaskVerify - an AI-powered gig task verification platform with Squad escrow integration.

## Architecture Overview

The backend is built with:
- **Express.js** - HTTP API framework
- **PostgreSQL** - Data persistence
- **TypeScript** - Type-safe development
- **Claude AI** - Intelligent worker matching and task verification
- **Squad API** - Secure escrow management and payments

## Project Structure

```
src/
├── server.ts              # Express server setup
├── seed.ts                # Database seeding
├── db/
│   ├── pool.ts            # PostgreSQL connection pool
│   ├── init.ts            # Database schema initialization
│   └── migrate.ts         # Database migrations
├── routes/
│   ├── tasks.ts           # Task management endpoints
│   ├── workers.ts         # Worker profile endpoints
│   └── webhooks.ts        # Squad and verification webhooks
├── services/
│   ├── ai-matching.ts     # Claude AI worker matching & verification
│   └── squad-service.ts   # Squad API integration
├── middleware/
│   └── index.ts           # Express middleware
└── types/
    └── index.ts           # TypeScript type definitions
```

## Installation & Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- Squad API credentials
- Anthropic Claude API key

### Steps

1. **Clone and install dependencies:**
```bash
cd taskverify-app/backend
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Initialize database:**
```bash
npm run migrate
npm run seed
```

4. **Start development server:**
```bash
npm run dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

### Tasks
- `GET /api/v1/tasks` - List tasks (filters: status, location)
- `GET /api/v1/tasks/:id` - Get task details
- `POST /api/v1/tasks` - Create new task
- `POST /api/v1/tasks/:id/assign` - Assign worker to task
- `POST /api/v1/tasks/:id/submit-proof` - Submit task completion proof
- `GET /api/v1/tasks/:id/status` - Get task status

### Workers
- `GET /api/v1/workers` - List workers (filters: location, skill, minRating)
- `GET /api/v1/workers/:id` - Get worker profile
- `POST /api/v1/workers` - Create worker profile
- `PUT /api/v1/workers/:id` - Update worker profile
- `GET /api/v1/workers/:id/stats` - Get worker statistics

### Webhooks
- `POST /api/v1/webhooks/squad` - Squad payment events
- `POST /api/v1/webhooks/verification` - AI verification results
- `GET /api/v1/webhooks/health` - Health check

## Key Features

### 1. AI Worker Matching
- Skill-based matching
- Location proximity calculation
- Trust score and rating analysis
- Claude AI-powered ranking refinement
- Distance-aware recommendations

### 2. Intelligent Task Verification
- Automatic proof validation against deliverables
- AI-powered verification with confidence scoring
- Detailed verification reports
- Appeal mechanism ready

### 3. Squad Integration
- Virtual account creation for escrow
- Automated payment handling
- Webhook event processing
- Multi-stage transaction tracking
- Refund management

### 4. Database Schema
- **workers**: User profiles with ratings and statistics
- **tasks**: Task details and assignment tracking
- **escrow_accounts**: Squad virtual accounts and fund flow
- **task_history**: Completion records and earnings
- **squad_webhook_logs**: Event audit trail
- **transfer_logs**: Payment transaction logs

## Workflow

### Task Assignment Flow
1. Client creates task with deliverables spec
2. System retrieves AI-matched workers
3. Client selects preferred worker
4. Squad escrow account created
5. Client receives payment instructions
6. Once funded, worker notified and can begin

### Completion Flow
1. Worker submits proof and deliverables
2. AI verification analyzes completeness
3. If verified → payment released to worker
4. If disputed → escrow holds, manual review
5. Task history updated with earnings

### Webhook Events
- `payment.successful` - Escrow funded
- `virtual_account.funded` - Payment received
- `transfer.completed` - Worker paid
- `transfer.failed` - Payment issue needs review

## Development

### Build
```bash
npm run build
```

### Type Check
```bash
npm run type-check
```

### Database Seed
```bash
npm run seed
```

### Run Tests (when added)
```bash
npm test
```

## Configuration

### Environment Variables
```
DATABASE_URL          # PostgreSQL connection
SQUAD_API_KEY         # Squad API key
SQUAD_WEBHOOK_SECRET  # Squad webhook secret
ANTHROPIC_API_KEY     # Claude API key
PORT                  # Server port (default: 3001)
NODE_ENV              # Environment (development/production)
```

## Error Handling

The API follows standard HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad request
- `401` - Unauthorized
- `404` - Not found
- `500` - Server error

All errors include descriptive messages for debugging.

## Security Considerations

1. **Webhook Signature Verification** - All Squad webhooks verified with HMAC-SHA256
2. **Environment Variables** - Sensitive data never committed to repo
3. **Input Validation** - All endpoints validate required fields
4. **Database Connection Pooling** - Efficient resource management
5. **Error Logging** - Detailed logs without exposing sensitive data

## Performance Optimizations

1. **Connection Pool** - Max 20 concurrent connections
2. **Query Optimization** - Slow query logging (>100ms)
3. **Location Calculations** - Haversine formula for efficient distance
4. **Caching Ready** - Structure supports Redis integration
5. **Async/Await** - Non-blocking operations throughout

## Future Enhancements

- [ ] Redis caching for worker matches
- [ ] Dispute resolution system
- [ ] Payment analytics dashboard
- [ ] Automated retries for failed transfers
- [ ] Multi-currency support
- [ ] Rating and review system
- [ ] Advanced fraud detection
- [ ] Performance benchmarking

## Support

For issues or questions, refer to:
- IMPLEMENTATION_GUIDE.md - Detailed technical guide
- Squad API Documentation - https://squad.app/developers
- Anthropic Claude Docs - https://docs.anthropic.com

## License

Proprietary - TaskVerify 2026
