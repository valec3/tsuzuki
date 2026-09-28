# 🔥 Guía Técnica y Arquitectónica — Cloudflare Workers con Hono

Esta guía documenta la capa de Backend en **Tsuzuki**, explicando cómo funciona **Cloudflare Workers** como runtime en el borde y por qué usamos el micro-framework **Hono**.

---

## 1. Cloudflare Workers: El Runtime del Edge (Borde)

### 1.1 ¿En qué se diferencia de Node.js / Express tradicional?
En una arquitectura tradicional (ej. AWS EC2 o un servidor en DigitalOcean):
- Tu servidor corre en una ciudad específica (ej. Virginia, EE. UU. o San Pablo, Brasil).
- Si un usuario entra desde Buenos Aires o Tokio, sus peticiones deben viajar miles de kilómetros de ida y vuelta (latencia de 150ms a 300ms).

En **Cloudflare Workers**:
- Tu código no corre en un servidor fijo. Corre en los **más de 300 centros de datos de Cloudflare en todo el mundo**.
- Si abrís la app desde tu celular, el código se ejecuta en el datacenter de Cloudflare más cercano a tu ubicación física (latencia de 10ms a 30ms).
- **V8 Isolates**: No arranca un proceso completo de Node.js por cada petición. Usa "aislados" del motor V8 de Chrome, lo que reduce el tiempo de arranque en frío (Cold Start) a **0 milisegundos**.

---

## 2. ¿Por qué Hono (`hono`) como Framework?

### 2.1 El problema de Express en el Edge
Express.js depende fuertemente de APIs internas de Node.js (`http`, `net`, `stream`), lo que lo hace incompatible o muy pesado para entornos de Edge Computing como Cloudflare Workers.

### 2.2 La ventaja de Hono
**Hono** ("llama" en japonés) fue diseñado específicamente para la API estándar de Web (`fetch`, `Request`, `Response`):
- **Ultra liviano**: Menos de 14 KB de tamaño.
- **Tipado estricto de extremo a extremo**: Permite tipar el contexto (`c.env`, `c.var`) con TypeScript para no cometer errores de acceso a variables.
- **Rápido**: Usa un algoritmo de ruteo basado en RegExp Tries (RegExp Router) extremadamente optimizado.

---

## 3. Anatomía del Entrypoint: [`workers/api/index.ts`](file:///c:/Users/User/Development/Self/tsuzuki/workers/api/index.ts)

Analicemos cómo está estructurado nuestro Worker:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './shared/types';
import { itemsRouter } from './items/items.routes';
import { errorHandler } from './shared/errors';
import { authMiddleware } from './shared/auth';

// 1. Instanciación con tipos genéricos
const app = new Hono<Env>();

// 2. Middleware de CORS (Cross-Origin Resource Sharing)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// 3. Inyección de dependencias en el Contexto (c)
app.use('*', async (c, next) => {
  if (c.env?.tsuzuki_db) {
    c.set('db', c.env.tsuzuki_db); // Guarda la DB en c.var.db
  }
  await next();
});

// 4. Protección perimetral con Auth Middleware
app.use('/api/*', authMiddleware);

// 5. Ruteo modular por dominio
app.route('/api/items', itemsRouter);

// 6. Manejo global de excepciones
app.onError(errorHandler);

export default app;
```

---

## 4. Conceptos Clave de Hono en el Código

### 4.1 El Contexto (`c`)
En Hono, en vez del clásico `(req, res, next)` de Express, tenés un único objeto unificado llamado **Context** (`c`):
- **`c.req`**: Información de la petición entrante (headers, query params, body JSON).
  - `c.req.query('status')`: Lee un query param (`?status=en_curso`).
  - `c.req.param('id')`: Lee un parámetro de ruta (`/api/items/:id`).
  - `await c.req.json()`: Parsea el cuerpo JSON.
- **`c.env`**: Acceso a los **Bindings** de Cloudflare (Base de datos D1, Buckets R2, Secretos de entorno).
- **`c.json(data, statusCode)`**: Retorna una respuesta JSON con el código HTTP correspondiente:
  ```typescript
  return c.json({ status: 'ok' }, 200);
  ```

### 4.2 Middleware y la cadena `await next()`
Un middleware es una función que se ejecuta antes de llegar al controlador final.
- Si todo está bien, llama a `await next()` para ceder el control al siguiente eslabón.
- Si algo falla (ej. no está autenticado), corta la ejecución lanzando un error o devolviendo un `c.json(..., 401)`.

### 4.3 Validación de Datos con Zod (`workers/api/items/schemas.ts`)
Para garantizar que nadie guarde datos inválidos en la base de datos (ej. un score de 99 cuando el rango es de 1 a 10), usamos **Zod**:

```typescript
export const CreateItemSchema = z.object({
  title: z.string().min(1).max(500),
  type: MediaType,
  status: ItemStatus,
  current_chapter: z.number().int().min(0).default(0),
  score: z.number().int().min(1).max(10).nullable().optional(),
});
```
En la ruta:
```typescript
const parsed = CreateItemSchema.safeParse(body);
if (!parsed.success) {
  return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
}
```
Esto asegura que **ningún dato sucio o malicioso toque jamás la base de datos**.
