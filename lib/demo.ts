/**
 * Demo mode — lets visitors click around the real product with a seeded,
 * in-memory fleet and no backend.
 *
 * Detection, in order: an in-memory flag, a `crowdcount_demo` sessionStorage
 * flag, a `demo=1` cookie, or `?demo=1` on the URL. /demo (a server route)
 * sets the cookie and redirects to /dashboard?demo=1, so the demo starts even
 * where the cookie is refused — a third-party iframe with cookies blocked, or
 * a browser that drops storage in that context. Whichever signal arrives
 * first latches the in-memory flag, which then carries the session across
 * client-side navigation. Nothing is written to localStorage: the contexts
 * read/write the demo store instead of encrypted storage.
 *
 * The mutable "server" state (counts, POS links, closing times, ...) lives in
 * sessionStorage so edits survive reloads and vanish with the tab or on exit.
 */

import type { ClosingTime, POSProvider, StoredDevice, StoredLocation } from "./types";

const COOKIE_NAME = "demo";
const SESSION_FLAG_KEY = "crowdcount_demo";
const STATE_KEY = "crowdcount_demo_state";
const COOKIE_MAX_AGE = 12 * 60 * 60; // seconds

/** Timezone of the on-map counter (pinned by its coordinates via tz-lookup) */
export const DEMO_MAP_TIMEZONE = "America/Denver";

/** The visitor's own timezone — off-map counters follow it so the demo is busy during their day */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// ── Detection ──

/**
 * Latched once any signal is seen. Storage and cookies can both be refused
 * inside an embedded frame; this survives client-side navigation regardless,
 * and resets on a full reload (where a signal is needed again).
 */
let memoryFlag = false;

