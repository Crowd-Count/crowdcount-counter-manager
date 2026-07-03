import tzlookup from "@photostructure/tz-lookup";

// tz-lookup embeds its geo database (~35 KB gzip); keep the import contained
// to this module so only client routes that resolve location timezones pay for it.

const memo = new Map<string, string | undefined>();

/**
 * IANA timezone deduced from a location's stored coordinates.
 * Returns undefined when coordinates are missing or invalid — callers fall
 * back to the browser timezone (pre-existing behavior).
 */
export function resolveLocationTimezone(
  loc: { latitude: number | null; longitude: number | null } | null | undefined
): string | undefined {
  if (!loc || loc.latitude == null || loc.longitude == null) return undefined;
  if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return undefined;

  const key = `${loc.latitude},${loc.longitude}`;
  if (memo.has(key)) return memo.get(key);

  let tz: string | undefined;
  try {
    tz = tzlookup(loc.latitude, loc.longitude);
  } catch {
    tz = undefined; // out-of-range coordinates
  }
  memo.set(key, tz);
  return tz;
}
