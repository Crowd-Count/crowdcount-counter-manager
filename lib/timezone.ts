// Timezone utilities for converting UTC server data to a display timezone.
// The server stores all data in UTC — hour keys "0"-"23" are UTC hours,
// day-of-week and month buckets are based on UTC boundaries.
//
// Helpers take an optional IANA `timeZone` argument: when provided, all math is
// pinned to that zone (locations stay in their own timezone regardless of the
// viewer); when omitted, the browser's local timezone is used.

/** Format a Date's UTC components as YYYY-MM-DD */
export function formatUTCDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- Intl-based timezone primitives ---

// Intl.DateTimeFormat construction is expensive; cache one per zone.
const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDtf(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

function wallClockParts(timeZone: string, at: Date): Record<string, number> {
  const parts = getDtf(timeZone).formatToParts(at);
  const result: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") result[part.type] = Number(part.value);
  }
  return result;
}

/**
 * Offset of `timeZone` from UTC in minutes at instant `at`, east-positive
 * (e.g. New York in July = -240). DST-correct because it is evaluated at `at`.
 * Falls back to the browser offset if the zone string is invalid.
 */
export function getUtcOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const p = wallClockParts(timeZone, at);
    const wallUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((wallUtc - at.getTime()) / 60000);
  } catch {
    return -at.getTimezoneOffset();
  }
}

/**
 * UTC epoch ms of wall-clock y-m-d h:min in `timeZone` (inverse mapping).
 * Two passes converge for all real zones; nonexistent local times
 * (DST spring-forward) land on an adjacent valid instant.
 */
function zonedTimeToUtcMs(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  timeZone: string
): number {
  const wallUtc = Date.UTC(y, m - 1, d, h, min, 0);
  let ms = wallUtc;
  for (let i = 0; i < 2; i++) {
    ms = wallUtc - getUtcOffsetMinutes(timeZone, new Date(ms)) * 60000;
  }
  return ms;
}

/** Format a Date as its YYYY-MM-DD wall date in `timeZone` (browser-local when omitted). */
export function formatDateInTimeZone(date: Date, timeZone?: string): string {
  if (!timeZone) return formatDateAsLocal(date);
  try {
    const p = wallClockParts(timeZone, date);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  } catch {
    return formatDateAsLocal(date);
  }
}

/** Today's YYYY-MM-DD wall date in `timeZone` (browser-local when omitted). */
export function todayInTimeZone(timeZone?: string): string {
  return formatDateInTimeZone(new Date(), timeZone);
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
 * @param dateStr Optional YYYY-MM-DD string treated as a date in the display zone. If omitted, uses today.
 * @param timeZone Optional IANA zone the day is anchored to; browser-local when omitted.
 */
export function getLocalDayUTCBounds(dateStr?: string, timeZone?: string): LocalDayUTCBounds {
  if (timeZone) {
    const [y, m, d] = (dateStr ?? todayInTimeZone(timeZone)).split("-").map(Number);
    const midnight = new Date(zonedTimeToUtcMs(y, m, d, 0, 0, timeZone));
    // Normalize the d+1 rollover through Date.UTC before mapping back to the zone
    const nextCivil = new Date(Date.UTC(y, m - 1, d + 1));
    const nextMidnight = new Date(
      zonedTimeToUtcMs(
        nextCivil.getUTCFullYear(),
        nextCivil.getUTCMonth() + 1,
        nextCivil.getUTCDate(),
        0,
        0,
        timeZone
      )
    );
    return {
      utcDate1: formatUTCDate(midnight),
      utcDate2: formatUTCDate(nextMidnight),
      utcMinutesAtMidnight: midnight.getUTCHours() * 60 + midnight.getUTCMinutes(),
    };
  }

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
 * Convert an array of UTC date strings to display-zone date strings.
 * For each UTC date, checks both day boundaries (00:00 and 23:59 UTC)
 * to find which local dates they map to, ensuring correct coverage
 * across timezone offsets.
 */
export function utcDatesToLocalDates(utcDates: string[], timeZone?: string): string[] {
  const localDateSet = new Set<string>();
  for (const utcDateStr of utcDates) {
    const [y, m, d] = utcDateStr.split("-").map(Number);
    const utcDayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    localDateSet.add(formatDateInTimeZone(utcDayStart, timeZone));
    const utcDayEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 0));
    localDateSet.add(formatDateInTimeZone(utcDayEnd, timeZone));
  }
  // Filter out future local dates — e.g. in UTC-7, a UTC "tomorrow" date
  // maps to a local date that hasn't started yet
  const today = todayInTimeZone(timeZone);
  return Array.from(localDateSet).filter((d) => d <= today).sort();
}

/** Get the current day-of-week index in the display zone (Monday=0, ..., Sunday=6) */
export function getLocalDayOfWeekIndex(timeZone?: string): number {
  // The weekday of a civil date is zone-independent, so derive it from the wall date
  const [y, m, d] = todayInTimeZone(timeZone).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return day === 0 ? 6 : day - 1;
}

/** Check if a YYYY-MM-DD date string falls in the current week (Mon–Sun) of the display zone */
export function isDateInCurrentLocalWeek(dateStr: string, timeZone?: string): boolean {
  // Once "today" is known, Monday/Sunday math is pure civil-date arithmetic
  const [ty, tm, td] = todayInTimeZone(timeZone).split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const todayDow = new Date(todayMs).getUTCDay(); // 0=Sun
  const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const mondayMs = todayMs + mondayOffset * DAY_MS;
  const sundayMs = mondayMs + 6 * DAY_MS;

  const [y, m, d] = dateStr.split("-").map(Number);
  const targetMs = Date.UTC(y, m - 1, d);

  return targetMs >= mondayMs && targetMs <= sundayMs;
}

/**
 * Shift hourly data from two UTC dates into a single local-day record keyed by local hours "0"-"23".
 *
 * On DST-transition days the single midnight offset means hours after the
 * switch are shifted by 1h (a 25h day loses an hour of data; a 23h day shows
 * one phantom hour) — accepted approximation.
 *
 * @param date1Data Hourly data for utcDate1 (keys "0"-"23")
 * @param date2Data Hourly data for utcDate2 (keys "0"-"23")
 * @param utcMinutesAtMidnight UTC minutes into date1's day when local midnight occurs
 */
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
