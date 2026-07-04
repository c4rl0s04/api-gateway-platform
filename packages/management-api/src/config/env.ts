import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.string().optional().default('3002'),
  DATABASE_URL: z.string().min(1),
});
