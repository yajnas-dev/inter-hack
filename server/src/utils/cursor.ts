import { Types, isValidObjectId } from 'mongoose';
import { badRequest } from '../http/errors';

/** Opaque keyset cursor over (createdAt desc, _id desc). */
export function encodeCursor(doc: { createdAt: Date; _id: Types.ObjectId }): string {
  const payload = { t: new Date(doc.createdAt).getTime(), i: String(doc._id) };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Filter fragment selecting rows strictly after the cursor in (createdAt desc, _id desc) order. */
export function afterCursor(cursor: string) {
  let parsed: { t?: unknown; i?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
  } catch {
    throw badRequest('Invalid cursor');
  }
  if (typeof parsed.t !== 'number' || !Number.isFinite(parsed.t) || typeof parsed.i !== 'string' || !isValidObjectId(parsed.i)) {
    throw badRequest('Invalid cursor');
  }
  const createdAt = new Date(parsed.t);
  const id = new Types.ObjectId(parsed.i);
  return { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }] };
}
