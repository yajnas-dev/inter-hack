import type { Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import type { ZodError } from 'zod';
import { ApiError, unauthorized } from './errors';

type AuthUser = Express.AuthUser;

interface Spec<B, Q, P> {
  body?: ZodType<B, any, any>;
  query?: ZodType<Q, any, any>;
  params?: ZodType<P, any, any>;
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

/** Validates input with zod; failures become a 400 ApiError. */
export function parseInput<T>(schema: ZodType<T, any, any> | undefined, value: unknown): T {
  if (!schema) return undefined as T;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw zodToApiError(result.error);
}

function zodToApiError(error: ZodError): ApiError {
  const messages = [...new Set(error.issues.map((i) => i.message))];
  return new ApiError(400, messages.join(', '));
}

function build<B, Q, P, C extends Ctx<B, Q, P>>(spec: Spec<B, Q, P>, fn: (ctx: C) => unknown, authed: boolean): RequestHandler {
  return async (req, res, next) => {
    try {
      if (authed && !req.user) throw unauthorized();
      const ctx = {
        body: parseInput(spec.body, req.body),
        query: parseInput(spec.query, req.query),
        params: parseInput(spec.params, req.params),
        req,
        res,
        ...(authed && { user: req.user })
      } as C;
      const result = await fn(ctx);
      if (result !== undefined && !res.headersSent) res.json(result);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Wraps a route handler: validates body/query/params with zod (400 on failure), gives the handler
 * typed input, forwards errors, and JSON-serialises a returned value. Use `ctx.res.status(201)` to
 * change the status code.
 */
export function handle<B = undefined, Q = undefined, P = undefined>(
  spec: Spec<B, Q, P>,
  fn: (ctx: Ctx<B, Q, P>) => unknown
): RequestHandler {
  return build(spec, fn, false);
}

/** Same as `handle`, for routes behind `authenticate`: `ctx.user` is always present. */
export function handleAuthed<B = undefined, Q = undefined, P = undefined>(
  spec: Spec<B, Q, P>,
  fn: (ctx: AuthedCtx<B, Q, P>) => unknown
): RequestHandler {
  return build(spec, fn, true);
}
