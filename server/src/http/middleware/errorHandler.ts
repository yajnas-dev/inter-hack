import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import type { ApiFailure } from '@jobportal/shared';
import { RESUME_MAX_BYTES } from '@jobportal/shared';
import { logger } from '../../infra/logger';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError
} from '../errors';

export const routeNotFound: RequestHandler = (req, _res, next) => {
  const path = req.originalUrl.split('?')[0] ?? '';
  const hint = path.startsWith('/api/') && !path.startsWith('/api/v1/') ? ' (the API is versioned: use /api/v1/...)' : '';
  next(new NotFoundError(`Route not found: ${req.method} ${path}${hint}`, 'ROUTE_NOT_FOUND'));
};

interface MongoishError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
  path?: string;
  errors?: Record<string, { message: string; path?: string }>;
  type?: string;
}

/** Maps library errors (body parser, multer, Mongoose, MongoDB) onto the API's error vocabulary. */
function normalise(thrown: unknown): AppError | null {
  if (thrown instanceof AppError) return thrown;
  const err = thrown as MongoishError;

  if (thrown instanceof multer.MulterError) {
    if (thrown.code === 'LIMIT_FILE_SIZE') return new PayloadTooLargeError(`File is too large (max ${RESUME_MAX_BYTES / 1024 / 1024} MB)`);
    if (thrown.code === 'LIMIT_UNEXPECTED_FILE') {
      return new BadRequestError('Unexpected file field; send exactly one file in the multipart field "file"', [
        { location: 'file', field: thrown.field, message: 'Unexpected field' }
      ]);
    }
    return new BadRequestError(`Invalid multipart upload: ${thrown.message}`);
  }
  // body-parser
  if (err.type === 'entity.too.large') return new PayloadTooLargeError();
  if (err.type === 'entity.parse.failed') return new BadRequestError('Malformed JSON body');
  if (err.type === 'encoding.unsupported' || err.type === 'charset.unsupported') return new UnsupportedMediaTypeError(err.message);

  // Mongoose schema validation is a second line of defence behind the zod contracts.
  if (err.name === 'ValidationError' && err.errors) {
    return new ValidationError(Object.entries(err.errors).map(([field, e]) => ({ location: 'body', field, message: e.message })));
  }
  if (err.name === 'CastError') return new ValidationError([{ field: err.path, message: `Invalid value for ${err.path}` }]);

  // Unique indexes are the source of truth under concurrency; map each to a meaningful conflict.
  if (err.code === 11000) {
    const keys = Object.keys(err.keyPattern ?? {});
    if (keys.includes('applicant')) return new ConflictError('You have already applied to this job', 'DUPLICATE_APPLICATION');
    if (keys.includes('email')) return new ConflictError('An account with this email already exists', 'EMAIL_TAKEN');
    if (keys.includes('createdBy')) return new ConflictError('You already have a company profile', 'COMPANY_EXISTS');
    return new ConflictError('A record with the same unique value already exists');
  }
  return null;
}

/**
 * The only place errors become responses. Known errors keep their status/code/message; everything else is a
 * bug: logged with the request id and stack, answered with a generic 500 that exposes no internals.
 */
export const errorHandler: ErrorRequestHandler = (thrown: unknown, req, res, _next) => {
  const known = normalise(thrown);
  const status = known?.status ?? 500;

  if (!known) logger.error({ err: thrown, reqId: req.id, method: req.method, url: req.originalUrl.split('?')[0] }, 'unhandled error');

  if (res.headersSent) {
    res.destroy();
    return;
  }

  const body: ApiFailure = {
    success: false,
    error: {
      code: known?.code ?? 'INTERNAL_ERROR',
      message: known?.message ?? 'An unexpected error occurred',
      ...(known?.details?.length && { details: known.details }),
      ...(req.id && { requestId: req.id })
    }
  };
  if (known?.headers) res.set(known.headers);
  res.status(status).json(body);
};
