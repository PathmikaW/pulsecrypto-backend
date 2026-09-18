import { env } from './env.js';

export const REQUIRED_PAIRS: string[] = env.REQUIRED_PAIRS.split(',').map((s) => s.trim());
