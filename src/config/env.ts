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

  // Overridable so integration tests / a future testnet switch can point the Binance
  // adapters elsewhere without touching adapter code — real Binance endpoints by default.
  // z.url() not z.string().url() — the latter is deprecated as of Zod 4 (confirmed against
  // the installed package's own type definitions, node_modules/zod/v4/classic/schemas.d.ts).
  BINANCE_REST_BASE_URL: z.url().default('https://api.binance.com'),
  BINANCE_WS_BASE_URL: z.url().default('wss://stream.binance.com:9443/stream'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
