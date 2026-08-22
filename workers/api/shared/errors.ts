import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Application-level error with an explicit HTTP status and machine-readable code.
 *
 * Throw these from route handlers — the global `errorHandler` catches them and
 * returns a consistent `{ error, code }` JSON response.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: ContentfulStatusCode = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Global error handler registered via `app.onError()`.
 *
 * - AppError → structured JSON with the appropriate status code.
 * - Anything else → 500 with a generic message (details logged to console).
 */
export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status);
  }

  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error', code: 'INTERNAL' }, 500);
}

