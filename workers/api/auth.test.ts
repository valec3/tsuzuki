import { describe, expect, it } from 'vitest';
import app from './index';

describe('Auth Middleware (Cloudflare Access)', () => {
  it('should allow access to public /api/health endpoint without auth header', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });

  it('should allow access when CF-Authorization header is present', async () => {
    const res = await app.request('/api/items', {
      headers: {
        'CF-Authorization': 'valid-cf-access-jwt-token',
      },
    });
    expect(res.status).not.toBe(401);
  });
});
