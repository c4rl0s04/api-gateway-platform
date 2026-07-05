import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.string().optional().default('3001'),
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida de PostgreSQL'),
});

// export const env = envSchema.parse(process.env);
