type CacheEntry<T> = {
  value: T;
  storedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function getCache<T>(key: string, maxAgeMs = 60_000): T | null {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.storedAt > maxAgeMs) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCache<T>(key: string, value: T): void {
  memoryCache.set(key, { value, storedAt: Date.now() });
}

export function clearCache(key: string): void {
  memoryCache.delete(key);
}
