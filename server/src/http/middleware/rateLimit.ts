import type { Request } from 'express';
import rateLimit, { type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from '../../config/env';
import { RateLimitError } from '../errors';

/**
 * Fixed-window counter shared by every worker through MongoDB (one atomic upsert per hit; a TTL index cleans up).
 * Used where per-worker counters would multiply the effective limit: authentication and the paid AI endpoint.
 */
class MongoRateLimitStore implements Store {
  private windowMs = 60_000;
  private indexReady: Promise<unknown> | null = null;
  readonly localKeys = false;

  constructor(readonly prefix: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private collection() {
    const col = mongoose.connection.collection<{ _id: string; hits: number; expiresAt: Date }>('rate_limits');
    this.indexReady ??= col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return col;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const col = this.collection();
    await this.indexReady;
    const now = new Date();
    const live = { $gt: ['$expiresAt', now] };
    const doc = await col.findOneAndUpdate(
      { _id: `${this.prefix}${key}` },
      [
        {
          $set: {
            hits: { $cond: [live, { $add: ['$hits', 1] }, 1] },
            expiresAt: { $cond: [live, '$expiresAt', new Date(now.getTime() + this.windowMs)] }
          }
        }
      ],
      { upsert: true, returnDocument: 'after' }
    );
    return { totalHits: doc?.hits ?? 1, resetTime: doc?.expiresAt };
  }

  async decrement(key: string): Promise<void> {
    await this.collection().updateOne({ _id: `${this.prefix}${key}` }, { $inc: { hits: -1 } });
  }

  async resetKey(key: string): Promise<void> {
    await this.collection().deleteOne({ _id: `${this.prefix}${key}` });
  }
}

const skip = () => !env.rateLimitEnabled;

/** Over the limit: the same error envelope as every other failure, with Retry-After. */
const handler: Options['handler'] = (req, _res, next, options) => {
  const reset = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  const retryAfter = reset ? (reset.getTime() - Date.now()) / 1000 : options.windowMs / 1000;
  next(new RateLimitError(retryAfter));
};

const common = { standardHeaders: 'draft-7', legacyHeaders: false, skip, handler } as const;

/** Coarse abuse guard for the whole API, per worker process and client IP. */
export const globalLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: env.rateLimitPerMin });

/** Credential stuffing guard: login/register/refresh attempts per IP, shared by all workers. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: env.authRateLimit,
  passOnStoreError: true,
  store: new MongoRateLimitStore('rl:auth:')
});

/** Cost guard for AI analysis: per authenticated user, shared by all workers. */
export const aiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: env.aiRateLimitPerHour,
  passOnStoreError: true,
  store: new MongoRateLimitStore('rl:ai:'),
  keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`
});
