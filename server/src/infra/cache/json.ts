import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { createSwrCache } from './swr';
import { events } from '../events';

interface CachedResponse {
  body: Buffer;
  gzip: Buffer | null;
  etag: string;
}

/**
 * Caches fully serialised (identity + gzip) JSON for anonymous, read-only endpoints.
 * A hit is a buffer write: no query, no JSON.stringify, no per-request compression.
 */
export function createJsonCache(ttlMs: number, opts: { maxAge?: number; maxEntries?: number } = {}) {
  const { maxAge = 10, maxEntries = 500 } = opts;
  const cache = createSwrCache<CachedResponse>(ttlMs, maxEntries);
  const cacheControl = `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 3}`;

  const build = (payload: unknown): CachedResponse => {
    const body = Buffer.from(JSON.stringify(payload));
    return {
      body,
      gzip: body.length > 1024 ? zlib.gzipSync(body) : null,
      etag: `W/"${crypto.createHash('md5').update(body).digest('base64url')}"`
    };
  };

  return {
    async respond(req: Request, res: Response, key: string, compute: () => Promise<unknown>): Promise<void> {
      const entry = await cache.get(key, async () => build(await compute()));

      res.set({ ETag: entry.etag, 'Cache-Control': ttlMs > 0 ? cacheControl : 'no-store', Vary: 'Accept-Encoding' });
      if (req.headers['if-none-match'] === entry.etag) {
        res.status(304).end();
        return;
      }

      res.type('application/json');
      if (entry.gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
        res.set('Content-Encoding', 'gzip');
        res.end(entry.gzip);
        return;
      }
      res.end(entry.body);
    },
    clear: () => cache.clear()
  };
}

/** Canonical key: path plus query params sorted, so equivalent URLs share one entry. */
export function cacheKey(req: Request): string {
  const params = Object.entries(req.query)
    .map(([k, v]): [string, string] => [k, String(v)])
    .sort(([a], [b]) => a.localeCompare(b));
  return `${req.path}?${new URLSearchParams(params).toString()}`;
}

/** Public job listings/details: shared across requests, invalidated by the `jobs.changed` event. */
export const publicJobCache = createJsonCache(env.isTest ? 0 : 10 * 1000);
events.on('jobs.changed', () => publicJobCache.clear());
