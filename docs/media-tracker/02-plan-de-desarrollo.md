# 🗺️ Plan de Desarrollo — Tsuzuki (完了)

> **Inicio**: 2026-08-08 | **Ritmo**: cada 3 días, 4h/sesión | **MVP**: 10/09/2026
> **Repo**: `valec3/tsuzuki` | **Stack**: Angular 21 + Cloudflare Workers + D1 + R2

---

## Tabla de contenidos

1. [Setup inicial (una vez)](#1-setup-inicial-una-vez)
2. [Fase 1 — Backend Foundation (S1–S3)](#2-fase-1--backend-foundation)
3. [Fase 2 — Auth (S4)](#3-fase-2--auth)
4. [Fase 3 — Frontend: Biblioteca (S5–S7)](#4-fase-3--frontend-biblioteca)
5. [Fase 4 — Integración AniList (S8)](#5-fase-4--integración-anilist)
6. [Fase 5 — Backups (S9–S10)](#6-fase-5--backups)
7. [Fase 6 — PWA + Offline (S11)](#7-fase-6--pwa--offline)
8. [Fase 7 — Polish + QA (S12)](#8-fase-7--polish--qa)
9. [Fase 8 — Multi-Tenant / Multi-Usuario (Post-MVP)](#9-fase-8--multi-tenant--multi-usuario-post-mvp)
10. [Comandos de referencia](#10-comandos-de-referencia)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Setup Inicial (una vez)

Esto se hace **una sola vez** antes de empezar a desarrollar. Si ya lo tenés, saltá a la Fase 1.

### 1.1 Cuenta de Cloudflare

```bash
# Instalar wrangler (CLI de Cloudflare)
npm install -g wrangler

# Login con tu cuenta de Cloudflare
wrangler login
```

Verificar que funciona:

```bash
wrangler whoami
```

### 1.2 Crear D1 Database

```bash
# Crear la base de datos
wrangler d1 create tsuzuki-db
```

Esto imprime algo como:

```
✅ Successfully created DB 'tsuzuki-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copiar el `database_id`** y reemplazar el `PLACEHOLDER` en `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "tsuzuki-db",
      "database_name": "tsuzuki-db",
      "database_id": "TU_DATABASE_ID_AQUI"
    }
  ]
}
```

### 1.3 Crear R2 Bucket

```bash
# Crear bucket para backups
wrangler r2 bucket create tsuzuki-backups
```

### 1.4 Crear Repo Privado para Backups Off-Site

En GitHub:

1. Crear repo `tsuzuki-backups` (privado)
2. Generar un **Personal Access Token** (PAT):
   - Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Scopes: `repo` (full control of private repos)
3. Guardar el token como secreto en Cloudflare:

```bash
wrangler secret put GITHUB_TOKEN
# Pegar el PAT cuando te pida
```

### 1.5 Configurar GitHub para el Cron Worker

El Cron Worker necesita el nombre del repo y el branch:

```bash
wrangler secret put GITHUB_REPO
# Ingresar: valec3/tsuzuki-backups

wrangler secret put GITHUB_BRANCH
# Ingresar: main
```

### 1.6 Variables de Entorno del Worker (dev)

En `wrangler.jsonc`, agregar la sección `vars`:

```jsonc
{
  "vars": {
    "GITHUB_REPO": "valec3/tsuzuki-backups",
    "GITHUB_BRANCH": "main"
  }
}
```

### 1.7 Verificar que todo está listo

```bash
# Verificar wrangler
wrangler whoami

# Verificar D1
wrangler d1 list

# Verificar R2
wrangler r2 bucket list

# Verificar que el Worker compila
cd workers && npx wrangler deploy --dry-run
```

---

## 2. Fase 1 — Backend Foundation

### S1 — D1 Schema + Migrations (08/08)

**Objetivo**: Tabla `media_items`, `progress_history`, índices, tests.

#### Paso 1: Crear estructura de migraciones

```bash
# Crear directorio de migraciones
mkdir -p migrations
```

#### Paso 2: Escribir migración 001

Crear archivo `migrations/001_initial.sql`:

```sql
-- Tsuzuki — Migración inicial
-- Fecha: 2026-08-08

CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'otro'
    CHECK (type IN ('anime', 'manga', 'manhwa', 'manhua', 'novela_ligera', 'novela_web', 'donghua', 'otro')),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('en_curso', 'completado', 'pendiente', 'en_pausa', 'abandonado', 'reconsumiendo')),
  cover_url TEXT,
  synopsis TEXT,
  current_chapter INTEGER NOT NULL DEFAULT 0,
  total_chapters INTEGER,
  score INTEGER CHECK (score >= 1 AND score <= 10),
  notes TEXT,
  source_url TEXT,
  external_id TEXT,
  external_source TEXT DEFAULT 'manual'
    CHECK (external_source IN ('anilist', 'manual')),
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  CONSTRAINT valid_chapter CHECK (
    current_chapter >= 0
    AND (total_chapters IS NULL OR current_chapter <= total_chapters)
  )
);

CREATE TABLE IF NOT EXISTS progress_history (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  from_chapter INTEGER NOT NULL,
  to_chapter INTEGER NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices (documentados en 01-requerimientos §7.2)
CREATE INDEX IF NOT EXISTS idx_items_status ON media_items(status);
CREATE INDEX IF NOT EXISTS idx_items_type ON media_items(type);
CREATE INDEX IF NOT EXISTS idx_items_updated ON media_items(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_title ON media_items(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_history_item ON progress_history(item_id, changed_at);
```

#### Paso 3: Aplicar migración

```bash
# Local
wrangler d1 execute tsuzuki-db --file=migrations/001_initial.sql

# Remoto (producción)
wrangler d1 execute tsuzuki-db --remote --file=migrations/001_initial.sql
```

#### Paso 4: Generar ULID en el Worker

Instalar dependencia:

```bash
cd workers
npm install ulid
```

> **⚠️ Nota**: Si `ulid` no funciona en Workers (edge runtime), implementar un generador ULID manual con `crypto.getRandomValues()`. Verificar en los tests.

Crear `workers/api/ulid.ts`:

```typescript
export function ulid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Timestamp (48 bits) — ms desde epoch
  const now = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = now & 0xff;
    now >>>= 8;
  }

  // Convertir a Crockford base32
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTVWXYZ';
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += alphabet[bytes[i] & 0x1f];
  }
  return id;
}
```

#### Paso 5: Tests de Schema

Crear `workers/api/schema.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSQLite } from './test-utils';

describe('D1 Schema', () => {
  let db: ReturnType<typeof createSQLite>;

  beforeAll(() => {
    db = createSQLite();
    // Aplicar migración
    const migration = require('fs').readFileSync(
      '../../migrations/001_initial.sql', 'utf-8'
    );
    db.exec(migration);
  });

  it('should insert a valid media item', () => {
    const result = db.prepare(`
      INSERT INTO media_items (id, title, type, status)
      VALUES (?, ?, ?, ?)
    `).run('01HXYZ00000000000000000001', 'Test Item', 'manga', 'en_curso');
    expect(result.meta.changes).toBe(1);
  });

  it('should reject invalid chapter constraint', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO media_items (id, title, type, status, current_chapter, total_chapters)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('01HXYZ00000000000000000002', 'Bad', 'manga', 'en_curso', 15, 10);
    }).toThrow();
  });
});
```

#### Verificación

```bash
cd workers
npx vitest run
# Deben pasar los tests de schema
```

---

### S2 — CRUD Items API (11/08)

**Objetivo**: 5 endpoints funcionando + validación zod.

#### Paso 1: Instalar zod

```bash
cd workers
npm install zod
```

#### Paso 2: Definir schema de validación

Crear `workers/api/schemas.ts`:

```typescript
import { z } from 'zod';

export const MediaType = z.enum([
  'anime', 'manga', 'manhwa', 'manhua',
  'novela_ligera', 'novela_web', 'donghua', 'otro'
]);

export const ItemStatus = z.enum([
  'en_curso', 'completado', 'pendiente',
  'en_pausa', 'abandonado', 'reconsumiendo'
]);

export const CreateItemSchema = z.object({
  title: z.string().min(1).max(500),
  type: MediaType,
  status: ItemStatus,
  cover_url: z.string().url().nullable().optional(),
  synopsis: z.string().nullable().optional(),
  current_chapter: z.number().int().min(0).default(0),
  total_chapters: z.number().int().min(1).nullable().optional(),
  score: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().nullable().optional(),
  source_url: z.string().url().nullable().optional(),
  external_id: z.string().nullable().optional(),
  external_source: z.enum(['anilist', 'manual']).default('manual'),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
});

export const UpdateItemSchema = CreateItemSchema.partial();

export const ProgressSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('delta'),
    delta: z.number().int().min(1),
  }),
  z.object({
    mode: z.literal('value'),
    value: z.number().int().min(0),
  }),
]);
```

#### Paso 3: Crear endpoints

Reemplazar `workers/api/index.ts`:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CreateItemSchema, UpdateItemSchema, ProgressSchema } from './schemas';
import { ulid } from './ulid';

type Bindings = {
  'tsuzuki-db': D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// --- Health ---
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- List items ---
app.get('/api/items', async (c) => {
  const db = c.env['tsuzuki-db'];
  const status = c.req.query('status');
  const type = c.req.query('type');
  const q = c.req.query('q');
  const sort = c.req.query('sort') ?? 'updated_at';
  const order = c.req.query('order') ?? 'desc';

  let sql = 'SELECT * FROM media_items WHERE 1=1';
  const params: any[] = [];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (q) { sql += ' AND title LIKE ?'; params.push(`%${q}%`); }

  const allowedSorts = ['updated_at', 'title', 'score', 'created_at'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'updated_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortCol} ${sortOrder}`;

  const { results } = await db.prepare(sql).bind(...params).all();
  return c.json(results);
});

