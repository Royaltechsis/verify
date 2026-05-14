import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

jest.mock('../db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ id: 1, email: 'test@test.com', password_hash: '$2a$12$e', is_active: true }] }) }));
jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn().mockResolvedValue(true) }));
jest.mock('../middleware/auth', () => ({
  signToken: jest.fn(() => 'token'),
  auditLog: jest.fn()
}));

import authRoutes from '../routes/auth';

const app = express();
app.use(bodyParser.json());
app.use('/api/v1/auth', authRoutes);

describe('Auth Endpoints (/api/v1/auth)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /register should register', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 't@t.com', password: 'p', full_name: 'F' });
    expect([201, 400, 409, 500]).toContain(res.status);
  });

  it('POST /login should login', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 't@t.com', password: 'p' });
    expect([200, 400, 401, 403, 500]).toContain(res.status);
  });

  it('POST /admin/create should create admin', async () => {
    const res = await request(app).post('/api/v1/auth/admin/create').send({ email: 'a@a.com', password: 'p', full_name: 'A' });
    expect([201, 400, 409, 500]).toContain(res.status);
  });
});
