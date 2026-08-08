import { describe, it, expect } from 'vitest';
import app from './index';

describe('Worker API - Health', () => {
  it('should return 200 with status ok and timestamp', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('timestamp');
    // Verify timestamp is a valid ISO string
    expect(() => new Date(body.timestamp)).not.toThrow();
  });

  it('should return JSON content type', async () => {
    const response = await app.request('/api/health');
    const contentType = response.headers.get('Content-Type');
    expect(contentType).toContain('application/json');
  });

  it('should include CORS Access-Control-Allow-Origin header', async () => {
    const response = await app.request('/api/health');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should respond to OPTIONS preflight with CORS headers', async () => {
    const response = await app.request('/api/health', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});
