import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: nodeEnv === 'test' ? path.resolve(process.cwd(), '.env.test') : undefined });

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** Express "trust proxy": false (default: direct connections), a hop count, or true. Wrongly trusting lets clients spoof their IP. */
const trustProxy = z
  .string()
  .regex(/^(true|false|\d+)$/, 'TRUST_PROXY must be true, false or a hop count')
  .transform((v) => (v === 'true' ? true : v === 'false' ? false : Number(v)));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production', 'bench']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().optional(),
  MONGO_URI_TEST: z.string().optional(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').optional(),
  JWT_ISSUER: z.string().default('job-portal-api'),
  JWT_AUDIENCE: z.string().default('job-portal-clients'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).optional(),
  COOKIE_SECURE: bool.optional(),

  /** Comma-separated browser origins allowed by CORS. */
  CLIENT_URL: z.string().default('http://localhost:5173'),
  TRUST_PROXY: trustProxy.default('false'),

  RATE_LIMIT_ENABLED: bool.optional(),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  AI_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),

  /** Server-side only. Without it the match endpoint uses the deterministic heuristic. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().default('claude-opus-5'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(45_000),
  AI_ENABLED: bool.optional(),

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

const DEV_SECRET = 'dev_secret_change_me_please_1234567890';
if (
  isProd &&
  (!raw.JWT_SECRET || raw.JWT_SECRET.length < 32 || raw.JWT_SECRET.startsWith('dev_secret') || raw.JWT_SECRET.startsWith('change_this'))
) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters in production.');
}

export const env = {
  nodeEnv: raw.NODE_ENV,
  isTest,
  isProd,
  port: raw.PORT,
  mongoUri: isTest ? raw.MONGO_URI_TEST : raw.MONGO_URI,

  jwtSecret: raw.JWT_SECRET ?? DEV_SECRET,
  jwtIssuer: raw.JWT_ISSUER,
  jwtAudience: raw.JWT_AUDIENCE,
  accessTokenTtlSeconds: raw.ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
  /** Fewer rounds in tests keeps the suite fast; 12 elsewhere (OWASP minimum is 10). */
  bcryptRounds: raw.BCRYPT_ROUNDS ?? (isTest ? 4 : 12),
  cookieSecure: raw.COOKIE_SECURE ?? isProd,

  corsOrigins: raw.CLIENT_URL.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  trustProxy: raw.TRUST_PROXY,

  rateLimitEnabled: raw.RATE_LIMIT_ENABLED ?? !isTest,
  rateLimitPerMin: raw.RATE_LIMIT_PER_MIN,
  authRateLimit: raw.AUTH_RATE_LIMIT,
  aiRateLimitPerHour: raw.AI_RATE_LIMIT_PER_HOUR,

  anthropicApiKey: raw.ANTHROPIC_API_KEY,
  aiModel: raw.AI_MODEL,
  aiTimeoutMs: raw.AI_TIMEOUT_MS,
  /** Tests never call the real provider unless explicitly enabled. */
  aiEnabled: raw.AI_ENABLED ?? (!isTest && Boolean(raw.ANTHROPIC_API_KEY)),

  logLevel: raw.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  /** Log every request (default: development only; production logs errors and slow requests). */
  logAccess: raw.LOG_ACCESS ?? (!isProd && !isTest),
  enableMetrics: raw.ENABLE_METRICS,
  enableDocs: raw.ENABLE_DOCS ?? !isProd,
  serveClient: raw.SERVE_CLIENT,
  webConcurrency: raw.WEB_CONCURRENCY
} as const;

export type Env = typeof env;