function hasSessionFlag(): boolean {
  try {
    return sessionStorage.getItem(SESSION_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function hasCookie(): boolean {
  try {
    return document.cookie.split(";").some((c) => c.trim() === `${COOKIE_NAME}=1`);
  } catch {
    return false;
  }
}

function hasUrlFlag(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  } catch {
    return false;
  }
}

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  if (memoryFlag) return true;
  if (!hasSessionFlag() && !hasCookie() && !hasUrlFlag()) return false;
  // Arriving by any route turns the session on and tries to persist it, so a
  // later reload without the query string still lands in the demo.
  memoryFlag = true;
  enableDemoMode();
  return true;
}

function cookieSameSite(): string {
  // The demo is embedded in an <iframe> on another site, so its cookie is
  // third-party: it needs SameSite=None, which requires Secure, plus
  // Partitioned (CHIPS) or browsers that block third-party cookies drop it.
  // Neither attribute is valid on plain http (localhost), hence the fallback;
  // there the sessionStorage flag above carries demo mode on its own.
  return window.location.protocol === "https:"
    ? "SameSite=None; Secure; Partitioned"
    : "SameSite=Lax";
}

export function enableDemoMode(): void {
  memoryFlag = true;
  try {
    sessionStorage.setItem(SESSION_FLAG_KEY, "1");
  } catch {}
  try {
    document.cookie = `${COOKIE_NAME}=1; Path=/; Max-Age=${COOKIE_MAX_AGE}; ${cookieSameSite()}`;
  } catch {}
}

export function disableDemoMode(): void {
  memoryFlag = false;
  state = null;
  try {
    sessionStorage.removeItem(SESSION_FLAG_KEY);
    sessionStorage.removeItem(STATE_KEY);
  } catch {}
  try {
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; ${cookieSameSite()}`;
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {}
}

// ── Demo "server" state ──

export interface DemoServerDevice {
  device_id: string;
  password: string;
  label: string;
  direction_flipped: boolean;
  count: number;
  /** IANA zone the counter's daily curve is drawn in */
  tz: string;
  /** Peak hourly occupancy / peak hourly entries this counter contributes */
  occPeak: number;
  entPeak: number;
  /** Overnight share of peak (0 = empty at night, e.g. a shop that closes) */
  nightFloor: number;
  overcrowding: number | null;
  /** History before this local date reads as zero (after a reset) */
  resetDate: string | null;
}

export interface DemoPOSLink {
  provider: POSProvider;
  pos_location_id: string;
  pos_location_name: string;
  merchant_id: string;
  pos_account_id: string;
  connected_at: string;
}

export interface DemoServerLocation {
  location_id: string;
  location_name: string;
  location_color: string | null;
  device_ids: string[];
  overcrowding_limit: number | null;
  on_map: boolean;
  latitude: number | null;
  longitude: number | null;
  closing_time: ClosingTime | null;
  pos: DemoPOSLink | null;
  resetDate: string | null;
}

export interface DemoState {
  version: 1;
  devices: Record<string, DemoServerDevice>;
  locations: Record<string, DemoServerLocation>;
  nextLocationId: number;
  /** What the client contexts would normally keep in encrypted localStorage */
  storedDevices: StoredDevice[];
  storedLocations: StoredLocation[];
  lastTick: number;
}

export const DEMO_POS_ACCOUNT = {
  pos_account_id: "demo-square-account",
  merchant_id: "MLDEMO7Q2K",
  provider: "square" as POSProvider,
};

export const DEMO_POS_STORES = [
  { id: "LDEMO1701WYNKOOP", name: "Union Station Coffee", address: "1701 Wynkoop St, Denver" },
  { id: "LDEMO1300PEARL", name: "Pearl Street Kiosk", address: "1300 Pearl St, Boulder" },
];

function uniformHours(openHour: number, closeHour: number) {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    open_hour: openHour,
    open_minute: 0,
    close_hour: closeHour,
    close_minute: 0,
  }));
}

function seedState(): DemoState {
  const localTz = browserTimezone();

  const devices: DemoServerDevice[] = [
    { device_id: "T4821", password: "demo-4821", label: "Front Door", direction_flipped: false, count: 0, tz: localTz, occPeak: 26, entPeak: 52, nightFloor: 0, overcrowding: null, resetDate: null },
    { device_id: "T4822", password: "demo-4822", label: "Patio Door", direction_flipped: true, count: 0, tz: localTz, occPeak: 19, entPeak: 38, nightFloor: 0, overcrowding: null, resetDate: null },
    { device_id: "T5130", password: "demo-5130", label: "Main Entrance", direction_flipped: false, count: 0, tz: DEMO_MAP_TIMEZONE, occPeak: 88, entPeak: 64, nightFloor: 0.12, overcrowding: null, resetDate: null },
    { device_id: "T6207", password: "demo-6207", label: "North Entrance", direction_flipped: false, count: 0, tz: localTz, occPeak: 17, entPeak: 46, nightFloor: 0.2, overcrowding: null, resetDate: null },
    { device_id: "T6208", password: "demo-6208", label: "South Entrance", direction_flipped: false, count: 0, tz: localTz, occPeak: 13, entPeak: 32, nightFloor: 0.2, overcrowding: null, resetDate: null },
  ];

  const locations: DemoServerLocation[] = [
    {
      location_id: "demo-loc-union-station",
      location_name: "Union Station Coffee",
      location_color: null,
      device_ids: ["T4821", "T4822"],
      overcrowding_limit: 60,
      on_map: false,
      latitude: null,
      longitude: null,
      closing_time: {
        id: "demo-hours-union-station",
        location_id: "demo-loc-union-station",
        timezone: localTz,
        days: uniformHours(6, 22),
      },
      pos: {
        provider: "square",
        pos_location_id: DEMO_POS_STORES[0].id,
        pos_location_name: DEMO_POS_STORES[0].name,
        merchant_id: DEMO_POS_ACCOUNT.merchant_id,
        pos_account_id: DEMO_POS_ACCOUNT.pos_account_id,
        connected_at: "2026-03-14T16:20:00Z",
      },
      resetDate: null,
    },
    {
      location_id: "demo-loc-boulder-gym",
      location_name: "Boulder Climbing Gym",
      location_color: null,
      device_ids: ["T5130"],
      overcrowding_limit: 120,
      on_map: true,
      latitude: 40.0176,
      longitude: -105.2797,
      closing_time: null, // 24-hour gym
      pos: null,
      resetDate: null,
    },
    {
      location_id: "demo-loc-aspen-lodge",
      location_name: "Aspen Ski Lodge",
      location_color: null,
      device_ids: ["T6207", "T6208"],
      overcrowding_limit: 25,
      on_map: false,
      latitude: null,
      longitude: null,
      closing_time: null,
      pos: null,
      resetDate: null,
    },
  ];

  const colorByLocation: Record<string, string> = {
    "demo-loc-union-station": "orange",
    "demo-loc-boulder-gym": "green",
    "demo-loc-aspen-lodge": "blue",
  };

  const storedDevices: StoredDevice[] = devices.map((d) => ({
    id: `demo-device-${d.device_id.toLowerCase()}`,
    deviceId: d.device_id,
    password: d.password,
    name: d.label,
  }));

  const storedLocations: StoredLocation[] = locations.map((l, i) => ({
    id: l.location_id,
    localId: `demo-local-${i + 1}`,
    name: l.location_name,
    deviceIds: [...l.device_ids],
    overcrowdingLimit: l.overcrowding_limit,
    colorName: colorByLocation[l.location_id],
    isAuto: false,
    isOnMap: l.on_map,
    serverColor: l.location_color,
    latitude: l.latitude,
    longitude: l.longitude,
  }));

  return {
    version: 1,
    devices: Object.fromEntries(devices.map((d) => [d.device_id, d])),
    locations: Object.fromEntries(locations.map((l) => [l.location_id, l])),
    nextLocationId: 1,
    storedDevices,
    storedLocations,
    lastTick: 0,
  };
}

let state: DemoState | null = null;

function loadPersisted(): DemoState | null {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    return parsed && parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** Current demo state; seeds fixtures on first use if nothing is persisted. */
export function getDemoState(): DemoState {
  if (state) return state;
  state = loadPersisted() ?? seedState();
  return state;
}

export function saveDemoState(): void {
  if (!state) return;
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — state stays in memory for this page only.
  }
}

/** Reset to the seeded fleet (called when entering /demo). */
export function seedDemoState(): DemoState {
  state = seedState();
  saveDemoState();
  return state;
}

// ── Storage shims used by the contexts while demo is on ──

export function demoLoadStoredDevices(): StoredDevice[] {
  return getDemoState().storedDevices.map((d) => ({ ...d }));
}

export function demoSaveStoredDevices(devices: StoredDevice[]): void {
  getDemoState().storedDevices = devices.map((d) => ({ ...d }));
  saveDemoState();
}

export function demoLoadStoredLocations(): StoredLocation[] {
  return getDemoState().storedLocations.map((l) => ({ ...l, deviceIds: [...l.deviceIds] }));
}

export function demoSaveStoredLocations(locations: StoredLocation[]): void {
  getDemoState().storedLocations = locations.map((l) => ({ ...l, deviceIds: [...l.deviceIds] }));
  saveDemoState();
}
