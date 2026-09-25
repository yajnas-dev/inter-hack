/**
 * Async cache with single-flight (concurrent misses share one computation) and
 * stale-while-revalidate (expired values are served while one refresh runs).
 * ttlMs <= 0 disables caching; maxEntries bounds memory (oldest entry evicted first).
 */
export interface SwrCache<V> {
  get(key: string, compute: () => Promise<V>): Promise<V>;
  clear(): void;
}

interface Entry<V> {
  hasValue: boolean;
  value: V | undefined;
  expires: number;
  promise: Promise<void> | null;
}

export function createSwrCache<V>(ttlMs: number, maxEntries = 500): SwrCache<V> {
  const entries = new Map<string, Entry<V>>();

  function refresh(entry: Entry<V>, compute: () => Promise<V>): Promise<void> {
    const promise = compute()
      .then((value) => {
        entry.value = value;
        entry.hasValue = true;
        entry.expires = Date.now() + ttlMs;
      })
      .finally(() => {
        entry.promise = null;
      });
    entry.promise = promise;
    return promise;
  }

  return {
    async get(key, compute) {
      if (ttlMs <= 0) return compute();

      let entry = entries.get(key);
      if (!entry) {
        entry = { hasValue: false, value: undefined, expires: 0, promise: null };
        if (entries.size >= maxEntries) {
          const oldest = entries.keys().next();
          if (!oldest.done) entries.delete(oldest.value);
        }
        entries.set(key, entry);
      }
      if (entry.hasValue && entry.expires > Date.now()) return entry.value as V;

      if (!entry.promise) refresh(entry, compute).catch(() => entries.delete(key));
      if (entry.hasValue) return entry.value as V;
      await entry.promise;
      return entry.value as V;
    },
    clear: () => entries.clear()
  };
}
