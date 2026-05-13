import { Request, Response, NextFunction } from 'express';

// Error handling middleware
export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err);

  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
};

// Authentication middleware (placeholder for future auth)
export const authenticate = (_req: Request, _res: Response, next: NextFunction) => {
  // TODO: Implement JWT or API key validation
  next();
};

// Rate limiting middleware
const requestCounts = new Map<string, number[]>();

export const rateLimit = (windowMs: number = 60000, maxRequests: number = 100) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!requestCounts.has(ip)) {
      requestCounts.set(ip, []);
    }

    const times = requestCounts.get(ip)!.filter(t => t > windowStart);
    times.push(now);
    requestCounts.set(ip, times);

    if (times.length > maxRequests) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    return next();
  };
};

// Validation middleware
export const validateJSON = (req: Request, res: Response, next: NextFunction) => {
  if (req.is('application/json') && typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }
  return next();
};
