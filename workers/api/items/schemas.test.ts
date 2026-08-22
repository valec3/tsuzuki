import { describe, it, expect } from 'vitest';
import { CreateItemSchema, UpdateItemSchema } from './items.schemas';
import { ProgressSchema } from '../progress/progress.schemas';

describe('Items schemas (Zod)', () => {
  describe('CreateItemSchema', () => {
    it('accepts minimal valid input', () => {
      const result = CreateItemSchema.safeParse({ title: 'One Piece' });
      expect(result.success).toBe(true);
    });

    it('accepts full input', () => {
      const result = CreateItemSchema.safeParse({
        title: 'Solo Leveling',
        type: 'manhwa',
        status: 'en_curso',
        cover_url: 'https://example.com/cover.jpg',
        synopsis: 'A hunter story',
        current_chapter: 50,
        total_chapters: 200,
        score: 9,
        notes: 'Great series',
        source_url: 'https://example.com/read',
        external_id: '12345',
        external_source: 'anilist',
        started_at: '2026-01-01',
        finished_at: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Solo Leveling');
        expect(result.data.type).toBe('manhwa');
        expect(result.data.score).toBe(9);
      }
    });

    it('rejects empty title', () => {
      const result = CreateItemSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
    });

    it('rejects title > 500 chars', () => {
      const result = CreateItemSchema.safeParse({ title: 'x'.repeat(501) });
      expect(result.success).toBe(false);
    });

    it('rejects invalid type', () => {
      const result = CreateItemSchema.safeParse({ title: 'Test', type: 'invalido' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = CreateItemSchema.safeParse({ title: 'Test', status: 'invalido' });
      expect(result.success).toBe(false);
    });

    it('rejects score < 1', () => {
      const result = CreateItemSchema.safeParse({ title: 'Test', score: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects score > 10', () => {
      const result = CreateItemSchema.safeParse({ title: 'Test', score: 11 });
      expect(result.success).toBe(false);
    });

    it('applies defaults', () => {
      const result = CreateItemSchema.safeParse({ title: 'Test' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('otro');
        expect(result.data.status).toBe('pendiente');
        expect(result.data.current_chapter).toBe(0);
        expect(result.data.external_source).toBe('manual');
      }
    });
  });

  describe('UpdateItemSchema', () => {
    it('accepts partial input', () => {
      const result = UpdateItemSchema.safeParse({ score: 8 });
      expect(result.success).toBe(true);
    });

    it('accepts empty object (no-op update)', () => {
      const result = UpdateItemSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects invalid type in partial', () => {
      const result = UpdateItemSchema.safeParse({ type: 'invalido' });
      expect(result.success).toBe(false);
    });
  });
});

describe('ProgressSchema (Zod)', () => {
  it('accepts delta mode', () => {
    const result = ProgressSchema.safeParse({ mode: 'delta', delta: 1 });
    expect(result.success).toBe(true);
  });

  it('accepts value mode', () => {
    const result = ProgressSchema.safeParse({ mode: 'value', value: 50 });
    expect(result.success).toBe(true);
  });

  it('rejects delta < 1', () => {
    const result = ProgressSchema.safeParse({ mode: 'delta', delta: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative value', () => {
    const result = ProgressSchema.safeParse({ mode: 'value', value: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects missing mode', () => {
    const result = ProgressSchema.safeParse({ delta: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid mode', () => {
    const result = ProgressSchema.safeParse({ mode: 'invalido', delta: 1 });
    expect(result.success).toBe(false);
  });
});
