import bcrypt from 'bcrypt';
import { MongoClient } from 'mongodb';

export const ADMIN = { email: 'admin@e2e.test', password: 'Admin@12345' };

// Empties the e2e database (keeping indexes) and seeds the one account that cannot self-register.
export default async function globalSetup(): Promise<void> {
  const client = new MongoClient('mongodb://127.0.0.1:27017/job_portal_e2e?replicaSet=rs0');
  await client.connect();
  const db = client.db();
  for (const { name } of await db.listCollections().toArray()) await db.collection(name).deleteMany({});
  const now = new Date();
  await db.collection('users').insertOne({
    name: 'E2E Admin',
    email: ADMIN.email,
    password: await bcrypt.hash(ADMIN.password, 10),
    role: 'ADMIN',
    isActive: true,
    createdAt: now,
    updatedAt: now
  });
  await client.close();
}
