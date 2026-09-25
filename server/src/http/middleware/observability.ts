import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import client from 'prom-client';
import { env } from '../../config/env';
import { logger } from '../../infra/logger';

const SLOW_MS = 500;

/**
 * Correlation id on every request (honours an incoming X-Request-Id) and a log line only when it is
 * worth reading: server errors, client errors, slow requests, or everything in development.
 * (A per-request child logger costs ~40µs, which is measurable at 10k req/s.)
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const status = res.statusCode;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (status < 400 && ms < SLOW_MS && !env.logAccess) return;
    const level = status >= 500 ? 'error' : status >= 400 || ms >= SLOW_MS ? 'warn' : 'info';
    logger[level]({ reqId: id, method: req.method, url: req.originalUrl.split('?')[0], status, ms: Math.round(ms) }, 'request');
  });
  next();
};

// Per-process Prometheus metrics (in a cluster, scrape each worker or aggregate downstream).
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency by route',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry]
});

export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched', status: res.statusCode });
  });
  next();
};
