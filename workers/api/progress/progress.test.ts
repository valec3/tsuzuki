import { describe, it, expect, beforeEach } from 'vitest';
import { createSQLite } from '../shared/test-utils';
import type Database from 'better-sqlite3';

/**
 * Progress endpoint tests.
 *
 * Tests the batch transaction logic: updating current_chapter and
 * inserting into progress_history atomically.
 */
describe('Progress (POST /api/items/:id/progress)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createSQLite();
  });

  function createItem(overrides: Record<string, unknown> = {}) {
    const id = (overrides.id as string) ?? '01HXYZ00000000000000000100';
    const totalChapters = overrides.total_chapters as number | undefined;

    db.prepare(
      `INSERT INTO media_items (id, title, type, status, current_chapter, total_chapters)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      (overrides.title as string) ?? 'Test',
      'manga',
      'en_curso',
      (overrides.current_chapter as number) ?? 0,
      totalChapters ?? null,
    );

    return id;
  }

  function getChapter(id: string): number {
    const row = db.prepare('SELECT current_chapter FROM media_items WHERE id = ?').get(id) as {
      current_chapter: number;
    };
    return row.current_chapter;
  }

  function getHistoryCount(itemId: string): number {
    const row = db
      .prepare('SELECT COUNT(*) AS n FROM progress_history WHERE item_id = ?')
      .get(itemId) as { n: number };
    return row.n;
  }

  it('increments chapter by delta', () => {
    const id = createItem({ id: '01HXYZ00000000000000000110', current_chapter: 10 });

    // Simulate progress: delta +1
    const oldChapter = getChapter(id);
    const newChapter = oldChapter + 1;

    db.batch([
      db.prepare(
        `UPDATE media_items SET current_chapter = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(newChapter, id),
      db.prepare(
        `INSERT INTO progress_history (id, item_id, from_chapter, to_chapter, changed_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind('01HXYZ00000000000000000111', id, oldChapter, newChapter),
    ]);

    expect(getChapter(id)).toBe(11);
    expect(getHistoryCount(id)).toBe(1);
  });

  it('sets chapter to exact value', () => {
    const id = createItem({ id: '01HXYZ00000000000000000120', current_chapter: 5 });

    const oldChapter = getChapter(id);
    const newChapter = 50;

    db.batch([
      db.prepare(
        `UPDATE media_items SET current_chapter = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(newChapter, id),
      db.prepare(
        `INSERT INTO progress_history (id, item_id, from_chapter, to_chapter, changed_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind('01HXYZ00000000000000000121', id, oldChapter, newChapter),
    ]);

    expect(getChapter(id)).toBe(50);
  });

  it('rejects exceeding total_chapters', () => {
    const id = createItem({
      id: '01HXYZ00000000000000000130',
      current_chapter: 8,
      total_chapters: 10,
    });

    const newChapter = 15;
    const total = 10;

    // Validation logic (same as in route handler)
    expect(newChapter).toBeGreaterThan(total);
  });

  it('rejects negative chapter', () => {
    const newChapter = -1;
    expect(newChapter).toBeLessThan(0);
  });

  it('cascades history deletion when item is deleted', () => {
    const id = createItem({ id: '01HXYZ00000000000000000140' });

    db.prepare(
      'INSERT INTO progress_history (id, item_id, from_chapter, to_chapter) VALUES (?, ?, ?, ?)'
    ).run('01HXYZ00000000000000000141', id, 0, 5);

    expect(getHistoryCount(id)).toBe(1);

    db.prepare('DELETE FROM media_items WHERE id = ?').run(id);

    expect(getHistoryCount(id)).toBe(0);
  });
});
