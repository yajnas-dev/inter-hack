import rateLimit, { type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from '../../config/env';

/**
 * Fixed-window counter shared by every worker through MongoDB (one atomic upsert per hit; a TTL index
 * cleans up). Used for the auth endpoints where per-worker counters would multiply the limit.
 */
class MongoRateLimitStore implements Store {
  private windowMs = 60_000;
  private indexReady: Promise<unknown> | null = null;
  readonly localKeys = false;
  readonly prefix = 'rl:';

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
    const expiredOrNew = { $gt: ['$expiresAt', now] };
    const doc = await col.findOneAndUpdate(
      { _id: `${this.prefix}${key}` },
      [
        {
          $set: {
            hits: { $cond: [expiredOrNew, { $add: ['$hits', 1] }, 1] },
            expiresAt: { $cond: [expiredOrNew, '$expiresAt', new Date(now.getTime() + this.windowMs)] }
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

const skip = () => env.isTest;

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.rateLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  skip
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.authRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  passOnStoreError: true,
  store: new MongoRateLimitStore(),
  message: { message: 'Too many attempts, please try again later' }
});
