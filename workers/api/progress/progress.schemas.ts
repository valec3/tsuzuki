import { z } from 'zod';

export const ProgressSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('delta'),
    delta: z.number().int().min(1),
  }),
  z.object({
    mode: z.literal('value'),
    value: z.number().int().min(0),
  }),
]);

export type ProgressInput = z.infer<typeof ProgressSchema>;
