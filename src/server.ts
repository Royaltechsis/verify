import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import swaggerUi from 'swagger-ui-express';
import { initializeDatabase } from './db/init';
import { errorHandler, requestLogger, rateLimit } from './middleware';
import openapiSpec from './docs/openapi';
import path from 'path';

// Routes
import taskRoutes from './routes/tasks';
import workerRoutes from './routes/workers';
import webhookRoutes from './routes/webhooks';
import mockSquadRoutes from './routes/mock-squad';

// Add this to src/server.ts (or any route file)
import { query } from './db/pool';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(requestLogger);
app.use(rateLimit(60000, 100));


app.get('/api/v1/debug/ai-logs', async (_req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM decision_synthesis_logs ORDER BY created_at DESC LIMIT 20');
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch AI logs' });
  }
});


// Store raw body for webhook signature validation
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path === '/api/v1/webhooks/squad') {
    let rawBody = '';
    req.on('data', (chunk: Buffer) => {
      rawBody += chunk.toString();
    });
    req.on('end', () => {
      (req as any).rawBody = rawBody;
      next();
    });
  } else {
    next();
  }
});

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API documentation
app.get('/api/docs.json', (_req: Request, res: Response) => {
  res.json(openapiSpec);
});

app.use('/api/docs', ...swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  explorer: true,
  swaggerOptions: {
    docExpansion: 'none',
    displayRequestDuration: true,
  },
}));

// API Routes
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/workers', workerRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Mount Mock Squad API for testing
if (process.env.NODE_ENV !== 'production') {
  app.use('/mock-squad', mockSquadRoutes);
}

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Error Handler (must be last)
app.use(errorHandler);

// Initialize database and start server
async function start(): Promise<void> {
  try {
    console.log('[Server] Initializing database...');
    await initializeDatabase();
    console.log('[Server] Database initialized successfully');

    app.listen(PORT, () => {
      console.log(`[Server] TaskVerify API running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV}`);
      console.log(`[Server] Documentation: http://localhost:${PORT}/api/docs`);
      console.log(`[Server] OpenAPI JSON: http://localhost:${PORT}/api/docs.json`);
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Server] Failed to start:', errorMessage);
    process.exit(1);
  }
}

start();

export default app;
