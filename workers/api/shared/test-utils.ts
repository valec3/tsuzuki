import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';

const MIGRATION_PATH = new URL('../../../migrations/001_initial.sql', import.meta.url);

/**
 * Creates an in-memory SQLite database with the Tsuzuki schema applied.
 * Foreign keys are enabled so ON DELETE CASCADE behaves like in Cloudflare D1.
 *
 * Requires better-sqlite3 to work. If the native module is unavailable
 * (e.g. incompatible Node.js version), use the Hono route tests instead.
 */
export function createSQLite(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(MIGRATION_PATH, 'utf-8'));
  return db;
}
