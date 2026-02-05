// API-level cache with request deduplication.
// Caches raw API responses per device+function+params.
// Deduplicates in-flight requests so the same call isn't made twice concurrently.

const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

/** Return cached value or execute fetcher. Deduplicates concurrent requests for the same key. */
export async function getOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher().then((result) => {
    cache.set(key, result);
    inflight.delete(key);
    return result;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}

/** Bypass cache, fetch fresh data, update cache entry. For background refresh. */
export async function forceRefresh<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const result = await fetcher();
  cache.set(key, result);
  return result;
}

/** Synchronous cache read. Returns undefined if not cached. */
export function getCached<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}
