import { Types, isValidObjectId } from 'mongoose';
import { ValidationError } from '../http/errors';

/**
 * Opaque keyset cursors. A cursor records the sort it was produced for plus the last row's sort value and _id,
 * and selects rows strictly after it in (sortField, _id) order. Unlike skip/offset, the cost is the same at any
 * depth and rows inserted meanwhile do not shift the pages.
 */
export interface SortSpec {
  /** The public sort token, e.g. "-createdAt". */
  token: string;
  field: 'createdAt' | 'salaryMax';
  dir: 1 | -1;
}

export function parseSort(token: string): SortSpec {
  const dir = token.startsWith('-') ? -1 : 1;
  const field = token.replace(/^-/, '') as SortSpec['field'];
  return { token, field, dir };
}

export const mongoSort = (s: SortSpec): Record<string, 1 | -1> => ({ [s.field]: s.dir, _id: s.dir });

type Row = { _id: Types.ObjectId } & Partial<Record<SortSpec['field'], Date | number>>;

export function encodeCursor(s: SortSpec, row: Row): string {
  const raw = row[s.field];
  const value = raw instanceof Date ? raw.getTime() : raw;
  return Buffer.from(JSON.stringify({ s: s.token, v: value, i: String(row._id) })).toString('base64url');
}

const invalid = (message: string) => new ValidationError([{ location: 'query', field: 'cursor', message }]);

export function afterCursor(s: SortSpec, cursor: string): Record<string, unknown> {
  let parsed: { s?: unknown; v?: unknown; i?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid('Invalid cursor');
  }
  if (typeof parsed.v !== 'number' || !Number.isFinite(parsed.v) || typeof parsed.i !== 'string' || !isValidObjectId(parsed.i)) {
    throw invalid('Invalid cursor');
  }
  if (parsed.s !== s.token) throw invalid('Cursor was produced for a different sort order');

  const value = s.field === 'createdAt' ? new Date(parsed.v) : parsed.v;
  const id = new Types.ObjectId(parsed.i);
  const beyond = s.dir === -1 ? '$lt' : '$gt';
  return { $or: [{ [s.field]: { [beyond]: value } }, { [s.field]: value, _id: { [beyond]: id } }] };
}
