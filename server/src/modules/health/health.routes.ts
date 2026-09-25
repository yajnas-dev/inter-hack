import { Router } from 'express';
import mongoose from 'mongoose';
import { envelope } from '../../http/respond';

/** /api/v1/health: liveness (the process answers) and readiness (it can reach the database). */
export const healthRouter = Router();

healthRouter.get('/', (_req, res) => void res.json(envelope({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) })));

healthRouter.get('/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res
    .status(ready ? 200 : 503)
    .json(
      ready
        ? envelope({ status: 'ready', database: 'connected' })
        : { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is not connected' } }
    );
});