// --- Get single item ---
app.get('/api/items/:id', async (c) => {
  const db = c.env['tsuzuki-db'];
  const id = c.req.param('id');

  const item = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
  if (!item) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const history = await db.prepare(
    'SELECT * FROM progress_history WHERE item_id = ? ORDER BY changed_at DESC'
  ).bind(id).all();

  return c.json({ ...item, history: history.results });
});

// --- Create item ---
app.post('/api/items', async (c) => {
  const db = c.env['tsuzuki-db'];
  const body = await c.req.json();
  const parsed = CreateItemSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const id = ulid();
  const now = new Date().toISOString();
  const data = parsed.data;

  await db.prepare(`
    INSERT INTO media_items (id, title, type, status, cover_url, synopsis,
      current_chapter, total_chapters, score, notes, source_url,
      external_id, external_source, started_at, finished_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, data.title, data.type, data.status,
    data.cover_url ?? null, data.synopsis ?? null,
    data.current_chapter, data.total_chapters ?? null,
    data.score ?? null, data.notes ?? null, data.source_url ?? null,
    data.external_id ?? null, data.external_source,
    data.started_at ?? null, data.finished_at ?? null,
    now, now
  ).run();

  const item = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
  return c.json(item, 201);
});

// --- Update item ---
app.patch('/api/items/:id', async (c) => {
  const db = c.env['tsuzuki-db'];
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateItemSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.prepare('SELECT id FROM media_items WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const updates = parsed.data;
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const vals: any[] = [];

  for (const [key, val] of Object.entries(updates)) {
    sets.push(`${key} = ?`);
    vals.push(val ?? null);
  }
  vals.push(id);

  await db.prepare(`UPDATE media_items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  const item = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
  return c.json(item);
});

// --- Delete item ---
app.delete('/api/items/:id', async (c) => {
  const db = c.env['tsuzuki-db'];
  const id = c.req.param('id');

  const result = await db.prepare('DELETE FROM media_items WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }
  return c.json({ deleted: true });
});

// --- Progress (+1 rápido) ---
app.post('/api/items/:id/progress', async (c) => {
  const db = c.env['tsuzuki-db'];
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = ProgressSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const item = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
  if (!item) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  let newChapter: number;
  if (parsed.data.mode === 'delta') {
    newChapter = (item.current_chapter as number) + parsed.data.delta;
  } else {
    newChapter = parsed.data.value;
  }

  // Validar constraints
  if (newChapter < 0) return c.json({ error: 'Chapter cannot be negative' }, 400);
  if (item.total_chapters != null && newChapter > item.total_chapters) {
    return c.json({ error: 'Chapter exceeds total' }, 400);
  }

  const oldChapter = item.current_chapter as number;
  const historyId = ulid();

  // Batch transaccional
  await db.batch([
    db.prepare(`
      UPDATE media_items SET current_chapter = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(newChapter, id),
    db.prepare(`
      INSERT INTO progress_history (id, item_id, from_chapter, to_chapter, changed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(historyId, id, oldChapter, newChapter),
  ]);

  const updated = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
  return c.json(updated);
});

export default app;
```

#### Paso 4: Tests CRUD

Crear `workers/api/crud.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import app from './index';

describe('Items CRUD', () => {
  let createdId: string;

  it('POST /api/items — creates an item', async () => {
    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Solo Leveling',
        type: 'manhwa',
        status: 'en_curso',
        current_chapter: 50,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Solo Leveling');
    createdId = body.id;
  });

  it('GET /api/items — lists items', async () => {
    const res = await app.request('/api/items');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
  });

  it('GET /api/items/:id — gets single item', async () => {
    const res = await app.request(`/api/items/${createdId}`);
    expect(res.status).toBe(200);
  });

  it('PATCH /api/items/:id — updates item', async () => {
    const res = await app.request(`/api/items/${createdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 9 }),
    });
    expect(res.status).toBe(200);
  });

  it('POST /api/items/:id/progress — increments chapter', async () => {
    const res = await app.request(`/api/items/${createdId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'delta', delta: 1 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current_chapter).toBe(51);
  });

  it('DELETE /api/items/:id — deletes item', async () => {
    const res = await app.request(`/api/items/${createdId}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
```

#### Verificación

```bash
cd workers
npx vitest run
# Todos los tests CRUD deben pasar
```

---

### S3 — Progreso Rápido + Historial (14/08)

**Objetivo**: `POST /progress` transaccional con batch D1, historial completo.

Los tests de progress ya están en S2. En esta sesión se:
1. Verificar que el batch D1 funciona con transacciones reales
2. Testear edge cases: +1 en completado, -1 a 0, exceder total
3. Agregar endpoint `GET /api/items/:id/history` si se separa del detalle

#### Test adicional — edge cases

```typescript
it('POST /api/items/:id/progress — rejects when exceeding total', async () => {
  // Crear item con total_chapters = 10
  // Intentar push a chapter 15
  // Debe fallar
});

it('POST /api/items/:id/progress — rejects negative delta', async () => {
  // Intentar delta: -100 en item con current_chapter = 5
  // Debe fallar
});
```

---

## 3. Fase 2 — Auth

### S4 — Cloudflare Access + JWT (17/08)

**Objetivo**: API protegida con Cloudflare Access, Worker valida JWT.

#### Paso 1: Configurar Cloudflare Access (Dashboard)

1. Ir a **Zero Trust Dashboard** → `dash.teams.cloudflare.com`
2. **Access** → **Applications** → **Add an application**
3. Tipo: **Self-hosted**
4. Configurar:
   - Application name: `tsuzuki`
   - Session duration: **24 hours** (o lo que prefieras)
   - Application domain: `tsuzuki.pages.dev` (o tu dominio de Pages)
5. **Add policy**:
   - Policy name: `owner-only`
   - Action: **Allow**
   - Include → **Emails**: tu email exacto
6. **Save**

Esto protege tanto `tsuzuki.pages.dev` como `tsuzuki.pages.dev/api/*`.

#### Paso 2: Obtener Cloudflare Access Audience

En Zero Trust Dashboard → **Access** → **Applications** → tu app → copiar el **Audience (AUD)** tag.

#### Paso 3: Agregar AUD como secreto al Worker

```bash
wrangler secret put CF_ACCESS_AUDIENCE_ID
# Pegar el AUD tag
```

#### Paso 4: Validar JWT en el Worker

Crear `workers/api/auth.ts`:

```typescript
import { Jwt } from 'hono/jwt';

export async function verifyAccessToken(
  token: string,
  audience: string,
  publicKey: string
): Promise<boolean> {
  try {
    // Cloudflare Access usa RS256
    // Verificar: https://developers.cloudflare.com/cloudflare-one/identity/validate-access-tokens/
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.aud === audience;
  } catch {
    return false;
  }
}
```

> **⚠️ NOTA IMPORTANTE**: La validación real de JWT de Cloudflare Access requiere verificar la firma con el certificado público de Cloudflare. Para el MVP, usar Cloudflare Access **ya protege la app** (el proxy de Access redirige al login si no hay sesión válida). La validación JWT en el Worker es **defensa en profundidad** (SHOULD, no MUST). Puedes implementar la verificación completa de firma después del MVP.

**Approach simplificado para el MVP**: confiar en que Cloudflare Access ya protege las rutas. El Worker solo verifica que el header `CF-Authorization` exista.

```typescript
// Middleware básico de verificación
app.use('/api/*', async (c, next) => {
  const token = c.req.header('CF-Authorization');
  if (!token) {
    return c.json({ error: 'Unauthorized', code: 'NO_SESSION' }, 401);
  }
  await next();
});
```

#### Paso 5: Deploy a Cloudflare Pages

```bash
# Build del frontend
ng build --configuration production

# Deploy a Cloudflare Pages
wrangler pages deploy dist/index/browser --project-name=tsuzuki
```

#### Verificación

1. Abrir `https://tsuzuki.pages.dev` → debería redirigir a Cloudflare Access login
2. Ingresar email → recibir OTP → ingresar código
3. Entrar a la app → todo debería funcionar
4. Probar `/api/health` desde la app → debería responder con el header `CF-Authorization`

---

## 4. Fase 3 — Frontend: Biblioteca

### S5 — Servicio de Items + Home (20/08)

**Objetivo**: Servicio Angular con CRUD HTTP, HomeComponent con lista de items.

#### Paso 1: Crear servicio de Items

```bash
ng generate service services/item --skip-tests
```

Crear `src/app/services/item.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MediaItem {
  id: string;
  title: string;
  type: string;
  status: string;
  cover_url: string | null;
  synopsis: string | null;
  current_chapter: number;
  total_chapters: number | null;
  score: number | null;
  notes: string | null;
  source_url: string | null;
  external_id: string | null;
  external_source: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemFilters {
  status?: string;
  type?: string;
  q?: string;
  sort?: string;
  order?: string;
}

@Injectable({ providedIn: 'root' })
export class ItemService {
  private http = inject(HttpClient);
  private api = '/api';

  getItems(filters?: ItemFilters): Observable<MediaItem[]> {
    let params = new HttpParams();
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.type) params = params.set('type', filters.type);
    if (filters?.q) params = params.set('q', filters.q);
    if (filters?.sort) params = params.set('sort', filters.sort);
    if (filters?.order) params = params.set('order', filters.order);
    return this.http.get<MediaItem[]>(`${this.api}/items`, { params });
  }

  getItem(id: string): Observable<MediaItem & { history: any[] }> {
    return this.http.get<MediaItem & { history: any[] }>(`${this.api}/items/${id}`);
  }

  createItem(data: Partial<MediaItem>): Observable<MediaItem> {
    return this.http.post<MediaItem>(`${this.api}/items`, data);
  }

  updateItem(id: string, data: Partial<MediaItem>): Observable<MediaItem> {
    return this.http.patch<MediaItem>(`${this.api}/items/${id}`, data);
  }

  deleteItem(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.api}/items/${id}`);
  }

  incrementProgress(id: string, delta: number): Observable<MediaItem> {
    return this.http.post<MediaItem>(`${this.api}/items/${id}/progress`, {
      mode: 'delta',
      delta,
    });
  }
}
```

#### Paso 2: Configurar HTTP client

Agregar `provideHttpClient()` en `app.config.ts`:

```typescript
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js'),
    provideHttpClient(),  // <-- AGREGAR
  ],
};
```

#### Paso 3: Crear componente ItemCard

```bash
ng generate component components/item-card --skip-tests --inline-style
```

Componente tarjeta con `+1` optimista (verificar patrón en `AGENTS.md` — signals, OnPush, inline template).

#### Paso 4: Actualizar HomeComponent

Reemplazar el placeholder con lista real de items, estados vacíos, loading state.

#### Verificación

```bash
ng test --watch=false
# Todos los tests deben pasar
# AXE audit en HomeComponent debe dar 0 violaciones
```

---

### S6 — Vista Grid/Lista + Filtros (23/08)

**Objetivo**: Toggle grid↔lista (persiste en localStorage), tabs de estado, búsqueda, filtros combinables.

Componentes a crear:
- `FilterBarComponent` — tabs de estado + input búsqueda
- `ItemGridComponent` — vista de cuadrícula con portadas
- `ItemListComponent` — vista de lista compacta

Usar `signal()` para el estado de filtros, `computed()` para la lista filtrada.

---

### S7 — Detalle + Edición Inline (26/08)

**Objetivo**: Ruta `/items/:id`, edición de todos los campos inline, save optimista, borrado con confirmación.

Componentes:
- `ItemDetailComponent` — ruta lazy
- `InlineEditComponent` — campo editable con click
- `ConfirmDialogComponent` — modal de confirmación

---

## 5. Fase 4 — Integración AniList

### S8 — AniList GraphQL Proxy (29/08)

**Objetivo**: Endpoint `GET /external/search?q=`, frontend autocomplete.

#### GraphQL Query para AniList

```graphql
query ($search: String, $type: MediaType) {
  Page(perPage: 10) {
    media(search: $search, type: $type) {
      id
      title { romaji english }
      coverImage { large }
      description(asHtml: false)
      episodes
      chapters
      format
      countryOfOrigin
    }
  }
}
```

#### Endpoint en el Worker

```typescript
app.get('/api/external/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'Missing query parameter q' }, 400);

  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: ANILIST_QUERY,
      variables: { search: q },
    }),
  });

  const data = await response.json();
  return c.json(data);
});
```

#### Frontend — Autocomplete

Componente `SearchDialogComponent` que:
1. Debounce 300ms en el input
2. Llama a `GET /api/external/search?q=...`
3. Muestra resultados con portadas
4. Al seleccionar, autocompleta el form de crear ítem

---

## 6. Fase 5 — Backups

### S9 — Export/Import JSON (01/09)

**Objetivo**: Endpoint `GET /backup/export`, `POST /backup/import`, frontend en ajustes.

#### Export Endpoint

```typescript
app.get('/api/backup/export', async (c) => {
  const db = c.env['tsuzuki-db'];

  const items = await db.prepare('SELECT * FROM media_items').all();
  const history = await db.prepare('SELECT * FROM progress_history').all();

  const backup = {
    version: 1,
    exported_at: new Date().toISOString(),
    items: items.results,
    progress_history: history.results,
  };

  return c.json(backup);
});
```

#### Import Endpoint

```typescript
app.post('/api/backup/import', async (c) => {
  const db = c.env['tsuzuki-db'];
  const body = await c.req.json();

  // Validar schema del backup
  const schema = z.object({
    version: z.literal(1),
    items: z.array(z.any()),
    progress_history: z.array(z.any()),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid backup format' }, 400);
  }

  // Borrar todo y reimportar (transaccional)
  await db.batch([
    db.prepare('DELETE FROM progress_history'),
    db.prepare('DELETE FROM media_items'),
    // Insertar items
    ...parsed.data.items.map((item: any) =>
      db.prepare(`INSERT INTO media_items VALUES (${
        Object.keys(item).map(() => '?').join(',')
      })`).bind(...Object.values(item))
    ),
    // Insertar historial
    ...parsed.data.progress_history.map((h: any) =>
      db.prepare(`INSERT INTO progress_history VALUES (${
        Object.keys(h).map(() => '?').join(',')
      })`).bind(...Object.values(h))
    ),
  ]);

  return c.json({ imported: true, count: parsed.data.items.length });
});
```

---

### S10 — Cron Worker (04/09)

**Objetivo**: Daily 04:00 UTC, D1→R2, push a GitHub.

#### Configurar Cron en wrangler.jsonc

```jsonc
{
  "triggers": {
    "crons": ["0 4 * * *"]  // 04:00 UTC diario
  }
}
```

#### Cron Worker

Crear `workers/cron/index.ts`:

```typescript
interface Env {
  'tsuzuki-db': D1Database;
  'tsuzuki-backups': R2Bucket;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const date = new Date().toISOString().split('T')[0];

    // 1. Export D1
    const items = await env['tsuzuki-db']
      .prepare('SELECT * FROM media_items').all();
    const history = await env['tsuzuki-db']
      .prepare('SELECT * FROM progress_history').all();

    const backup = {
      version: 1,
      exported_at: new Date().toISOString(),
      items: items.results,
      progress_history: history.results,
    };

    const backupJson = JSON.stringify(backup, null, 2);

    // 2. Upload to R2
    await env['tsuzuki-backups'].put(`backups/${date}.json`, backupJson, {
      httpMetadata: { contentType: 'application/json' },
    });

    // 3. Prune old backups (> 30 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const objects = await env['tsuzuki-backups'].list({ prefix: 'backups/' });
    for (const obj of objects.objects) {
      const fileDate = new Date(obj.key.replace('backups/', '').replace('.json', ''));
      if (fileDate < cutoff) {
        await env['tsuzuki-backups'].delete(obj.key);
      }
    }

    // 4. Push to GitHub
    const encoded = btoa(backupJson);
    const githubApi = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/backup.json`;

    // Check if file exists (to get SHA for update)
    let sha: string | undefined;
    try {
      const existing = await fetch(githubApi, {
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` },
      });
      if (existing.ok) {
        const data = await existing.json() as any;
        sha = data.sha;
      }
    } catch {}

    await fetch(githubApi, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `backup ${date}`,
        content: encoded,
        sha: sha ?? undefined,
      }),
    });
  },
};
```

#### Deploy del Cron Worker

```bash
cd workers
wrangler deploy
```

#### Verificar que el Cron está registrado

```bash
wrangler schedules list
# Debe mostrar el cron "0 4 * * *"
```

---

## 7. Fase 6 — PWA + Offline

### S11 — PWA + Cache (07/09)

**Objetivo**: ngsw config optimizada, cache de biblioteca, splash, install prompt.

La configuración base ya existe en `ngsw-config.json`. En esta sesión:

1. Agregar **data group** para cache de la API:

```json
{
  "dataGroups": [
    {
      "name": "items-api",
      "urls": ["/api/items"],
      "cacheConfig": {
        "timeout": "5m",
        "maxSize": 50,
        "maxAge": "1h",
        "strategy": "freshness"
      }
    }
  ]
}
```

2. Implementar **install prompt** en Angular:
   - Capturar evento `beforeinstallprompt`
   - Mostrar botón "Instalar app" cuando esté disponible
   - Guardar preferencia en `localStorage`

3. Splash screen: verificar que `manifest.webmanifest` tiene `background_color` y `theme_color` correctos (ya está configurado).

---

## 8. Fase 7 — Polish + QA

### S12 — WCAG AA + Fixes (10/09)

**Objetivo**: Focus management, contraste, ARIA completo, tests finales.

Checklist:
- [ ] Tab order lógico en todas las vistas
- [ ] Focus visible en todos los interactive elements
- [ ] Labels ARIA en todos los inputs
- [ ] Contraste ≥ 4.5:1 en todos los textos (verificar con herramientas)
- [ ] Screen reader announce para cambios dinámicos (`aria-live`)
- [ ] AXE audit 0 violaciones en todas las vistas
- [ ] Test suite completa corriendo

---

## 9. Fase 8 — Multi-Tenant / Multi-Usuario (Post-MVP)

> **Objetivo**: Permitir múltiples usuarios aislados compartiendo la misma instancia de DB y Workers mediante aislamiento por la columna `user_id`.

### S13 — Migración Multi-Tenant + Aislamiento en API

1. **Migración SQL (`migrations/002_multi_tenant.sql`)**:
   - Agregar columna `user_id` a la tabla `media_items`.
   - Asignar un `user_id` por defecto para los registros creados durante el MVP.
   - Crear índices compuestos `(user_id, status)` y `(user_id, type)` para optimizar búsquedas aisladas por usuario.

2. **Auth Middleware en Hono**:
   - Extraer e identificar el `user_id` único desde las cabeceras de sesión de Cloudflare Access (`CF-Access-Authenticated-User-Email` o subject del JWT token).
   - Inyectar el `userId` en el contexto `c` de Hono.

3. **Refactor de Endpoints (Hono)**:
   - Modificar todas las consultas SQL en `workers/api/` para incluir obligatoriamente la cláusula `WHERE user_id = ?`.
   - Garantizar que los comandos de actualización (`PATCH`), eliminación (`DELETE`) e historial (`POST /progress`) verifiquen la propiedad del ítem antes de ejecutar la transacción.

---

## 10. Comandos de Referencia

### Desarrollo

```bash
# Frontend
ng serve                    # Dev server en localhost:4200
ng build --configuration production   # Build producción
ng test --watch=false       # Tests unitarios

