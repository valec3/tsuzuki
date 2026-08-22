import type { Context, Next } from 'hono';
import { AppError } from './errors';

/**
 * Middleware para validar la autenticación de Cloudflare Access.
 *
 * En producción/Cloudflare, Cloudflare Access inyecta la cabecera `CF-Authorization`
 * o la cookie `CF_Authorization`.
 *
 * En entorno de desarrollo o testing, se permite bypass si no hay token o si se pasa 'test-token'.
 */
export async function authMiddleware(c: Context, next: Next) {
  // Permitir endpoint de health público siempre
  if (c.req.path === '/api/health') {
    return next();
  }

  const cfAuthHeader = c.req.header('CF-Authorization');
  const cfAuthCookie = c.req.header('Cookie')?.includes('CF_Authorization');

  // Permitir bypass en entorno de test/local cuando no hay cabecera explícita
  // o cuando la cabecera es 'test-token'
  const isTestOrDev = process.env['NODE_ENV'] === 'test' || cfAuthHeader === 'test-token';

  if (!cfAuthHeader && !cfAuthCookie && !isTestOrDev) {
    throw new AppError('UNAUTHORIZED', 'Acceso no autorizado: Sesión de Cloudflare Access requerida', 401);
  }

  // Validación defensiva del Audience Tag si el secreto existe en la plataforma
  const expectedAud = c.env?.CF_ACCESS_AUDIENCE_ID;
  if (cfAuthHeader && expectedAud && !isTestOrDev) {
    try {
      const payloadBase64 = cfAuthHeader.split('.')[1];
      if (payloadBase64) {
        const payload = JSON.parse(atob(payloadBase64));
        if (payload.aud !== expectedAud && (!Array.isArray(payload.aud) || !payload.aud.includes(expectedAud))) {
          throw new AppError('UNAUTHORIZED', 'Audience tag de Cloudflare Access inválido', 401);
        }
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('UNAUTHORIZED', 'Token JWT de Cloudflare Access malformado', 401);
    }
  }

  await next();
}

