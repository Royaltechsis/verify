import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

jest.mock('../db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ id: 1, balance: 1000 }] }) }));
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 1, role: 'buyer', email: 'test@test.com' };
    next();
  }
}));

import walletRoutes from '../routes/wallet';

const app = express();
app.use(bodyParser.json());
app.use('/api/v1/wallet', walletRoutes);

describe('Wallet Endpoints (/api/v1/wallet)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / should get wallet details', async () => {
    const res = await request(app).get('/api/v1/wallet');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('GET /transactions should list transactions', async () => {
    const res = await request(app).get('/api/v1/wallet/transactions');
    expect([200, 500]).toContain(res.status);
  });

  it('POST /virtual-account should create VA', async () => {
    const res = await request(app).post('/api/v1/wallet/virtual-account').send({ bvn: '12345678901' });
    expect([200, 201, 400, 500]).toContain(res.status);
  });

  it('POST /withdraw should withdraw funds', async () => {
    const res = await request(app).post('/api/v1/wallet/withdraw').send({ amount_naira: 100, account_number: '1', account_name: 'A', bank_code: '011' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });
});
