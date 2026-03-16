/**
 * Dev-only logging utility.
 * Suppresses console output in production to avoid leaking
 * location IDs, error messages, and stack traces.
 */

export function logError(msg: string, ...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(msg, ...args);
  }
}

export function logWarn(msg: string, ...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(msg, ...args);
  }
}
