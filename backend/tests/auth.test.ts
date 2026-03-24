import request from 'supertest';
import express from 'express';
import authRoutes from '../src/routes/authRoutes';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

jest.mock('../src/config/db', () => ({
  user: {
    findUnique: jest.fn(),
  },
}));

import prisma from '../src/config/db';

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/v1/auth/login should fail without credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Email and password are required');
  });

  it('POST /api/v1/auth/login should fail with invalid credentials', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'invalid@example.com',
      password: 'wrongpassword'
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });
});
