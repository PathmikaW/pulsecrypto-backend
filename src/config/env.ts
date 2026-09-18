import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  REQUIRED_PAIRS: z
    .string()
    .default('BTCUSDT,ETHUSDT,SOLUSDT,DOGEUSDT,XRPUSDT'),
  EXTRA_PAIRS_COUNT: z.coerce.number().int().nonnegative().default(3),
  PAIR_RESOLUTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  ORDER_BOOK_PRESSURE_DEPTH: z.coerce.number().int().positive().default(10),
  BROADCAST_INTERVAL_MS: z.coerce.number().int().positive().default(100),
  MAX_BUFFERED_BYTES: z.coerce.number().int().positive().default(65536),
  MAX_CONSECUTIVE_SKIPS: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
