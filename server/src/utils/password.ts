import bcrypt from 'bcrypt';

const ROUNDS = 10;

// Native bcrypt hashes on the libuv thread pool, so logins never block the event loop.
export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, ROUNDS);
export const comparePassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);
