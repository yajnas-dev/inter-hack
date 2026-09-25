import type { Readable } from 'node:stream';

/**
 * What a controller returns. The controller wrapper turns it into the response, so every endpoint emits the
 * same envelope: `{ success: true, data, meta?, message? }`, or no body at all for 204.
 */
export type Reply =
  | { kind: 'json'; status: number; data: unknown; meta?: unknown; message?: string; headers?: Record<string, string> }
  | { kind: 'empty'; status: 204 }
  | { kind: 'stream'; status: 200; stream: Readable; headers: Record<string, string> }
  /** The controller already wrote the response (e.g. the pre-serialised public cache). */
  | { kind: 'sent' };

export const envelope = (data: unknown, meta?: unknown, message?: string) => ({
  success: true as const,
  data,
  ...(meta !== undefined && { meta }),
  ...(message && { message })
});

export const ok = (data: unknown, extra: { meta?: unknown; message?: string } = {}): Reply => ({
  kind: 'json',
  status: 200,
  data,
  ...extra
});

/** 201 with a Location header pointing at the new resource. */
export const created = (data: unknown, location: string, message?: string): Reply => ({
  kind: 'json',
  status: 201,
  data,
  message,
  headers: { Location: location }
});

export const noContent = (): Reply => ({ kind: 'empty', status: 204 });

export const stream = (body: Readable, headers: Record<string, string>): Reply => ({ kind: 'stream', status: 200, stream: body, headers });

export const alreadySent = (): Reply => ({ kind: 'sent' });

/** RFC 6266 Content-Disposition with an ASCII fallback and the exact UTF-8 name. */
export function attachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
