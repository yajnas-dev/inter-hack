/** Tiny in-process TTL cache with a size cap (oldest entry evicted first). ttlMs <= 0 disables it. */
export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
  clear(): void;
}

export function createTtlCache<V>(ttlMs: number, maxSize = 1000): TtlCache<V> {
  const store = new Map<string, { value: V; expires: number }>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expires <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (ttlMs <= 0) return;
      if (store.size >= maxSize) {
        const oldest = store.keys().next();
        if (!oldest.done) store.delete(oldest.value);
      }
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    delete: (key) => void store.delete(key),
    clear: () => store.clear()
  };
}
