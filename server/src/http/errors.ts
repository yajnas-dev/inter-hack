import type { ErrorCode, ErrorDetail } from '@jobportal/shared';

/**
 * An error that is safe to show the client. It carries the HTTP status, a stable machine-readable code,
 * a human message and optional field-level details. Anything that is NOT an AppError is treated as a bug:
 * logged in full, answered with a generic 500.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
    readonly headers?: Record<string, string>
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400: the request itself is malformed (bad JSON, bad multipart framing). */
export class BadRequestError extends AppError {
  constructor(message = 'Malformed request', details?: ErrorDetail[]) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

/** 422: well-formed request whose values fail validation. */
export class ValidationError extends AppError {
  constructor(details: ErrorDetail[], message = 'Request validation failed') {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

/** 422: valid input that the current state cannot process (e.g. applying without a resume). */
export class UnprocessableError extends AppError {
  constructor(
    code: 'COMPANY_REQUIRED' | 'RESUME_REQUIRED' | 'PROFILE_INCOMPLETE' | 'VALIDATION_ERROR',
    message: string,
    details?: ErrorDetail[]
  ) {
    super(422, code, message, details);
  }
}

type AuthCode = 'UNAUTHENTICATED' | 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'INVALID_CREDENTIALS' | 'SESSION_EXPIRED' | 'ACCOUNT_DISABLED';

/**
 * 401: no valid credentials. Failures of the bearer-token check carry the RFC 6750 WWW-Authenticate challenge;
 * login and refresh failures do not (those endpoints authenticate with a password or refresh token, not a bearer).
 */
export class AuthenticationError extends AppError {
  constructor(
    message = 'Authentication required',
    code: AuthCode = 'UNAUTHENTICATED',
    bearerChallenge = code !== 'INVALID_CREDENTIALS' && code !== 'SESSION_EXPIRED'
  ) {
    const challenge = code === 'UNAUTHENTICATED' ? 'Bearer' : `Bearer error="invalid_token", error_description="${message}"`;
    super(401, code, message, undefined, bearerChallenge ? { 'WWW-Authenticate': challenge } : undefined);
  }
}

/** 403: authenticated, but not allowed. */
export class AuthorizationError extends AppError {
  constructor(
    message = 'You do not have permission to perform this action',
    code: 'FORBIDDEN' | 'CSRF_CHECK_FAILED' | 'ACCOUNT_DISABLED' = 'FORBIDDEN'
  ) {
    super(403, code, message);
  }
}

/** 404. Also used for private resources the caller may not see, so their existence is not revealed. */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource', code: 'NOT_FOUND' | 'ROUTE_NOT_FOUND' = 'NOT_FOUND') {
    super(404, code, code === 'NOT_FOUND' ? `${resource} not found` : resource);
  }
}

type ConflictCode =
  | 'CONFLICT'
  | 'EMAIL_TAKEN'
  | 'DUPLICATE_APPLICATION'
  | 'INVALID_STATUS_TRANSITION'
  | 'JOB_CLOSED'
  | 'JOB_HAS_APPLICATIONS'
  | 'COMPANY_EXISTS'
  | 'CONCURRENT_UPDATE';

/** 409: the request conflicts with the current state of the resource. */
export class ConflictError extends AppError {
  constructor(message: string, code: ConflictCode = 'CONFLICT') {
    super(409, code, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Request body is too large') {
    super(413, 'PAYLOAD_TOO_LARGE', message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super(415, 'UNSUPPORTED_MEDIA_TYPE', message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number, message = 'Too many requests, please try again later') {
    super(429, 'RATE_LIMITED', message, undefined, { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(503, 'SERVICE_UNAVAILABLE', message);
  }
}
