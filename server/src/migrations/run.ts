// npm run db:migrate: applies pending migrations (tracked in `_migrations`), then syncs indexes.
import mongoose from 'mongoose';
import { connectDB, disconnectDB, ensureIndexes } from '../infra/db';
import { logger } from '../infra/logger';
import { jobSnapshots } from './001-job-snapshots';
import { applicationSnapshots } from './002-application-snapshots';
import { resumeDocuments } from './003-resume-documents';

interface Migration {
  name: string;
  up(): Promise<void>;
}

const migrations: Migration[] = [jobSnapshots, applicationSnapshots, resumeDocuments];

async function main(): Promise<void> {
  await connectDB();
  const applied = mongoose.connection.db!.collection<{ _id: string; appliedAt: Date }>('_migrations');
  for (const migration of migrations) {
    if (await applied.findOne({ _id: migration.name })) continue;
    logger.info(`applying ${migration.name}`);
    await migration.up();
    await applied.insertOne({ _id: migration.name, appliedAt: new Date() });
  }
  await ensureIndexes();
  logger.info('migrations and indexes are up to date');
  await disconnectDB();
}

main().catch((err) => {
  logger.fatal({ err }, 'migration failed');
  process.exit(1);
});
