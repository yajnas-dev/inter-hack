import pino from 'pino';
import { env } from '../config/env';

// Pretty output only in interactive development; everything else is JSON lines (machine friendly).
const pretty = env.nodeEnv === 'development' && process.stdout.isTTY;

export const logger = pino({
  level: env.logLevel,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  ...(pretty && { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } })
});
