import mongoose, { type ClientSession } from 'mongoose';
import { env } from '../config/env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

let replicaSet = false;

export async function connectDB(uri: string | undefined = env.mongoUri): Promise<void> {
  if (!uri) throw new Error('MongoDB connection string is not set (MONGO_URI / MONGO_URI_TEST)');
  await mongoose.connect(uri, { maxPoolSize: 20, serverSelectionTimeoutMS: 10_000 });

  const hello = (await mongoose.connection.db!.admin().command({ hello: 1 })) as { setName?: string };
  replicaSet = Boolean(hello.setName);
  logger.info(
    { replicaSet },
    replicaSet ? 'MongoDB connected (transactions and change streams enabled)' : 'MongoDB connected (standalone: transactions disabled)'
  );
}

export const supportsTransactions = (): boolean => replicaSet;

/**
 * autoIndex is off; index sync runs once (cluster primary / migrations) so workers never race.
 * It also drops indexes that were removed from a schema.
 */
export async function ensureIndexes(): Promise<void> {
  await import('../models');
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

/**
 * Runs `fn` atomically when the server is a replica set; on a standalone server it just runs `fn`
 * without a session (same code path, weaker guarantees). Pass `session` to every query inside.
 */
export async function withTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if (!replicaSet) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
