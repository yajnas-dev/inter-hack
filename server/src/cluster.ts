// Production entry: one worker per CPU core (override with WEB_CONCURRENCY). The primary syncs indexes
// once, then forks; crashed workers are respawned; SIGTERM drains every worker.
import cluster from 'node:cluster';
import os from 'node:os';
import { env } from './config/env';
import { connectDB, disconnectDB, ensureIndexes } from './infra/db';
import { logger } from './infra/logger';
import { start } from './server';

// Production: one worker per core. Development/test: a single process unless WEB_CONCURRENCY says otherwise.
const workerCount = env.webConcurrency ?? (env.isProd ? os.availableParallelism() : 1);

async function runPrimary(): Promise<void> {
  await connectDB();
  await ensureIndexes();
  await disconnectDB();

  let shuttingDown = false;
  for (let i = 0; i < workerCount; i += 1) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;
    logger.error({ pid: worker.process.pid, code, signal }, 'worker exited; respawning');
    setTimeout(() => cluster.fork(), 500);
  });

  const stop = (signal: string) => {
    shuttingDown = true;
    logger.info({ signal, workers: Object.keys(cluster.workers ?? {}).length }, 'primary stopping workers');
    for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill('SIGTERM');
    const wait = setInterval(() => {
      if (Object.keys(cluster.workers ?? {}).length === 0) process.exit(0);
    }, 100);
    wait.unref();
    setTimeout(() => process.exit(1), 12_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  logger.info({ pid: process.pid, workers: workerCount }, 'primary started');
}

const fatal = (err: unknown) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
};

if (workerCount <= 1) {
  start().catch(fatal);
} else if (cluster.isPrimary) {
  runPrimary().catch(fatal);
} else {
  start({ syncIndexes: false }).catch(fatal);
}
