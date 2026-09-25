import type { ApiFailure, AuthSessionDTO, ErrorCode, ErrorDetail, PageMeta } from '@jobportal/shared';

/** Every call goes to the versioned API. */
export const API_BASE = '/api/v1';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN',
    message: string,
    readonly details: ErrorDetail[] = []
  ) {
    super(message);
    this.name = 'HttpError';
  }

  /** Field-level messages keyed by field name, for inline form errors. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.filter((d) => d.field).map((d) => [d.field!.split('.')[0]!, d.message]));
  }
}

// The access token lives only in memory (never localStorage), so XSS cannot steal a long-lived credential.
// The httpOnly refresh cookie restores the session after a reload.
let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const setAuthLostHandler = (handler: (() => void) | null): void => {
  onAuthLost = handler;
};

// Cookie-authenticated calls must carry this header (the API's CSRF check).
const XHR_HEADER = { 'X-Requested-With': 'fetch' };

let refreshing: Promise<AuthSessionDTO | null> | null = null;

/** Reads and discards a response body we do not need, so the connection is released (not left half-consumed). */
const drain = (res: Response): Promise<unknown> => res.text().catch(() => undefined);

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<AuthSessionDTO | null> {
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers: XHR_HEADER })
    .then(async (res) => {
      if (!res.ok) {
        await drain(res);
        throw new Error('no session');
      }
      const body = (await res.json()) as { data: AuthSessionDTO };
      accessToken = body.data.accessToken;
      return body.data;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface Options {
  params?: Record<string, unknown>;
  body?: unknown;
  responseType?: 'json' | 'blob';
  retried?: boolean;
}

export interface ApiResult<T> {
  data: T;
  meta?: PageMeta & Record<string, unknown>;
  status: number;
}

async function request<T>(method: string, url: string, opts: Options = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...XHR_HEADER };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const query = opts.params
    ? new URLSearchParams(
        Object.entries(opts.params)
          .filter(([, v]) => v !== undefined && v !== '' && v !== null)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : '';

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${url}${query ? `?${query}` : ''}`, { method, headers, body });
  } catch {
    throw new HttpError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  // One silent refresh + retry on 401; if the session is really gone, tell the app to sign the user out.
  if (res.status === 401 && !opts.retried && !url.startsWith('/auth/')) {
    if (await refreshSession()) {
      await drain(res);
      return request<T>(method, url, { ...opts, retried: true });
    }
    onAuthLost?.();
  }

  if (!res.ok) {
    const failure = (await res.json().catch(() => undefined)) as ApiFailure | undefined;
    const error = failure?.error;
    throw new HttpError(res.status, error?.code ?? 'UNKNOWN', error?.message ?? res.statusText, error?.details);
  }
  if (res.status === 204) return { data: undefined as T, status: 204 };
  if (opts.responseType === 'blob') return { data: (await res.blob()) as T, status: res.status };
  const envelope = (await res.json()) as { data: T; meta?: ApiResult<T>['meta'] };
  return { data: envelope.data, meta: envelope.meta, status: res.status };
}

export const http = {
  get: <T>(url: string, opts?: Options) => request<T>('GET', url, opts),
  post: <T>(url: string, body?: unknown, opts?: Options) => request<T>('POST', url, { ...opts, body }),
  put: <T>(url: string, body?: unknown, opts?: Options) => request<T>('PUT', url, { ...opts, body }),
  patch: <T>(url: string, body?: unknown, opts?: Options) => request<T>('PATCH', url, { ...opts, body }),
  delete: <T>(url: string, opts?: Options) => request<T>('DELETE', url, opts)
};

/** A paged collection as the UI consumes it. */
export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export async function getPage<T>(url: string, params?: Record<string, unknown>): Promise<Page<T>> {
  const res = await http.get<T[]>(url, { params });
  return { items: res.data, meta: res.meta ?? { limit: res.data.length, hasNextPage: false } };
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (!(err instanceof HttpError) || !err.message) return fallback;
  // Validation failures: show the first field message, which is more useful than the generic summary.
  if (err.code === 'VALIDATION_ERROR' && err.details[0]) return err.details[0].message;
  return err.message;
}

/** Saves a blob response (e.g. a resume) through the browser's download flow. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
