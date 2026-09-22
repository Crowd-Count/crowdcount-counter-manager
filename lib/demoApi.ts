/**
 * In-browser stand-in for the counter server, used when demo mode is on.
 * `apiRequest` (lib/api.ts) and `posRequest` (lib/posApi.ts) route every
 * endpoint here instead of fetching; responses mirror the real JSON shapes.
 */

import {
  DEMO_POS_ACCOUNT,
  DEMO_POS_STORES,
  browserTimezone,
  getDemoState,
  saveDemoState,
  type DemoServerDevice,
  type DemoServerLocation,
  type DemoState,
} from "./demo";
import * as gen from "./demoData";
import type { ClosingTimeDay, LocationResponse } from "./types";

type Body = Record<string, unknown>;
type Handler = (body: Body, state: DemoState) => unknown;

const TICK_MS = 4_000;

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60 + Math.random() * 90));
}

function str(body: Body, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v : "";
}

function num(body: Body, key: string): number {
  const v = body[key];
  return typeof v === "number" ? v : Number(v) || 0;
}

function notFound(): never {
  throw new Error("API request failed: 404");
}

// ── Devices ──

/** Any credentials are accepted in demo; unknown counters get a plausible profile. */
function getOrCreateDevice(state: DemoState, deviceId: string, password?: string): DemoServerDevice {
  let dev = state.devices[deviceId];
  if (!dev) {
    dev = {
      device_id: deviceId,
      password: password ?? "",
      label: deviceId,
      direction_flipped: false,
      count: 0,
      tz: browserTimezone(),
      occPeak: gen.hashInt(`occ|${deviceId}`, 12, 40),
      entPeak: gen.hashInt(`ent|${deviceId}`, 25, 70),
      nightFloor: 0.1,
      overcrowding: null,
      resetDate: null,
    };
    dev.count = gen.occupancyNow(dev);
    state.devices[deviceId] = dev;
    saveDemoState();
  }
  return dev;
}

function bodyDevice(body: Body, state: DemoState): DemoServerDevice {
  const id = str(body, "device_id") || str(body, "device_name");
  if (!id) notFound();
  return getOrCreateDevice(state, id, str(body, "password") || undefined);
}

function credentialDevices(body: Body, state: DemoState): DemoServerDevice[] {
  const creds = Array.isArray(body.credentials) ? (body.credentials as Body[]) : [];
  return creds
    .map((c) => str(c, "device_id"))
    .filter(Boolean)
    .map((id) => getOrCreateDevice(state, id));
}

function locationDevices(state: DemoState, loc: DemoServerLocation): DemoServerDevice[] {
  return loc.device_ids.map((id) => getOrCreateDevice(state, id));
}

/** Live counts wander ±1 every few seconds, pulled gently toward the curve. */
function tick(state: DemoState): void {
  const now = Date.now();
  if (state.lastTick === 0) {
    for (const dev of Object.values(state.devices)) dev.count = gen.occupancyNow(dev);
    state.lastTick = now;
    saveDemoState();
    return;
  }
  // Cap catch-up after a hidden tab so counts never jump more than a few
  const steps = Math.min(3, Math.floor((now - state.lastTick) / TICK_MS));
  if (steps <= 0) return;
  state.lastTick += steps * TICK_MS;
  for (const dev of Object.values(state.devices)) {
    const target = gen.occupancyNow(dev);
    for (let s = 0; s < steps; s++) {
      const r = Math.random();
      let delta = r < 0.3 ? 1 : r < 0.6 ? -1 : 0;
      if (dev.count < target - 3 && delta <= 0) delta = 1;
      if (dev.count > target + 3 && delta >= 0) delta = -1;
      dev.count = Math.max(0, dev.count + delta);
    }
  }
  saveDemoState();
}

// ── Locations ──

function getLocation(state: DemoState, id: string): DemoServerLocation {
  const loc = state.locations[id];
  if (!loc) notFound();
  return loc;
}

function locationCount(state: DemoState, loc: DemoServerLocation): number {
  return locationDevices(state, loc).reduce((s, d) => s + d.count, 0);
}

