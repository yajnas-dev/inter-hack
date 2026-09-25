import mongoose from 'mongoose';
import { connectDB, disconnectDB, ensureIndexes } from '../src/infra/db';
import '../src/app'; // registers every model before indexes are built

export async function connect(): Promise<void> {
  await connectDB();
  await ensureIndexes();
}

export async function clearDatabase(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function closeDatabase(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
}
