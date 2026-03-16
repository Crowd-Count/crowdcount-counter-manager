/**
 * Client-side rate limiter with exponential backoff.
 *
 * Tracks consecutive failures per endpoint category and enforces
 * increasing delays before allowing retries. Prevents brute-force
 * attempts and protects the server from being hammered on errors.
 */

interface FailureRecord {
  count: number;
  lastFailure: number;
  backoffUntil: number;
}

const failures = new Map<string, FailureRecord>();

const BASE_DELAY_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const RESET_WINDOW_MS = 60_000;

/** Group endpoints into rate-limit buckets. */
function getBucket(endpoint: string): string {
  if (endpoint === "/check_password") return "auth";
  if (endpoint.startsWith("/set_password")) return "auth";
  return "api";
}

/**
 * Check whether a request to `endpoint` is currently allowed.
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
 */
export function checkRateLimit(endpoint: string): {
  allowed: boolean;
  retryAfterMs: number;
} {
  const record = failures.get(getBucket(endpoint));
  if (!record) return { allowed: true, retryAfterMs: 0 };

  const now = Date.now();
  if (now >= record.backoffUntil) return { allowed: true, retryAfterMs: 0 };

  return { allowed: false, retryAfterMs: record.backoffUntil - now };
}

/** Record a failed request — increases backoff exponentially. */
export function recordFailure(endpoint: string): void {
  const key = getBucket(endpoint);
  const now = Date.now();
  const record = failures.get(key) ?? {
    count: 0,
    lastFailure: 0,
    backoffUntil: 0,
  };

  // Reset counter if the last failure was long enough ago
  if (now - record.lastFailure > RESET_WINDOW_MS) {
    record.count = 0;
  }

  record.count++;
  record.lastFailure = now;
  record.backoffUntil =
    now + Math.min(BASE_DELAY_MS * 2 ** (record.count - 1), MAX_BACKOFF_MS);

  failures.set(key, record);
}

/** Record a successful request — clears the failure record. */
export function recordSuccess(endpoint: string): void {
  failures.delete(getBucket(endpoint));
}
