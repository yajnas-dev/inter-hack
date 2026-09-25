import type { UserDTO } from '@jobportal/shared';

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly data: unknown,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
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

const XHR_HEADER = { 'X-Requested-With': 'fetch' };

let refreshing: Promise<AuthResponse | null> | null = null;

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', headers: XHR_HEADER })
    .then(async (res) => {
      if (!res.ok) throw new Error('no session');
      const data = (await res.json()) as AuthResponse;
      accessToken = data.token;
      return data;
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

async function request<T>(method: string, url: string, opts: Options = {}): Promise<{ data: T; status: number }> {
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
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : '';

  let res: Response;
  try {
    res = await fetch(`/api${url}${query ? `?${query}` : ''}`, { method, headers, body });
  } catch {
    throw new HttpError(0, undefined, 'Cannot reach the server. Check your connection and try again.');
  }

  // One silent refresh + retry on 401; if the session is really gone, tell the app to sign the user out.
  if (res.status === 401 && !opts.retried && !url.startsWith('/auth/')) {
    if (await refreshSession()) return request<T>(method, url, { ...opts, retried: true });
    onAuthLost?.();
  }

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => undefined);
    throw new HttpError(res.status, data, (data as { message?: string } | undefined)?.message ?? res.statusText);
  }
  const data = opts.responseType === 'blob' ? await res.blob() : res.status === 204 ? undefined : await res.json();
  return { data: data as T, status: res.status };
}

export const http = {
  get: <T>(url: string, opts?: Options) => request<T>('GET', url, opts),
  post: <T>(url: string, body?: unknown, opts?: Options) => request<T>('POST', url, { ...opts, body }),
  put: <T>(url: string, body?: unknown, opts?: Options) => request<T>('PUT', url, { ...opts, body }),
  patch: <T>(url: string, body?: unknown, opts?: Options) => request<T>('PATCH', url, { ...opts, body }),
  delete: <T>(url: string, opts?: Options) => request<T>('DELETE', url, opts)
};

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  return err instanceof HttpError && err.message ? err.message : fallback;
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