# Worker
cd workers
npx vitest run              # Tests del Worker
wrangler dev                # Dev server del Worker (localhost:8787)
```

### Deploy

```bash
# Build + deploy frontend a Cloudflare Pages
ng build --configuration production
wrangler pages deploy dist/index/browser --project-name=tsuzuki

# Deploy Worker
cd workers
wrangler deploy

# Deploy con wrangler (Pages)
wrangler pages deploy dist/index/browser
```

### Base de Datos

```bash
# Listar databases
wrangler d1 list

# Ejecutar migración (local)
wrangler d1 execute tsuzuki-db --file=migrations/001_initial.sql

# Ejecutar migración (remoto/producción)
wrangler d1 execute tsuzuki-db --remote --file=migrations/001_initial.sql

# Consultar datos (local)
wrangler d1 execute tsuzuki-db --command "SELECT * FROM media_items LIMIT 10"

# Consultar datos (remoto)
wrangler d1 execute tsuzuki-db --remote --command "SELECT * FROM media_items LIMIT 10"

# Backup manual de D1
wrangler d1 export tsuzuki-db --output backup.sql
```

### R2

```bash
# Listar buckets
wrangler r2 bucket list

# Listar archivos en un bucket
wrangler r2 object list tsuzuki-backups --prefix=backups/

