import type { Role } from '@jobportal/shared';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      role: Role;
    }
    interface Request {
      user?: AuthUser;
      /** Correlation id set by the request logger. */
      id?: string;
    }
  }
}
