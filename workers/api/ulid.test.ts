import { afterEach, describe, expect, it, vi } from 'vitest';
import { ulid } from './ulid';

// 
const CROCKFORD_BASE32 = /^[0-9A-HJKMNP-TV-Z]{26}$/;

afterEach(() => {
  vi.useRealTimers();
});

describe('ulid', () => {
  it('returns a 26-character string', () => {
    expect(ulid()).toHaveLength(26);
  });

  it('produces different IDs across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => ulid()));
    expect(ids.size).toBe(1000);
  });

  it('is lexicographically sortable by time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const first = ulid();

    // Advance the clock so the second ULID carries a later timestamp.
    vi.setSystemTime(new Date('2026-01-01T00:00:00.001Z'));
    const second = ulid();

    expect(second > first).toBe(true);
  });

  it('only contains valid Crockford base32 characters', () => {
    for (let i = 0; i < 1000; i++) {
      expect(ulid()).toMatch(CROCKFORD_BASE32);
    }
  });
});
