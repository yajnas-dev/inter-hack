/**
 * Maps Mongo's `_id` to `id`, drops `__v` and stringifies ObjectIds. Works on lean results, documents
 * and arrays. Hot path for every response: plain objects take a tight loop with no prototype lookups.
 * The return type is intentionally loose: callers cast to the DTO they produce.
 */
export function withId(value: unknown): any {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i += 1) out[i] = withId(value[i]);
    return out;
  }
  // _bsontype is cheaper than instanceof and survives duplicate copies of the bson package.
  if ((value as { _bsontype?: string })._bsontype === 'ObjectId') return String(value);
  if (value instanceof Date) return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    const maybeDoc = value as { toObject?: () => unknown };
    return typeof maybeDoc.toObject === 'function' ? withId(maybeDoc.toObject()) : value;
  }

  const out: Record<string, unknown> = {};
  for (const key in value as Record<string, unknown>) {
    if (key === '__v') continue;
    out[key === '_id' ? 'id' : key] = withId((value as Record<string, unknown>)[key]);
  }
  return out;
}
