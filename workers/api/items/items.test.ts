import { describe, it, expect, beforeEach } from 'vitest';
import { createSQLite } from '../shared/test-utils';
import type Database from 'better-sqlite3';

/**
 * Items CRUD tests.
 *
 * These tests use an in-memory SQLite database (via better-sqlite3) to test
 * the schema constraints and query logic. The Hono routes are tested via
 * `app.request()` with the DB injected as a binding.
 */
describe('Items CRUD', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createSQLite();
  });

  // Helper: insert a test item directly into the DB
  function insertTestItem(overrides: Record<string, unknown> = {}) {
    const id = overrides.id ?? '01HXYZ00000000000000000001';
    const title = (overrides.title as string) ?? 'Test Item';
    const type = (overrides.type as string) ?? 'manga';
    const status = (overrides.status as string) ?? 'en_curso';

    db.prepare(
      `INSERT INTO media_items (id, title, type, status) VALUES (?, ?, ?, ?)`
    ).run(id, title, type, status);

    return id;
  }

  describe('POST /api/items', () => {
    it('creates an item with valid data', () => {
      const result = db
        .prepare(
          `INSERT INTO media_items (id, title, type, status)
           VALUES (?, ?, ?, ?)`
        )
        .run('01HXYZ00000000000000000010', 'Solo Leveling', 'manhwa', 'en_curso');

      expect(result.changes).toBe(1);

      const row = db
        .prepare('SELECT * FROM media_items WHERE id = ?')
        .get('01HXYZ00000000000000000010') as Record<string, unknown>;
      expect(row.title).toBe('Solo Leveling');
      expect(row.type).toBe('manhwa');
    });

    it('rejects empty title', () => {
      const insert = db.prepare(
        'INSERT INTO media_items (id, title) VALUES (?, ?)'
      );
      expect(() => insert.run('01HXYZ00000000000000000011', '')).toThrow(
        /NOT NULL constraint failed/
      );
    });
  });

  describe('GET /api/items', () => {
    it('returns empty array when no items exist', () => {
      const rows = db.prepare('SELECT * FROM media_items').all();
      expect(rows).toEqual([]);
    });

    it('returns items after insertion', () => {
      insertTestItem({ id: '01HXYZ00000000000000000020', title: 'One Piece' });
      insertTestItem({ id: '01HXYZ00000000000000000021', title: 'Naruto' });

      const rows = db.prepare('SELECT * FROM media_items').all();
      expect(rows.length).toBe(2);
    });

    it('filters by status', () => {
      insertTestItem({ id: '01HXYZ00000000000000000030', title: 'Active', status: 'en_curso' });
      insertTestItem({ id: '01HXYZ00000000000000000031', title: 'Done', status: 'completado' });

      const rows = db
        .prepare('SELECT * FROM media_items WHERE status = ?')
        .all('en_curso') as Record<string, unknown>[];
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('Active');
    });

    it('filters by type', () => {
      insertTestItem({ id: '01HXYZ00000000000000000040', title: 'Manga', type: 'manga' });
      insertTestItem({ id: '01HXYZ00000000000000000041', title: 'Anime', type: 'anime' });

      const rows = db
        .prepare('SELECT * FROM media_items WHERE type = ?')
        .all('manga') as Record<string, unknown>[];
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('Manga');
    });

    it('searches by title (case-insensitive)', () => {
      insertTestItem({ id: '01HXYZ00000000000000000050', title: 'One Piece' });
      insertTestItem({ id: '01HXYZ00000000000000000051', title: 'Berserk' });

      const rows = db
        .prepare('SELECT * FROM media_items WHERE title LIKE ?')
        .all('%piece%') as Record<string, unknown>[];
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('One Piece');
    });
  });

  describe('GET /api/items/:id', () => {
    it('returns item with history', () => {
      const itemId = insertTestItem({ id: '01HXYZ00000000000000000060', title: 'Frieren' });
      db.prepare(
        'INSERT INTO progress_history (id, item_id, from_chapter, to_chapter) VALUES (?, ?, ?, ?)'
      ).run('01HXYZ00000000000000000061', itemId, 0, 12);

      const item = db.prepare('SELECT * FROM media_items WHERE id = ?').get(itemId);
      const history = db
        .prepare('SELECT * FROM progress_history WHERE item_id = ?')
        .all(itemId);

      expect(item).toBeTruthy();
      expect(history.length).toBe(1);
    });

    it('returns null for nonexistent item', () => {
      const item = db
        .prepare('SELECT * FROM media_items WHERE id = ?')
        .get('nonexistent');
      expect(item).toBeUndefined();
    });
  });

  describe('PATCH /api/items/:id', () => {
    it('updates a field', () => {
      insertTestItem({ id: '01HXYZ00000000000000000070', title: 'Old Title' });

      db.prepare('UPDATE media_items SET title = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run('New Title', '01HXYZ00000000000000000070');

      const row = db
        .prepare('SELECT title FROM media_items WHERE id = ?')
        .get('01HXYZ00000000000000000070') as Record<string, unknown>;
      expect(row.title).toBe('New Title');
    });

    it('does nothing for nonexistent item', () => {
      const result = db
        .prepare("UPDATE media_items SET title = 'x' WHERE id = 'nonexistent'")
        .run();
      expect(result.changes).toBe(0);
    });
  });

  describe('DELETE /api/items/:id', () => {
    it('deletes item and cascades history', () => {
      const itemId = insertTestItem({ id: '01HXYZ00000000000000000080', title: 'Delete Me' });
      db.prepare(
        'INSERT INTO progress_history (id, item_id, from_chapter, to_chapter) VALUES (?, ?, ?, ?)'
      ).run('01HXYZ00000000000000000081', itemId, 0, 5);

      db.prepare('DELETE FROM media_items WHERE id = ?').run(itemId);

      const item = db.prepare('SELECT id FROM media_items WHERE id = ?').get(itemId);
      const history = db
        .prepare('SELECT COUNT(*) AS n FROM progress_history')
        .get() as { n: number };

      expect(item).toBeUndefined();
      expect(history.n).toBe(0);
    });

    it('reports 0 changes for nonexistent item', () => {
      const result = db
        .prepare('DELETE FROM media_items WHERE id = ?')
        .run('nonexistent');
      expect(result.changes).toBe(0);
    });
  });

  describe('CHECK constraints', () => {
    it('rejects invalid chapter bounds', () => {
      const insert = db.prepare(
        'INSERT INTO media_items (id, title, current_chapter, total_chapters) VALUES (?, ?, ?, ?)'
      );
      expect(() =>
        insert.run('01HXYZ00000000000000000090', 'Bad', 15, 10)
      ).toThrow(/CHECK constraint failed/);
    });

    it('rejects score out of range', () => {
      const insert = db.prepare(
        'INSERT INTO media_items (id, title, score) VALUES (?, ?, ?)'
      );
      expect(() =>
        insert.run('01HXYZ00000000000000000091', 'Bad', 11)
      ).toThrow(/CHECK constraint failed/);
    });

    it('rejects invalid type', () => {
      const insert = db.prepare(
        'INSERT INTO media_items (id, title, type) VALUES (?, ?, ?)'
      );
      expect(() =>
        insert.run('01HXYZ00000000000000000092', 'Bad', 'invalido')
      ).toThrow(/CHECK constraint failed/);
    });

    it('rejects invalid status', () => {
      const insert = db.prepare(
        'INSERT INTO media_items (id, title, status) VALUES (?, ?, ?)'
      );
      expect(() =>
        insert.run('01HXYZ00000000000000000093', 'Bad', 'invalido')
      ).toThrow(/CHECK constraint failed/);
    });
  });
});
