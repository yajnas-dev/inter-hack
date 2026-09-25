import bcrypt from 'bcrypt';
import { env } from '../config/env';

// Native bcrypt hashes on the libuv thread pool, so logins never block the event loop.
export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, env.bcryptRounds);
export const comparePassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

// A real hash at the configured cost, computed once. Comparing against it when the email is unknown makes a
// failed login take as long as a wrong password, so response time does not reveal which emails exist.
let dummyHash: Promise<string> | null = null;
export async function timingSafeDummyCompare(password: string): Promise<false> {
  dummyHash ??= bcrypt.hash('timing-equaliser-not-a-real-password', env.bcryptRounds);
  await bcrypt.compare(password, await dummyHash);
  return false;
}
