import type http from 'node:http';
import { app } from './app';
import { env } from './config/env';
import { connectDB, disconnectDB, ensureIndexes } from './infra/db';
import { startChangeStreams } from './infra/changeStreams';
import { logger } from './infra/logger';

/** One HTTP worker. Index sync is done once by the cluster primary (or here when running a single process). */
export async function start({ syncIndexes = true }: { syncIndexes?: boolean } = {}): Promise<http.Server> {
  await connectDB();
  if (syncIndexes) await ensureIndexes();
  const stopChangeStreams = startChangeStreams();

  const server = app.listen(env.port, () => logger.info({ pid: process.pid, port: env.port }, 'worker listening'));
  // Keep-alive above typical proxy/load-balancer idle timeouts avoids connection churn.
  server.keepAliveTimeout = 65_000;

  const shutdown = (signal: string) => {
    logger.info({ pid: process.pid, signal }, 'draining');
    server.close(async () => {
      await stopChangeStreams();
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}
