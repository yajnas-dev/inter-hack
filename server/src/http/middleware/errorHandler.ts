import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ApiError, notFound } from '../errors';
import { logger } from '../../infra/logger';

export const routeNotFound: RequestHandler = (req, _res, next) => {
  next(notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

interface MongoishError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
  path?: string;
  errors?: Record<string, { message: string }>;
  type?: string;
}

export const errorHandler: ErrorRequestHandler = (thrown: unknown, req, res, _next) => {
  const err = thrown as MongoishError;
  let status = thrown instanceof ApiError ? thrown.statusCode : 500;
  let message = err.message || 'Internal server error';

  if (thrown instanceof multer.MulterError) {
    status = thrown.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = thrown.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5MB)' : thrown.message;
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    const keys = Object.keys(err.keyPattern ?? {});
    if (keys.includes('applicant')) message = 'You have already applied to this job';
    else if (keys.includes('email')) message = 'An account with this email already exists';
    else message = `Duplicate value for ${keys.join(', ') || 'a unique field'}`;
  }

  if (status >= 500) {
    logger.error({ err, reqId: req.id }, 'unhandled error');
    message = 'Internal server error';
  }
  res.status(status).json({ message });
};
