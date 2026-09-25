import { pipeline } from 'node:stream/promises';
import type { Request, RequestHandler, Response } from 'express';
import type { ErrorDetail } from '@jobportal/shared';
import type { ZodType } from 'zod';
import { AuthenticationError, ValidationError } from './errors';
import { envelope, type Reply } from './respond';

type AuthUser = Express.AuthUser;
type Location = 'body' | 'query' | 'params';

type Schema<T> = ZodType<T, any, any>;

export interface InputSpec<B, Q, P> {
  body?: Schema<B>;
  query?: Schema<Q>;
  params?: Schema<P>;
}

export interface Ctx<B, Q, P> {
  body: B;
  query: Q;
  params: P;
  req: Request;
  res: Response;
}
export interface AuthedCtx<B, Q, P> extends Ctx<B, Q, P> {
  user: AuthUser;
}

/**
 * Validates every declared input location and reports ALL problems at once (422 with one detail per field),
 * so a client can fix a form in a single round trip.
 */
export function validateInput<B, Q, P>(spec: InputSpec<B, Q, P>, req: Request): { body: B; query: Q; params: P } {
  const details: ErrorDetail[] = [];
  const out: Record<Location, unknown> = { body: undefined, query: undefined, params: undefined };

  for (const location of ['params', 'query', 'body'] as const) {
    const schema = spec[location];
    if (!schema) continue;
    // A missing JSON body is validated as {} so the client gets field errors ("name is required"), not a type error.
    const input = location === 'body' ? (req.body ?? {}) : req[location];
    const result = schema.safeParse(input);
    if (result.success) out[location] = result.data;
    else
      for (const issue of result.error.issues) {
        details.push({ location, ...(issue.path.length > 0 && { field: issue.path.join('.') }), message: issue.message });
      }
  }

  if (details.length) throw new ValidationError(details);
  return out as { body: B; query: Q; params: P };
}

async function send(reply: Reply | undefined, res: Response): Promise<void> {
  if (!reply || reply.kind === 'sent' || res.headersSent) return;
  switch (reply.kind) {
    case 'json':
      if (reply.headers) res.set(reply.headers);
      res.status(reply.status).json(envelope(reply.data, reply.meta, reply.message));
      return;
    case 'empty':
      res.status(204).end();
      return;
    case 'stream':
      res.status(200).set(reply.headers);
      // pipeline destroys both sides on failure; a mid-stream error just aborts the connection.
      await pipeline(reply.stream, res).catch(() => res.destroy());
      return;
  }
}

function build<B, Q, P, C>(spec: InputSpec<B, Q, P>, fn: (ctx: C) => Promise<Reply | undefined> | Reply, authed: boolean): RequestHandler {
  return async (req, res, next) => {
    try {
      if (authed && !req.user) throw new AuthenticationError();
      const input = validateInput(spec, req);
      const ctx = { ...input, req, res, ...(authed && { user: req.user }) } as C;
      await send(await fn(ctx), res);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * A controller: declares the inputs it accepts, receives them validated and typed, calls a service and returns
 * a Reply. It never touches the database and never formats errors (the central error handler does).
 */
export function controller<B = undefined, Q = undefined, P = undefined>(
  spec: InputSpec<B, Q, P>,
  fn: (ctx: Ctx<B, Q, P>) => Promise<Reply | undefined> | Reply
): RequestHandler {
  return build(spec, fn, false);
}

/** Same as `controller`, for routes behind `authenticate`: `ctx.user` is always present. */
export function authedController<B = undefined, Q = undefined, P = undefined>(
  spec: InputSpec<B, Q, P>,
  fn: (ctx: AuthedCtx<B, Q, P>) => Promise<Reply | undefined> | Reply
): RequestHandler {
  return build(spec, fn, true);
}
