// Timezone utilities for converting UTC server data to the user's local timezone.
// The server stores all data in UTC — hour keys "0"-"23" are UTC hours,
// day-of-week and month buckets are based on UTC boundaries.

/** Format a Date's UTC components as YYYY-MM-DD */
export function formatUTCDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface LocalDayUTCBounds {
  /** First UTC date that overlaps with the local day */
  utcDate1: string;
  /** Second UTC date that overlaps with the local day (may equal utcDate1 for UTC+0) */
  utcDate2: string;
  /** UTC minutes elapsed within utcDate1's day when local midnight occurs.
   *  e.g. EST (UTC-5): 300 (5:00 UTC), IST (UTC+5:30): 1110 (18:30 UTC of previous day) */
  utcMinutesAtMidnight: number;
}

/**
 * Compute which two UTC dates span a given local day and the UTC minute offset at local midnight.
 *
 * @param dateStr Optional YYYY-MM-DD string treated as a local date. If omitted, uses today.
 */
export function getLocalDayUTCBounds(dateStr?: string): LocalDayUTCBounds {
  let localMidnight: Date;
  let localNextMidnight: Date;

  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    localMidnight = new Date(y, m - 1, d, 0, 0, 0);
    localNextMidnight = new Date(y, m - 1, d + 1, 0, 0, 0);
  } else {
    const now = new Date();
    localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    localNextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  }

  const utcDate1 = formatUTCDate(localMidnight);
  const utcDate2 = formatUTCDate(localNextMidnight);
  const utcMinutesAtMidnight = localMidnight.getUTCHours() * 60 + localMidnight.getUTCMinutes();

  return { utcDate1, utcDate2, utcMinutesAtMidnight };
}

/**
 * Shift hourly data from two UTC dates into a single local-day record keyed by local hours "0"-"23".
 *
 * @param date1Data Hourly data for utcDate1 (keys "0"-"23")
 * @param date2Data Hourly data for utcDate2 (keys "0"-"23")
 * @param utcMinutesAtMidnight UTC minutes into date1's day when local midnight occurs
 */
/** Format a Date's LOCAL components as YYYY-MM-DD */
export function formatDateAsLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format today's local date as YYYY-MM-DD */
export function formatLocalDate(): string {
  return formatDateAsLocal(new Date());
}

/**
 * Convert an array of UTC date strings to local date strings.
 * For each UTC date, checks both day boundaries (00:00 and 23:59 UTC)
 * to find which local dates they map to, ensuring correct coverage
 * across timezone offsets.
 */
export function utcDatesToLocalDates(utcDates: string[]): string[] {
  const localDateSet = new Set<string>();
  for (const utcDateStr of utcDates) {
    const [y, m, d] = utcDateStr.split("-").map(Number);
    const utcDayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    localDateSet.add(formatDateAsLocal(utcDayStart));
    const utcDayEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 0));
    localDateSet.add(formatDateAsLocal(utcDayEnd));
  }
  // Filter out future local dates — e.g. in UTC-7, a UTC "tomorrow" date
  // maps to a local date that hasn't started yet
  const today = formatLocalDate();
  return Array.from(localDateSet).filter((d) => d <= today).sort();
}

/** Get the current local day-of-week index (Monday=0, ..., Sunday=6) */
export function getLocalDayOfWeekIndex(): number {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return day === 0 ? 6 : day - 1;
}

/** Check if a YYYY-MM-DD date string falls in the current local week (Mon–Sun) */
export function isDateInCurrentLocalWeek(dateStr: string): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayDow = today.getDay(); // 0=Sun
  const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const monday = new Date(today);
  monday.setDate(monday.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);

  return target >= monday && target <= sunday;
}

export function shiftDayDataToLocal(
  date1Data: Record<string, number>,
  date2Data: Record<string, number>,
  utcMinutesAtMidnight: number
): Record<string, number> {
  const result: Record<string, number> = {};
  for (let localHour = 0; localHour < 24; localHour++) {
    const totalUtcMinutes = localHour * 60 + utcMinutesAtMidnight;
    const utcHour = Math.floor(totalUtcMinutes / 60) % 24;
    const isDate2 = totalUtcMinutes >= 24 * 60;
    const data = isDate2 ? date2Data : date1Data;
    result[localHour.toString()] = data[utcHour.toString()] || 0;
  }
  return result;
}