# Descargar un backup
wrangler r2 object get tsuzuki-backups backups/2026-08-08.json --file backup.json
```

### Secrets

```bash
# Listar secrets
wrangler secret list

# Agregar secret
wrangler secret put SECRET_NAME
```

### Workers

```bash
# Deploy
wrangler deploy

# Ver logs en tiempo real
wrangler tail

# Listar workers
wrangler list
```

### Testing

```bash
# Frontend tests
ng test --watch=false

# Worker tests
cd workers && npx vitest run

# AXE audit (en un test de componente)
# Ya incluido en home.component.spec.ts
```

---

## 10. Troubleshooting

### Errores comunes

| Error | Causa | Solución |
|---|---|---|
| `D1_DATABASE_NOT_FOUND` | `database_id` incorrecto en `wrangler.jsonc` | Reemplazar con el ID real de `wrangler d1 list` |
| `Unauthorized` al acceder a la API | Cloudflare Access no configurado o sesión expirada | Verificar Access en Zero Trust Dashboard, re-login |
| `CORS error` en desarrollo | Worker tiene `origin: '*'` pero Pages está en otro puerto | Agregar `http://localhost:4200` a los origins permitidos |
| `Chunk load error` | Service Worker sirviendo versión vieja | Limpiar cache del SW: Application → Service Workers → Unregister |
| `wrangler deploy` falla | `node_modules` no instalado en `workers/` | Ejecutar `cd workers && npm install` |
| Tests fallan con `D1` | Tests unitarios no tienen D1 real | Usar SQLite mock o `miniflare` para tests |

### Useful debugging

```bash
# Verificar build del frontend
ng build --configuration production 2>&1 | head -50

# Verificar que el Worker compila
cd workers && npx wrangler deploy --dry-run

# Verificar config de wrangler
wrangler config

# Verificar estado de Pages project
wrangler pages project list
```

---

> **Próximo paso**: Empezar con S1 — D1 Schema + Migrations.
