/**
 * Security audit logger.
 *
 * Buffers structured security events in memory.  In development they
 * are printed to the console; in production the buffer is available
 * for future integration with an external monitoring / SIEM endpoint.
 */

export type SecurityEventType =
  | "AUTH_SUCCESS"
  | "AUTH_FAILURE"
  | "RATE_LIMITED"
  | "DEVICE_ADDED"
  | "DEVICE_REMOVED"
  | "SIGNING_KEY_CLEARED"
  | "ENCRYPTION_ERROR";

interface SecurityEvent {
  type: SecurityEventType;
  timestamp: string;
  details: Record<string, unknown>;
}

const buffer: SecurityEvent[] = [];
const MAX_BUFFER = 200;

export function logSecurityEvent(
  type: SecurityEventType,
  details: Record<string, unknown> = {}
): void {
  const event: SecurityEvent = {
    type,
    timestamp: new Date().toISOString(),
    details,
  };

  buffer.push(event);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info(`[Security] ${type}`, details);
  }
}

/** Return a copy of the current event buffer. */
export function getSecurityEvents(): readonly SecurityEvent[] {
  return [...buffer];
}

/** Count AUTH_FAILURE events in the last `minutes` minutes. */
export function recentAuthFailures(minutes = 5): number {
  const cutoff = Date.now() - minutes * 60_000;
  return buffer.filter(
    (e) =>
      e.type === "AUTH_FAILURE" && new Date(e.timestamp).getTime() > cutoff
  ).length;
}
