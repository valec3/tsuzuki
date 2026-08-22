import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createSQLite } from './shared/test-utils';

const ITEM = {
  id: '01HXYZ00000000000000000001',
  title: 'One Piece',
  type: 'manga',
  status: 'en_curso',
};

describe('D1 schema (migrations/001_initial.sql)', () => {
  let db: Database.Database;

  // Fresh database per test so constraints are verified in isolation.
  beforeEach(() => {
    db = createSQLite();
  });

  describe('happy path', () => {
    it('inserts a media item with all valid fields', () => {
      const result = db
        .prepare(
          `INSERT INTO media_items (
             id, title, type, status, cover_url, synopsis, current_chapter,
             total_chapters, score, notes, external_id, external_source,
             started_at, finished_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ITEM.id,
          ITEM.title,
          ITEM.type,
          ITEM.status,
          'https://example.com/cover.jpg',
          'Piratas y frutas del diablo.',
          15,
          120,
          9,
          'Lectura semanal',
          '12345',
          'anilist',
          '2026-01-01',
          null,
        );

      expect(result.changes).toBe(1);

      const row = db
        .prepare('SELECT * FROM media_items WHERE id = ?')
        .get(ITEM.id) as Record<string, unknown>;
      expect(row.title).toBe(ITEM.title);
      expect(row.score).toBe(9);
      expect(row.external_source).toBe('anilist');
      expect(row.created_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
    });

    it('inserts a media item with only required fields (optionals NULL)', () => {
      const result = db.prepare('INSERT INTO media_items (id, title) VALUES (?, ?)').run('01HXYZ00000000000000000002', 'Berserk');
      expect(result.changes).toBe(1);

      const row = db
        .prepare('SELECT * FROM media_items WHERE id = ?')
        .get('01HXYZ00000000000000000002') as Record<string, unknown>;
      expect(row.type).toBe('otro'); // DEFAULT
      expect(row.status).toBe('pendiente'); // DEFAULT
      expect(row.current_chapter).toBe(0); // DEFAULT
      expect(row.cover_url).toBeNull();
      expect(row.synopsis).toBeNull();
      expect(row.total_chapters).toBeNull();
      expect(row.score).toBeNull();
    });

    it('deletes an item and cascades the deletion to its history', () => {
      db.prepare('INSERT INTO media_items (id, title) VALUES (?, ?)').run('01HXYZ00000000000000000003', 'Frieren');
      db.prepare(
        'INSERT INTO progress_history (id, item_id, from_chapter, to_chapter) VALUES (?, ?, ?, ?)',
      ).run('01HXYZ00000000000000000004', '01HXYZ00000000000000000003', 0, 12);

      db.prepare('DELETE FROM media_items WHERE id = ?').run('01HXYZ00000000000000000003');

      const { n } = db.prepare('SELECT COUNT(*) AS n FROM progress_history').get() as { n: number };
      expect(n).toBe(0);
    });
  });

  describe('CHECK constraints — should fail', () => {
    it('rejects current_chapter = -1 (current_chapter >= 0)', () => {
      const insert = db.prepare(
        'INSERT INTO media_items (id, title, current_chapter) VALUES (?, ?, ?)',
      );
      expect(() => insert.run('01HXYZ00000000000000000010', ITEM.title, -1)).toThrow(
        /CHECK constraint failed/,
      );
    });

    it('rejects current_chapter = 15 with total_chapters = 10 (current_chapter <= total_chapters)', () => {
      const insert = db.prepare(
        'INSERT INTO media_items (id, title, current_chapter, total_chapters) VALUES (?, ?, ?, ?)',
      );
      expect(() => insert.run('01HXYZ00000000000000000011', ITEM.title, 15, 10)).toThrow(
        /CHECK constraint failed/,
      );
    });

    it('rejects score = 11 (score >= 1 AND score <= 10)', () => {
      const insert = db.prepare('INSERT INTO media_items (id, title, score) VALUES (?, ?, ?)');
      expect(() => insert.run('01HXYZ00000000000000000012', ITEM.title, 11)).toThrow(
        /CHECK constraint failed/,
      );
    });

    it("rejects type = 'invalido' (type IN (...))", () => {
      const insert = db.prepare('INSERT INTO media_items (id, title, type) VALUES (?, ?, ?)');
      expect(() => insert.run('01HXYZ00000000000000000013', ITEM.title, 'invalido')).toThrow(
        /CHECK constraint failed/,
      );
    });

    it("rejects status = 'invalido' (status IN (...))", () => {
      const insert = db.prepare('INSERT INTO media_items (id, title, status) VALUES (?, ?, ?)');
      expect(() => insert.run('01HXYZ00000000000000000014', ITEM.title, 'invalido')).toThrow(
        /CHECK constraint failed/,
      );
    });
  });

  describe('NOT NULL — should fail', () => {
    it('rejects an item without a title (title TEXT NOT NULL)', () => {
      const insert = db.prepare('INSERT INTO media_items (id) VALUES (?)');
      expect(() => insert.run('01HXYZ00000000000000000020')).toThrow(
        /NOT NULL constraint failed: media_items\.title/,
      );
    });
  });

  describe('FK + CASCADE', () => {
    it('rejects a media_source referencing a nonexistent item_id', () => {
      const insert = db.prepare(
        'INSERT INTO media_sources (id, item_id, url) VALUES (?, ?, ?)',
      );
      expect(() =>
        insert.run('01HXYZ00000000000000000030', 'no-existe', 'https://example.com'),
      ).toThrow(/FOREIGN KEY constraint failed/);
    });

    it('cascades deletion of media_sources when the item is deleted', () => {
      const itemId = '01HXYZ00000000000000000031';
      db.prepare('INSERT INTO media_items (id, title) VALUES (?, ?)').run(itemId, 'Vinland Saga');
      db.prepare('INSERT INTO media_sources (id, item_id, url) VALUES (?, ?, ?)').run(
        '01HXYZ00000000000000000032',
        itemId,
        'https://example.com/source',
      );

      db.prepare('DELETE FROM media_items WHERE id = ?').run(itemId);

      const { n } = db.prepare('SELECT COUNT(*) AS n FROM media_sources').get() as { n: number };
      expect(n).toBe(0);
    });

    it('cascades deletion of progress_history when the item is deleted', () => {
      const itemId = '01HXYZ00000000000000000033';
      db.prepare('INSERT INTO media_items (id, title) VALUES (?, ?)').run(itemId, 'Solo Leveling');
      db.prepare(
        'INSERT INTO progress_history (id, item_id, from_chapter, to_chapter) VALUES (?, ?, ?, ?)',
      ).run('01HXYZ00000000000000000034', itemId, 0, 8);

      db.prepare('DELETE FROM media_items WHERE id = ?').run(itemId);

      const { n } = db.prepare('SELECT COUNT(*) AS n FROM progress_history').get() as { n: number };
      expect(n).toBe(0);
    });
  });
});
