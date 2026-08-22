import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './shared/types';
import { itemsRouter } from './items/items.routes';
import { progressRouter } from './progress/progress.routes';
import { healthRouter } from './health/health.routes';
import { errorHandler } from './shared/errors';
import { authMiddleware } from './shared/auth';

const app = new Hono<Env>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

// Middleware para inyectar la base de datos limpia en c.var.db (ó c.get('db'))
app.use('*', async (c, next) => {
  if (c.env?.tsuzuki_db) {
    c.set('db', c.env.tsuzuki_db);
  }
  await next();
});

// Middleware de seguridad Auth (Cloudflare Access)
app.use('/api/*', authMiddleware);

app.route('/api/items', itemsRouter);
app.route('/api/items', progressRouter);
app.route('/api', healthRouter);

app.onError(errorHandler);

export default app;


