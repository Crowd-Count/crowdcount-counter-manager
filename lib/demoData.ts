/**
 * Deterministic fixture data for demo mode.
 *
 * Every number derives from a hash of (counter, local date, hour), so the same
 * visitor sees the same history on every load while today's data still fills
 * in hour by hour. Curves are defined in each counter's own wall-clock
 * timezone and re-keyed to UTC the way the real server stores them, so the
 * client's timezone math (shiftDayDataToLocal etc.) works unchanged.
 */

import { formatUTCDate, getUtcOffsetMinutes } from "./timezone";
import type { DemoServerDevice } from "./demo";
import type { POSPeriodStats } from "./types";

export type Kind = "occ" | "ent";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Local-hour shape of a day (index = local hour, value = share of peak)
const OCC_PROFILE = [0, 0, 0, 0, 0, 0, 0, 0.10, 0.25, 0.42, 0.60, 0.78, 0.92, 1.0, 0.98, 0.90, 0.80, 0.72, 0.62, 0.45, 0.25, 0.10, 0, 0];
const ENT_PROFILE = [0, 0, 0, 0, 0, 0, 0, 0.15, 0.35, 0.55, 0.65, 0.85, 1.0, 0.72, 0.60, 0.58, 0.66, 0.90, 0.78, 0.48, 0.30, 0.12, 0, 0];
const DOW_FACTOR = [0.85, 0.9, 0.95, 1.0, 1.15, 1.3, 1.1]; // Mon..Sun
const MONTH_FACTOR = [0.8, 0.82, 0.9, 0.95, 1.0, 1.1, 1.2, 1.15, 1.0, 0.95, 0.9, 1.05];
const TYPICAL_FACTOR = 0.94; // historical averages sit a little under today
const NOISE_AMPLITUDE = 0.18;

const POS_CONVERSION = 0.32;
const POS_AVG_TICKET_CENTS = 925;

// ── Hashing ──

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic pseudo-random in [-1, 1) */
export function noise(key: string): number {
  return (fnv1a(key) / 0x100000000) * 2 - 1;
}

/** Deterministic pseudo-random integer in [min, max] */
export function hashInt(key: string, min: number, max: number): number {
  return min + (fnv1a(key) % (max - min + 1));
}

// ── Timezone helpers ──

const offsetCache = new Map<string, number>();

function offsetAt(ms: number, tz: string): number {
  const key = `${tz}|${Math.floor(ms / HOUR_MS)}`;
  let off = offsetCache.get(key);
  if (off === undefined) {
    off = getUtcOffsetMinutes(tz, new Date(ms));
    offsetCache.set(key, off);
  }
  return off;
}

interface LocalTime {
  date: string;
  hour: number;
}

function toLocal(ms: number, tz: string): LocalTime {
  const l = new Date(ms + offsetAt(ms, tz) * 60_000);
  return { date: formatUTCDate(l), hour: l.getUTCHours() };
}

