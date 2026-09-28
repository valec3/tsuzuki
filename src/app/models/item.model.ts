/**
 * Tipos de contenido soportados en Tsuzuki.
 * Alineado con el CHECK constraint de la base de datos D1 y el schema Zod.
 */
export type MediaType =
  | 'anime'
  | 'manga'
  | 'manhwa'
  | 'manhua'
  | 'novela_ligera'
  | 'novela_web'
  | 'donghua'
  | 'otro';

/**
 * Estados posibles de un ítem en la biblioteca.
 */
export type ItemStatus =
  | 'en_curso'
  | 'completado'
  | 'pendiente'
  | 'en_pausa'
  | 'abandonado'
  | 'reconsumiendo';

/**
 * Entidad principal de un ítem de medios (MediaItem).
 */
export interface MediaItem {
  id: string;
  title: string;
  type: MediaType;
  status: ItemStatus;
  cover_url: string | null;
  synopsis: string | null;
  current_chapter: number;
  total_chapters: number | null;
  score: number | null;
  notes: string | null;
  source_url: string | null;
  external_id: string | null;
  external_source: 'anilist' | 'manual';
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Parámetros opcionales para filtrar y ordenar la lista de ítems.
 */
export interface ItemFilters {
  status?: ItemStatus;
  type?: MediaType;
  q?: string;
  sort?: 'updated_at' | 'title' | 'score' | 'created_at';
  order?: 'asc' | 'desc';
}

/**
 * Resumen de contadores y estadísticas agregadas para la barra de filtros.
 */
export interface ItemStats {
  total: number;
  by_status: Record<string, number>;
  total_chapters: number;
}



export const ITEM_STATUS_OPTIONS: { value: ItemStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'completado', label: 'Completados' },
  { value: 'en_pausa', label: 'En pausa' },
  { value: 'abandonado', label: 'Abandonados' },
];
