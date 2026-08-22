import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../shared/types';
import { AppError } from '../shared/errors';
import { ulid } from '../shared/ulid';
import { CreateItemSchema, UpdateItemSchema } from './items.schemas';

const items = new Hono<Env>();

// ─── GET / — List items with filters ────────────────────────────────
items.get('/', async (c) => {
  const db = c.var.db;
  if (!db) {
    return c.json([]);
  }

  const status = c.req.query('status');

  const type = c.req.query('type');
  const q = c.req.query('q');
  const sort = c.req.query('sort') ?? 'updated_at';
  const order = c.req.query('order') ?? 'desc';

  let sql = 'SELECT * FROM media_items WHERE 1=1';
  const params: unknown[] = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (q) {
    sql += ' AND title LIKE ?';
    params.push(`%${q}%`);
  }

  const allowedSorts = ['updated_at', 'title', 'score', 'created_at'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'updated_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortCol} ${sortOrder}`;

  const { results } = await db.prepare(sql).bind(...params).all();
  return c.json(results);
});

// ─── GET /:id — Get single item with history ───────────────────────
items.get('/:id', async (c) => {
  const db = c.var.db;
  const id = c.req.param('id');

  const item = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
  if (!item) {
    throw new AppError('NOT_FOUND', 'Item not found', 404);
  }

  const { results: history } = await db
    .prepare('SELECT * FROM progress_history WHERE item_id = ? ORDER BY changed_at DESC')
    .bind(id)
    .all();

  return c.json({ ...item, history });
});

// ─── POST / — Create item ──────────────────────────────────────────
items.post('/', async (c) => {
  const db = c.var.db;
  const body = await c.req.json();
  const parsed = CreateItemSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', JSON.stringify(parsed.error.flatten()), 400);
  }

  const id = ulid();
  const now = new Date().toISOString();
  const data = parsed.data;

  await db
    .prepare(
      `INSERT INTO media_items (
        id, title, type, status, cover_url, synopsis,
        current_chapter, total_chapters, score, notes, source_url,
        external_id, external_source, started_at, finished_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.title,
      data.type,
      data.status,
      data.cover_url ?? null,
      data.synopsis ?? null,
      data.current_chapter,
      data.total_chapters ?? null,
      data.score ?? null,
      data.notes ?? null,
      data.source_url ?? null,
      data.external_id ?? null,
      data.external_source,
      data.started_at ?? null,
      data.finished_at ?? null,
      now,
      now,
    )
    .run();

  const item = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
  return c.json(item, 201);
});

// ─── PATCH /:id — Update item ──────────────────────────────────────
items.patch('/:id', async (c) => {
  const db = c.var.db;
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateItemSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', JSON.stringify(parsed.error.flatten()), 400);
  }

  const existing = await db.prepare('SELECT id FROM media_items WHERE id = ?').bind(id).first();
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Item not found', 404);
  }

  const updates = parsed.data;
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];

  for (const [key, val] of Object.entries(updates)) {
    sets.push(`${key} = ?`);
    vals.push(val ?? null);
  }
  vals.push(id);

  await db
    .prepare(`UPDATE media_items SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run();

  const item = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
  return c.json(item);
});

// ─── DELETE /:id — Delete item (cascades history) ──────────────────
items.delete('/:id', async (c) => {
  const db = c.var.db;
  const id = c.req.param('id');

  const result = await db.prepare('DELETE FROM media_items WHERE id = ?').bind(id).run();

  if (result.meta.changes === 0) {
    throw new AppError('NOT_FOUND', 'Item not found', 404);
  }

  return c.json({ deleted: true });
});

export { items as itemsRouter };

