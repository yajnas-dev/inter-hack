/** An error that is safe to show the client: it carries the HTTP status and message to send. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string) => new ApiError(400, message);
export const unauthorized = (message = 'Authentication required') => new ApiError(401, message);
export const forbidden = (message = 'You do not have permission to perform this action') => new ApiError(403, message);
export const notFound = (message: string) => new ApiError(404, message);
export const conflict = (message: string) => new ApiError(409, message);