function splitDate(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

/** UTC ms of local midnight for a YYYY-MM-DD wall date in `tz` */
function localMidnightMs(date: string, tz: string): number {
  const [y, m, d] = splitDate(date);
  const wall = Date.UTC(y, m - 1, d);
  let ms = wall;
  for (let i = 0; i < 2; i++) ms = wall - offsetAt(ms, tz) * 60_000;
  return ms;
}

export function todayLocal(tz: string): string {
  return toLocal(Date.now(), tz).date;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = splitDate(date);
  return formatUTCDate(new Date(Date.UTC(y, m - 1, d + n)));
}

function dowMon0(date: string): number {
  const [y, m, d] = splitDate(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

export function mondayOf(date: string): string {
  return addDays(date, -dowMon0(date));
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Minutes past UTC midnight (of the first overlapping UTC day) at local midnight — mirrors getLocalDayUTCBounds */
function utcMinutesAtLocalMidnight(date: string, tz: string): number {
  const midnight = new Date(localMidnightMs(date, tz));
  return midnight.getUTCHours() * 60 + midnight.getUTCMinutes();
}

/** Timezone that anchors a group of counters (first counter wins) */
export function groupTimezone(devs: DemoServerDevice[]): string {
  return devs[0]?.tz ?? "UTC";
}

// ── Core curve ──

/** Shape-only value for one counter at a local wall-clock hour */
function curve(dev: DemoServerDevice, kind: Kind, date: string, hour: number, typical: boolean): number {
  const profile = kind === "occ" ? OCC_PROFILE : ENT_PROFILE;
  const peak = kind === "occ" ? dev.occPeak : dev.entPeak;
  const [, month] = splitDate(date);
  const shape = Math.max(profile[hour], dev.nightFloor);
  let v = shape * peak * DOW_FACTOR[dowMon0(date)] * MONTH_FACTOR[month - 1];
  if (typical) {
    v *= TYPICAL_FACTOR;
  } else {
    v *= 1 + NOISE_AMPLITUDE * noise(`${dev.device_id}|${kind}|${date}|${hour}`);
  }
  return v;
}

/**
 * Value for one counter for the hour starting at UTC `startMs`.
 * Live data is time-aware: future hours are 0, the current hour of entries is
 * pro-rated, and history before a reset reads as 0. Typical (average) data is not.
 */
function hourValueAt(dev: DemoServerDevice, kind: Kind, startMs: number, typical: boolean): number {
  const local = toLocal(startMs, dev.tz);
  if (typical) return Math.round(curve(dev, kind, local.date, local.hour, true));
  const now = Date.now();
  if (startMs > now) return 0;
  if (dev.resetDate && local.date < dev.resetDate) return 0;
  let v = curve(dev, kind, local.date, local.hour, false);
  if (kind === "ent" && now - startMs < HOUR_MS) v *= (now - startMs) / HOUR_MS;
  return Math.round(v);
}

/** Interpolated "right now" occupancy for a counter — used to seed live counts */
export function occupancyNow(dev: DemoServerDevice): number {
  const now = Date.now();
  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const frac = (now - hourStart) / HOUR_MS;
  const a = hourValueAt(dev, "occ", hourStart, false);
  const bLocal = toLocal(hourStart + HOUR_MS, dev.tz);
  const b = curve(dev, "occ", bLocal.date, bLocal.hour, false);
  return Math.round(a + (b - a) * frac);
}

// ── Day records keyed by UTC hour (what the server returns) ──

export function utcDayRecord(devs: DemoServerDevice[], kind: Kind, utcDate: string, typical: boolean): Record<string, number> {
  const [y, m, d] = splitDate(utcDate);
  const base = Date.UTC(y, m - 1, d);
  const rec: Record<string, number> = {};
  for (let u = 0; u < 24; u++) {
    let sum = 0;
    for (const dev of devs) sum += hourValueAt(dev, kind, base + u * HOUR_MS, typical);
    rec[String(u)] = sum;
  }
  return rec;
}

/** 15-minute slots keyed "H:MM" in local time for a local date (CSV export) */
export function detailedDayRecord(
  devs: DemoServerDevice[],
  kind: Kind,
  date: string
): { data: Record<string, number>; average: Record<string, number> } {
  const data: Record<string, number> = {};
  const average: Record<string, number> = {};
  const midnight = localMidnightMs(date, groupTimezone(devs));
  for (let h = 0; h < 24; h++) {
    const startMs = midnight + h * HOUR_MS;
    for (let q = 0; q < 4; q++) {
      const label = `${h}:${String(q * 15).padStart(2, "0")}`;
      const isFuture = startMs + q * 15 * 60_000 > Date.now();
      let live = 0;
      let typ = 0;
      for (const dev of devs) {
        const t = hourValueAt(dev, kind, startMs, true);
        typ += kind === "ent" ? t / 4 : t;
        if (isFuture) continue;
        const jitter = 1 + 0.12 * noise(`${dev.device_id}|q|${date}|${h}|${q}`);
        const l = hourValueAt(dev, kind, startMs, false);
        live += kind === "ent" ? (l / 4) * jitter : l * jitter;
      }
      data[label] = Math.round(live);
      average[label] = Math.round(typ);
    }
  }
  return { data, average };
}

// ── Day aggregates (local date) ──

const dayAggCache = new Map<string, number>();

/** Entries: total for the local day. Occupancy: mean of non-zero hours. */
function dayAgg(dev: DemoServerDevice, kind: Kind, date: string, typical: boolean): number {
  const cacheable = typical || date < todayLocal(dev.tz);
  const key = `${dev.device_id}|${dev.tz}|${kind}|${date}|${typical}|${dev.resetDate ?? ""}|${dev.occPeak}|${dev.entPeak}|${dev.nightFloor}`;
  if (cacheable) {
    const hit = dayAggCache.get(key);
    if (hit !== undefined) return hit;
  }
  const midnight = localMidnightMs(date, dev.tz);
  let sum = 0;
  let n = 0;
  for (let h = 0; h < 24; h++) {
    const v = hourValueAt(dev, kind, midnight + h * HOUR_MS, typical);
    if (kind === "ent") {
      sum += v;
    } else if (v > 0) {
      sum += v;
      n++;
    }
  }
  const result = kind === "ent" ? sum : n > 0 ? sum / n : 0;
  if (cacheable) dayAggCache.set(key, result);
  return result;
}

function dayAggAll(devs: DemoServerDevice[], kind: Kind, date: string, typical: boolean): number {
  let sum = 0;
  for (const dev of devs) sum += dayAgg(dev, kind, date, typical);
  return sum;
}

// ── Week / year records ──

export function weekRecord(devs: DemoServerDevice[], kind: Kind, dateInWeek: string, typical: boolean): Record<string, number> {
  const monday = mondayOf(dateInWeek);
  const today = todayLocal(groupTimezone(devs));
  const rec: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    rec[DAY_NAMES[i]] = !typical && date > today ? 0 : Math.round(dayAggAll(devs, kind, date, typical));
  }
  return rec;
}

export function yearRecord(devs: DemoServerDevice[], kind: Kind, year: number, typical: boolean): Record<string, number> {
  const today = todayLocal(groupTimezone(devs));
  const rec: Record<string, number> = {};
  for (let m = 0; m < 12; m++) {
    let sum = 0;
    let n = 0;
    const dim = daysInMonth(year, m);
    for (let d = 1; d <= dim; d++) {
      const date = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!typical && date > today) break;
      const v = dayAggAll(devs, kind, date, typical);
      if (kind === "ent") {
        sum += v;
      } else if (v > 0) {
        sum += v;
        n++;
      }
    }
    rec[MONTH_NAMES[m]] = kind === "ent" ? Math.round(sum) : n > 0 ? Math.round(sum / n) : 0;
  }
  return rec;
}

/** UTC dates with data — the last `days` days, honoring resets */
export function availableUtcDates(devs: DemoServerDevice[], days = 90): string[] {
  const dates: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const date = formatUTCDate(new Date(now - i * DAY_MS));
    if (devs.some((dev) => !dev.resetDate || date >= dev.resetDate)) dates.push(date);
  }
  return dates;
}

// ── POS (Square) ──

interface PosHour {
  transactions: number;
  revenue: number;
}

function posHourAt(devs: DemoServerDevice[], startMs: number): PosHour {
  let entries = 0;
  for (const dev of devs) entries += hourValueAt(dev, "ent", startMs, false);
  if (entries === 0) return { transactions: 0, revenue: 0 };
  const l = toLocal(startMs, groupTimezone(devs));
  const transactions = Math.round(entries * POS_CONVERSION * (1 + 0.1 * noise(`pos|${l.date}|${l.hour}`)));
  const revenue = Math.round(transactions * POS_AVG_TICKET_CENTS * (1 + 0.15 * noise(`rev|${l.date}|${l.hour}`)));
  return { transactions, revenue };
}

const posDayCache = new Map<string, PosHour & { entries: number }>();

function posDay(devs: DemoServerDevice[], date: string): PosHour & { entries: number } {
  const tz = groupTimezone(devs);
  const key = `${devs.map((d) => d.device_id).join(",")}|${tz}|${date}`;
  const cacheable = date < todayLocal(tz);
  if (cacheable) {
    const hit = posDayCache.get(key);
    if (hit) return hit;
  }
  const midnight = localMidnightMs(date, tz);
  let transactions = 0;
  let revenue = 0;
  for (let h = 0; h < 24; h++) {
    const ph = posHourAt(devs, midnight + h * HOUR_MS);
    transactions += ph.transactions;
    revenue += ph.revenue;
  }
  const entries = Math.round(dayAggAll(devs, "ent", date, false));
  const result = { transactions, revenue, entries };
  if (cacheable) posDayCache.set(key, result);
  return result;
}

function periodStats(devs: DemoServerDevice[], dates: string[], hourlyForDate?: string): POSPeriodStats {
  let transactions = 0;
  let revenue = 0;
  let entries = 0;
  for (const date of dates) {
    const d = posDay(devs, date);
    transactions += d.transactions;
    revenue += d.revenue;
    entries += d.entries;
  }
  const stats: POSPeriodStats = {
    transactions,
    revenue,
    currency: "USD",
    entries,
    conversion_rate: entries > 0 ? Math.min(100, (transactions / entries) * 100) : 0,
    revenue_per_visitor: entries > 0 ? Math.round(revenue / entries) : 0,
    avg_transaction: transactions > 0 ? Math.round(revenue / transactions) : 0,
  };
  if (hourlyForDate) {
    // Keyed by local hour — the insights UI displays the key directly
    const midnight = localMidnightMs(hourlyForDate, groupTimezone(devs));
    const hourly: Record<string, PosHour> = {};
    for (let h = 0; h < 24; h++) hourly[String(h)] = posHourAt(devs, midnight + h * HOUR_MS);
    stats.hourly_data = hourly;
  }
  return stats;
}

function dateRange(start: string, end: string, cap = 400): string[] {
  const out: string[] = [];
  let d = start;
  while (d <= end && out.length < cap) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function posInsights(devs: DemoServerDevice[]) {
  const today = todayLocal(groupTimezone(devs));
  const monday = mondayOf(today);
  const year = Number(today.slice(0, 4));
  return {
    today: periodStats(devs, [today], today),
    prev_day: periodStats(devs, [addDays(today, -7)]),
    week: periodStats(devs, dateRange(monday, today)),
    prev_week: periodStats(devs, dateRange(addDays(monday, -7), addDays(monday, -1))),
    year: periodStats(devs, dateRange(`${year}-01-01`, today)),
    prev_year: periodStats(devs, dateRange(`${year - 1}-01-01`, `${year - 1}-12-31`)),
  };
}

/** Transactions over a local date range; hourly breakdown keyed by UTC hour (what HistoryContent expects) */
export function posTransactions(devs: DemoServerDevice[], startDate: string, endDate: string) {
  const tz = groupTimezone(devs);
  const hourly: Record<string, PosHour> = {};
  let total_transactions = 0;
  let total_revenue = 0;
  for (const date of dateRange(startDate, endDate)) {
    const midnight = localMidnightMs(date, tz);
    const utcMinutesAtMidnight = utcMinutesAtLocalMidnight(date, tz);
    for (let h = 0; h < 24; h++) {
      const ph = posHourAt(devs, midnight + h * HOUR_MS);
      const utcHour = Math.floor((h * 60 + utcMinutesAtMidnight) / 60) % 24;
      const slot = (hourly[String(utcHour)] ??= { transactions: 0, revenue: 0 });
      slot.transactions += ph.transactions;
      slot.revenue += ph.revenue;
      total_transactions += ph.transactions;
      total_revenue += ph.revenue;
    }
  }
  return { total_transactions, total_revenue, currency: "USD", hourly_breakdown: hourly };
}

/** Rough average visit length in minutes from occupancy vs. entry volume */
export function dwellTimeMinutes(devs: DemoServerDevice[]): number {
  const occ = devs.reduce((s, d) => s + d.occPeak, 0);
  const ent = devs.reduce((s, d) => s + d.entPeak, 0);
  if (ent === 0) return 0;
  return Math.round((occ / ent) * 60);
}
