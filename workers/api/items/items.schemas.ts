import { z } from 'zod';

export const MediaType = z.enum([
  'anime',
  'manga',
  'manhwa',
  'manhua',
  'novela_ligera',
  'novela_web',
  'donghua',
  'otro',
]);

export const ItemStatus = z.enum([
  'en_curso',
  'completado',
  'pendiente',
  'en_pausa',
  'abandonado',
  'reconsumiendo',
]);

export const CreateItemSchema = z.object({
  title: z.string().min(1).max(500),
  type: MediaType.default('otro'),
  status: ItemStatus.default('pendiente'),
  cover_url: z.string().url().nullable().optional(),
  synopsis: z.string().nullable().optional(),
  current_chapter: z.number().int().min(0).default(0),
  total_chapters: z.number().int().min(1).nullable().optional(),
  score: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().nullable().optional(),
  source_url: z.string().url().nullable().optional(),
  external_id: z.string().nullable().optional(),
  external_source: z.enum(['anilist', 'manual']).default('manual'),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
});

export type CreateItemInput = z.infer<typeof CreateItemSchema>;

export const UpdateItemSchema = CreateItemSchema.partial();

export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
