-- Tsuzuki — Migración inicial
-- Fecha: 2026-08-17
-- Basado en: 01-requerimientos-y-arquitectura.md §7

-- ============================================================
-- TABLA: media_items
-- ============================================================
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

-- ============================================================
-- TABLA: media_sources (uno a muchos — cada item tiene N fuentes)
-- ============================================================
CREATE TABLE IF NOT EXISTS media_sources (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- TABLA: progress_history
-- ============================================================
CREATE TABLE IF NOT EXISTS progress_history (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  from_chapter INTEGER NOT NULL,
  to_chapter INTEGER NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ÍNDICES (§7.2)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_items_status ON media_items(status);
CREATE INDEX IF NOT EXISTS idx_items_type ON media_items(type);
CREATE INDEX IF NOT EXISTS idx_items_updated ON media_items(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_title ON media_items(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_history_item ON progress_history(item_id, changed_at);

-- Índice para búsquedas de fuentes por ítem
CREATE INDEX IF NOT EXISTS idx_sources_item ON media_sources(item_id);
