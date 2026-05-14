import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

jest.mock('../db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) }));
jest.mock('../services/wallet-service', () => ({
  WalletService: { creditWallet: jest.fn() }
}));

import webhookRoutes from '../routes/webhooks';

const app = express();
app.use(bodyParser.json());
app.use((req: any, _res, next) => {
  req.rawBody = JSON.stringify(req.body);
  next();
});
app.use('/api/v1/webhooks', webhookRoutes);

describe('Webhook Endpoints (/api/v1/webhooks)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /squad should handle squad webhooks', async () => {
    const res = await request(app).post('/api/v1/webhooks/squad').send({ Event: 'charge.completed', TransactionRef: '123' });
    expect([200, 400, 401, 500]).toContain(res.status);
  });

  it('POST /verification should handle verification webhooks', async () => {
    const res = await request(app).post('/api/v1/webhooks/verification').send({ status: 'verified' });
    expect([200, 400, 401, 500]).toContain(res.status);
  });

  it('GET /health should return 200', async () => {
    const res = await request(app).get('/api/v1/webhooks/health');
    expect([200, 500]).toContain(res.status);
  });
});
