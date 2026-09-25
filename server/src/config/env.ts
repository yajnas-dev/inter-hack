import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: nodeEnv === 'test' ? path.resolve(process.cwd(), '.env.test') : undefined });

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production', 'bench']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().optional(),
  MONGO_URI_TEST: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: bool.default('false'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(50),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  LOG_ACCESS: bool.optional(),
  ENABLE_METRICS: bool.default('false'),
  ENABLE_DOCS: bool.optional(),
  SERVE_CLIENT: bool.default('true'),
  WEB_CONCURRENCY: z.coerce.number().int().positive().optional()
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}
const raw = parsed.data;

const isTest = raw.NODE_ENV === 'test';
const isProd = raw.NODE_ENV === 'production';

if (isProd && (!raw.JWT_SECRET || raw.JWT_SECRET.startsWith('dev_secret'))) {
  throw new Error('JWT_SECRET must be set to a long random value in production (the development default is refused).');
}

export const env = {
  nodeEnv: raw.NODE_ENV,
  isTest,
  isProd,
  port: raw.PORT,
  mongoUri: isTest ? raw.MONGO_URI_TEST : raw.MONGO_URI,
  jwtSecret: raw.JWT_SECRET ?? 'dev_secret_change_me_please_1234567890',
  accessTokenTtl: raw.ACCESS_TOKEN_TTL,
  refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
  cookieSecure: raw.COOKIE_SECURE,
  clientUrl: raw.CLIENT_URL,
  rateLimitPerMin: raw.RATE_LIMIT_PER_MIN,
  authRateLimit: raw.AUTH_RATE_LIMIT,
  logLevel: raw.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  /** Log every request (default: development only; production logs errors and slow requests). */
  logAccess: raw.LOG_ACCESS ?? (!isProd && !isTest),
  enableMetrics: raw.ENABLE_METRICS,
  enableDocs: raw.ENABLE_DOCS ?? !isProd,
  serveClient: raw.SERVE_CLIENT,
  webConcurrency: raw.WEB_CONCURRENCY
} as const;

export type Env = typeof env;
