import type { ChangeStream } from 'mongodb';
import { events } from './events';
import { logger } from './logger';
import { supportsTransactions } from './db';
import { Job } from '../models';

/**
 * With a replica set, every worker watches the jobs collection so a write handled by ANY worker
 * invalidates ALL workers' public caches immediately (instead of waiting out the 10s TTL).
 * On a standalone server this is a no-op and the TTL is the only bound on staleness.
 */
export function startChangeStreams(): () => Promise<void> {
  if (!supportsTransactions()) return async () => {};

  let stream: ChangeStream | null = null;
  let stopped = false;

  const open = (): void => {
    if (stopped) return;
    stream = Job.watch();
    stream.on('change', () => events.emit('jobs.changed', {}));
    stream.on('error', (err: Error) => {
      logger.warn({ err: err.message }, 'jobs change stream error; reopening');
      void stream?.close().catch(() => undefined);
      setTimeout(open, 1000).unref();
    });
  };
  open();

  return async () => {
    stopped = true;
    await stream?.close().catch(() => undefined);
  };
}