function locationResponse(state: DemoState, loc: DemoServerLocation): LocationResponse {
  const devices = locationDevices(state, loc);
  return {
    location_id: loc.location_id,
    location_name: loc.location_name,
    location_color: loc.location_color,
    devices: devices.map((d) => ({ device_id: d.device_id, label: d.label, current_count: d.count })),
    overcrowding_limit: loc.overcrowding_limit,
    current_count: devices.reduce((s, d) => s + d.count, 0),
    on_map: loc.on_map,
    is_auto: false,
    location_latitude: loc.latitude,
    location_longitude: loc.longitude,
  };
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function createLocation(state: DemoState, devices: DemoServerDevice[], name: string, limit: number | null): DemoServerLocation {
  const ids = devices.map((d) => d.device_id);
  const existing = Object.values(state.locations).find((l) => sameSet(l.device_ids, ids));
  if (existing) return existing;
  const loc: DemoServerLocation = {
    location_id: `demo-loc-${state.nextLocationId++}`,
    location_name: name || `Location ${ids[0]}`,
    location_color: null,
    device_ids: ids,
    overcrowding_limit: limit,
    on_map: false,
    latitude: null,
    longitude: null,
    closing_time: null,
    pos: null,
    resetDate: null,
  };
  state.locations[loc.location_id] = loc;
  saveDemoState();
  return loc;
}

// ── Shared history helpers ──

const utcDay = (devs: DemoServerDevice[], kind: gen.Kind, body: Body, typical: boolean) =>
  gen.utcDayRecord(devs, kind, str(body, "date"), typical);
const week = (devs: DemoServerDevice[], kind: gen.Kind, body: Body, typical: boolean) =>
  gen.weekRecord(devs, kind, str(body, "date") || gen.todayLocal(gen.groupTimezone(devs)), typical);
const year = (devs: DemoServerDevice[], kind: gen.Kind, body: Body, typical: boolean) =>
  gen.yearRecord(devs, kind, num(body, "year") || currentYear(devs), typical);

function currentYear(devs: DemoServerDevice[]): number {
  return Number(gen.todayLocal(gen.groupTimezone(devs)).slice(0, 4));
}

function locationDevicesFromBody(body: Body, state: DemoState): DemoServerDevice[] {
  return locationDevices(state, getLocation(state, str(body, "location_id")));
}

function insightsBundle(devs: DemoServerDevice[], body: Body) {
  const date = str(body, "date");
  const date2 = str(body, "date2");
  const weekDate = str(body, "week_date") || gen.todayLocal(gen.groupTimezone(devs));
  const yr = num(body, "year") || currentYear(devs);
  return {
    day_view: gen.utcDayRecord(devs, "occ", date, false),
    average_day_view: gen.utcDayRecord(devs, "occ", date, true),
    entry_day_view: gen.utcDayRecord(devs, "ent", date, false),
    average_entry_day_view: gen.utcDayRecord(devs, "ent", date, true),
    ...(date2
      ? {
          day_view_2: gen.utcDayRecord(devs, "occ", date2, false),
          average_day_view_2: gen.utcDayRecord(devs, "occ", date2, true),
          entry_day_view_2: gen.utcDayRecord(devs, "ent", date2, false),
          average_entry_day_view_2: gen.utcDayRecord(devs, "ent", date2, true),
        }
      : {}),
    week_view: gen.weekRecord(devs, "occ", weekDate, false),
    average_week_view: gen.weekRecord(devs, "occ", weekDate, true),
    entry_week_view: gen.weekRecord(devs, "ent", weekDate, false),
    average_entry_week_view: gen.weekRecord(devs, "ent", weekDate, true),
    year_view: gen.yearRecord(devs, "occ", yr, false),
    average_year_view: gen.yearRecord(devs, "occ", yr, true),
    entry_year_view: gen.yearRecord(devs, "ent", yr, false),
    average_entry_year_view: gen.yearRecord(devs, "ent", yr, true),
    dwell_time_view: gen.dwellTimeMinutes(devs),
  };
}

function historyBundle(devs: DemoServerDevice[], body: Body) {
  const kind: gen.Kind = str(body, "data_type") === "entries" ? "ent" : "occ";
  const date = str(body, "date");
  const date2 = str(body, "date2");
  const weekDate = str(body, "week_date") || gen.todayLocal(gen.groupTimezone(devs));
  const yr = num(body, "year") || currentYear(devs);
  return {
    day_view: gen.utcDayRecord(devs, kind, date, false),
    average_day_view: gen.utcDayRecord(devs, kind, date, true),
    ...(date2
      ? {
          day_view_2: gen.utcDayRecord(devs, kind, date2, false),
          average_day_view_2: gen.utcDayRecord(devs, kind, date2, true),
        }
      : {}),
    week_view: gen.weekRecord(devs, kind, weekDate, false),
    average_week_view: gen.weekRecord(devs, kind, weekDate, true),
    year_view: gen.yearRecord(devs, kind, yr, false),
    average_year_view: gen.yearRecord(devs, kind, yr, true),
  };
}

function posStatus(loc: DemoServerLocation) {
  if (!loc.pos) return { connected: false };
  return {
    connected: true,
    provider: loc.pos.provider,
    pos_location_name: loc.pos.pos_location_name,
    pos_location_id: loc.pos.pos_location_id,
    merchant_id: loc.pos.merchant_id,
    pos_account_id: loc.pos.pos_account_id,
    connected_at: loc.pos.connected_at,
  };
}

// ── Endpoint table ──

const handlers: Record<string, Handler> = {
  // Alerts / health
  "/check_if_alert": () => ({ is_alert: false }),
  "/get_active_alert": () => ({ alert_info: [] }),

  // Auth & counts
  "/check_password": (b, s) => {
    bodyDevice(b, s);
    return { is_password_correct: true };
  },
  "/currentcount": (b, s) => {
    tick(s);
    return { current_count: bodyDevice(b, s).count };
  },
  "/setcount": (b, s) => {
    bodyDevice(b, s).count = Math.max(0, num(b, "new_count"));
    saveDemoState();
    return {};
  },
  "/add_to_count": (b, s) => {
    const dev = bodyDevice(b, s);
    dev.count += num(b, "count_to_add");
    saveDemoState();
    return { new_count: dev.count };
  },
  "/sub_from_count": (b, s) => {
    const dev = bodyDevice(b, s);
    dev.count = Math.max(0, dev.count - num(b, "count_to_sub"));
    saveDemoState();
    return { new_count: dev.count };
  },
  "/connection_status": (b, s) => {
    bodyDevice(b, s);
    return { status: "online" };
  },

  // Device settings
  "/get_overcrowding": (b, s) => ({ overcrowding: bodyDevice(b, s).overcrowding }),
  "/add_overcrowding": (b, s) => {
    bodyDevice(b, s).overcrowding = num(b, "overcrowding_value");
    saveDemoState();
    return {};
  },
  "/remove_overcrowding": (b, s) => {
    bodyDevice(b, s).overcrowding = null;
    saveDemoState();
    return {};
  },
  "/get_direction_flipped": (b, s) => ({ direction_flipped: bodyDevice(b, s).direction_flipped }),
  "/set_direction_flipped": (b, s) => {
    bodyDevice(b, s).direction_flipped = b.direction_flipped === true;
    saveDemoState();
    return {};
  },
  "/set_password": (b, s) => {
    bodyDevice(b, s).password = str(b, "new_password");
    saveDemoState();
    return {};
  },
  "/reset_device_data": (b, s) => {
    const dev = bodyDevice(b, s);
    dev.count = 0;
    dev.resetDate = gen.todayLocal(dev.tz);
    saveDemoState();
    return {};
  },

  // Device history
  "/get_user_days": (b, s) => ({ dates: gen.availableUtcDates([bodyDevice(b, s)]) }),
  "/check_if_user_has_day": (b, s) => ({
    has_day: gen.availableUtcDates([bodyDevice(b, s)]).includes(str(b, "date")),
  }),
  "/check_if_user_has_week": () => ({ has_week: true }),
  "/get_day_data": (b, s) => ({ day_data: utcDay([bodyDevice(b, s)], "occ", b, false) }),
  "/get_average_day_data": (b, s) => ({ average_day_data: utcDay([bodyDevice(b, s)], "occ", b, true) }),
  "/get_entry_day_data": (b, s) => ({ entry_day_data: utcDay([bodyDevice(b, s)], "ent", b, false) }),
  "/get_average_entry_day_data": (b, s) => ({ average_entry_day_data: utcDay([bodyDevice(b, s)], "ent", b, true) }),
  "/get_week_data": (b, s) => ({ week_data: week([bodyDevice(b, s)], "occ", b, false) }),
  "/get_average_week_data": (b, s) => ({ average_week_data: week([bodyDevice(b, s)], "occ", b, true) }),
  "/get_entry_week_data": (b, s) => ({ entry_week_data: week([bodyDevice(b, s)], "ent", b, false) }),
  "/get_average_entry_week_data": (b, s) => ({ average_entry_week_data: week([bodyDevice(b, s)], "ent", b, true) }),
  "/get_year_data": (b, s) => ({ year_data: year([bodyDevice(b, s)], "occ", b, false) }),
  "/get_average_year_data": (b, s) => ({ average_year_data: year([bodyDevice(b, s)], "occ", b, true) }),
  "/get_entry_year_data": (b, s) => ({ entry_year_data: year([bodyDevice(b, s)], "ent", b, false) }),
  "/get_average_entry_year_data": (b, s) => ({ average_entry_year_data: year([bodyDevice(b, s)], "ent", b, true) }),

  // Location CRUD
  "/create_location": (b, s) => {
    const devs = credentialDevices(b, s);
    if (devs.length === 0) notFound();
    const limit = typeof b.overcrowding_limit === "number" ? b.overcrowding_limit : null;
    return { location_id: createLocation(s, devs, str(b, "name"), limit).location_id };
  },
  "/replace_location": (b, s) => {
    const devs = credentialDevices(b, s);
    const old = getLocation(s, str(b, "location_id"));
    return { location_id: createLocation(s, devs, old.location_name, old.overcrowding_limit).location_id };
  },
  "/update_location": (b, s) => {
    const loc = getLocation(s, str(b, "location_id"));
    if (typeof b.name === "string" && b.name) loc.location_name = b.name;
    if ("overcrowding_limit" in b) {
      loc.overcrowding_limit = typeof b.overcrowding_limit === "number" && b.overcrowding_limit > 0 ? b.overcrowding_limit : null;
    }
    saveDemoState();
    return {};
  },
  "/delete_location": (b, s) => {
    delete s.locations[str(b, "location_id")];
    saveDemoState();
    return {};
  },
  "/get_locations_for_device": (b, s) => {
    tick(s);
    const dev = bodyDevice(b, s);
    const locations = Object.values(s.locations)
      .filter((l) => l.device_ids.includes(dev.device_id))
      .map((l) => locationResponse(s, l));
    return { locations };
  },
  "/get_location": (b, s) => {
    tick(s);
    return locationResponse(s, getLocation(s, str(b, "location_id")));
  },
  "/location/add_to_count": (b, s) => {
    const loc = getLocation(s, str(b, "location_id"));
    const devs = locationDevices(s, loc);
    if (devs.length > 0) devs[0].count += num(b, "count_to_add");
    saveDemoState();
    return { new_count: locationCount(s, loc) };
  },
  "/location/sub_from_count": (b, s) => {
    const loc = getLocation(s, str(b, "location_id"));
    let remaining = num(b, "count_to_sub");
    for (const dev of locationDevices(s, loc)) {
      const take = Math.min(dev.count, remaining);
      dev.count -= take;
      remaining -= take;
      if (remaining <= 0) break;
    }
    saveDemoState();
    return { new_count: locationCount(s, loc) };
  },
  "/reset_location_data": (b, s) => {
    const loc = getLocation(s, str(b, "location_id"));
    loc.resetDate = gen.todayLocal(gen.groupTimezone(locationDevices(s, loc)));
    for (const dev of locationDevices(s, loc)) {
      dev.resetDate = loc.resetDate;
      dev.count = 0;
    }
    saveDemoState();
    return {};
  },

  // Location history (data key is "data")
  "/get_location_available_dates": (b, s) => ({ dates: gen.availableUtcDates(locationDevicesFromBody(b, s)) }),
  "/get_location_day_data": (b, s) => ({ data: utcDay(locationDevicesFromBody(b, s), "occ", b, false) }),
  "/get_location_average_day_data": (b, s) => ({ data: utcDay(locationDevicesFromBody(b, s), "occ", b, true) }),
  "/get_location_entry_day_data": (b, s) => ({ data: utcDay(locationDevicesFromBody(b, s), "ent", b, false) }),
  "/get_location_average_entry_day_data": (b, s) => ({ data: utcDay(locationDevicesFromBody(b, s), "ent", b, true) }),
  "/get_location_week_data": (b, s) => ({ data: week(locationDevicesFromBody(b, s), "occ", b, false) }),
  "/get_location_average_week_data": (b, s) => ({ data: week(locationDevicesFromBody(b, s), "occ", b, true) }),
  "/get_location_entry_week_data": (b, s) => ({ data: week(locationDevicesFromBody(b, s), "ent", b, false) }),
  "/get_location_average_entry_week_data": (b, s) => ({ data: week(locationDevicesFromBody(b, s), "ent", b, true) }),
  "/get_location_year_data": (b, s) => ({ data: year(locationDevicesFromBody(b, s), "occ", b, false) }),
  "/get_location_average_year_data": (b, s) => ({ data: year(locationDevicesFromBody(b, s), "occ", b, true) }),
  "/get_location_entry_year_data": (b, s) => ({ data: year(locationDevicesFromBody(b, s), "ent", b, false) }),
  "/get_location_average_entry_year_data": (b, s) => ({ data: year(locationDevicesFromBody(b, s), "ent", b, true) }),
  "/get_location_insights_bundle": (b, s) => insightsBundle(locationDevicesFromBody(b, s), b),
  "/get_location_history_bundle": (b, s) => historyBundle(locationDevicesFromBody(b, s), b),
  "/get_location_day_data_detailed": (b, s) =>
    gen.detailedDayRecord(
      locationDevicesFromBody(b, s),
      str(b, "data_type") === "entries" ? "ent" : "occ",
      str(b, "date")
    ),

  // Operating hours
  "/get_closing_time": (b, s) => getLocation(s, str(b, "location_id")).closing_time ?? { closing_time: null },
  "/set_closing_time": (b, s) => {
    const loc = getLocation(s, str(b, "location_id"));
    loc.closing_time = {
      id: `demo-hours-${loc.location_id}`,
      location_id: loc.location_id,
      timezone: str(b, "timezone") || browserTimezone(),
      days: Array.isArray(b.days) ? (b.days as ClosingTimeDay[]) : [],
    };
    saveDemoState();
    return loc.closing_time;
  },
  "/delete_closing_time": (b, s) => {
    getLocation(s, str(b, "location_id")).closing_time = null;
    saveDemoState();
    return {};
  },

  // POS (Square)
  "/pos/status": (b, s) => posStatus(getLocation(s, str(b, "location_id"))),
  "/pos/check_existing_account": () => ({ has_account: true, ...DEMO_POS_ACCOUNT }),
  "/pos/start_oauth": () => {
    throw new Error("Square sign-in is disabled in the demo");
  },
  "/pos/list_locations": () => ({ locations: DEMO_POS_STORES }),
  "/pos/connect": (b, s) => {
    const loc = getLocation(s, str(b, "location_id"));
    loc.pos = {
      provider: "square",
      pos_location_id: str(b, "pos_location_id"),
      pos_location_name: str(b, "pos_location_name"),
      merchant_id: DEMO_POS_ACCOUNT.merchant_id,
      pos_account_id: str(b, "pos_account_id") || DEMO_POS_ACCOUNT.pos_account_id,
      connected_at: new Date().toISOString(),
    };
    saveDemoState();
    return { success: true };
  },
  "/pos/disconnect": (b, s) => {
    getLocation(s, str(b, "location_id")).pos = null;
    saveDemoState();
    return { success: true };
  },
  "/pos/insights": (b, s) => gen.posInsights(locationDevicesFromBody(b, s)),
  "/pos/transactions": (b, s) =>
    gen.posTransactions(locationDevicesFromBody(b, s), str(b, "start_date"), str(b, "end_date")),
};

/** Resolve an endpoint against the demo store after a short, realistic delay. */
export async function demoRequest<T>(endpoint: string, body: unknown): Promise<T> {
  await delay();
  const handler = handlers[endpoint];
  if (!handler) throw new Error(`Demo mode has no handler for ${endpoint}`);
  const parsed: Body =
    typeof body === "string" ? (JSON.parse(body) as Body) : body && typeof body === "object" ? (body as Body) : {};
  return handler(parsed, getDemoState()) as T;
}

/** CSV export stand-in: today's hourly data for one counter. */
export async function demoExportCsv(deviceId: string): Promise<Blob> {
  await delay();
  const state = getDemoState();
  const dev = getOrCreateDevice(state, deviceId);
  const today = gen.todayLocal(dev.tz);
  const { data } = gen.detailedDayRecord([dev], "ent", today);
  const rows = Object.entries(data).map(([label, value]) => `${today},${label},${value}`);
  return new Blob([["Date,Time,Entries", ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
}
