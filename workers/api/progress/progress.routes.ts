import { Hono } from 'hono';
import type { Env } from '../shared/types';
import { AppError } from '../shared/errors';
import { ulid } from '../shared/ulid';
import { ProgressSchema } from './progress.schemas';

const progress = new Hono<Env>();

interface MediaItemRecord {
  id: string;
  current_chapter: number;
  total_chapters: number | null;
}

// ─── POST /:id/progress — Increment or set chapter ─────────────────
progress.post('/:id/progress', async (c) => {
  const db = c.var.db;
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = ProgressSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', JSON.stringify(parsed.error.flatten()), 400);
  }

  const item = await db
    .prepare('SELECT * FROM media_items WHERE id = ?')
    .bind(id)
    .first<MediaItemRecord>();

  if (!item) {
    throw new AppError('NOT_FOUND', 'Item not found', 404);
  }

  const currentChapter = item.current_chapter;
  let newChapter: number;

  if (parsed.data.mode === 'delta') {
    newChapter = currentChapter + parsed.data.delta;
  } else {
    newChapter = parsed.data.value;
  }

  // Validate constraints
  if (newChapter < 0) {
    throw new AppError('INVALID_PROGRESS', 'Chapter cannot be negative', 400);
  }
  if (item.total_chapters != null && newChapter > item.total_chapters) {
    throw new AppError(
      'INVALID_PROGRESS',
      `Chapter ${newChapter} exceeds total ${item.total_chapters}`,
      400,
    );
  }

  const historyId = ulid();

  // Transactional batch: update item + insert history
  await db.batch([
    db.prepare(
      `UPDATE media_items SET current_chapter = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(newChapter, id),
    db.prepare(
      `INSERT INTO progress_history (id, item_id, from_chapter, to_chapter, changed_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(historyId, id, currentChapter, newChapter),
  ]);

  const updated = await db.prepare('SELECT * FROM media_items WHERE id = ?').bind(id).first();
  return c.json(updated);
});

export { progress as progressRouter };


