import readline from 'node:readline';
import { connectDB, disconnectDB, ensureIndexes } from '../infra/db';
import { User } from '../models';
import { hashPassword } from './password';

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  await connectDB();
  await ensureIndexes();

  const name = process.env.ADMIN_NAME || (await prompt('Admin name: '));
  const email = (process.env.ADMIN_EMAIL || (await prompt('Admin email: '))).toLowerCase();
  const password = process.env.ADMIN_PASSWORD || (await prompt('Admin password (min 8 chars): '));
  if (password.length < 8) throw new Error('Password must be at least 8 characters');

  const existing = await User.findOne({ email }).select('role').lean();
  if (existing) {
    console.log(`A user with email ${email} already exists (role: ${existing.role}).`);
    await disconnectDB();
    process.exit(existing.role === 'ADMIN' ? 0 : 1);
  }

  await User.create({ name, email, password: await hashPassword(password), role: 'ADMIN' });
  console.log(`Admin user created: ${email}`);
  await disconnectDB();
}

main().catch((err: Error) => {
  console.error('Failed to seed admin:', err.message);
  process.exit(1);
});
