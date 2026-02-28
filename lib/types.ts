// Device stored locally in the app
export interface StoredDevice {
  id: string; // UUID for local storage
  deviceId: string; // Device ID from server (e.g., "T1234")
  password: string;
  name?: string; // Custom friendly name
}

// Device state with live data
export interface DeviceState extends StoredDevice {
  isOnline: boolean;
  lastUpdated: Date | null;
}

// API Response types
export interface CheckPasswordResponse {
  is_password_correct: boolean;
}

export interface CurrentCountResponse {
  current_count: number;
}

export interface ConnectionStatusResponse {
  status: "online" | "offline" | "does_not_exist";
}

export interface OvercrowdingResponse {
  overcrowding: number | null;
}

export interface DirectionFlippedResponse {
  direction_flipped: boolean;
}

export interface AvailableDatesResponse {
  dates: string[];
}

export interface HasDayResponse {
  has_day: boolean;
}

export interface HasWeekResponse {
  has_week: boolean;
}

export interface DayDataResponse {
  day_data: Record<string, number>;
}

export interface AverageDayDataResponse {
  average_day_data: Record<string, number>;
}

export interface WeekDataResponse {
  week_data: Record<string, number>;
}

export interface AverageWeekDataResponse {
  average_week_data: Record<string, number>;
}

export interface YearDataResponse {
  year_data: Record<string, number>;
}

export interface AverageYearDataResponse {
  average_year_data: Record<string, number> | string;
}

// Chart data types
export interface ChartDataPoint {
  label: string;
  value: number;
  average?: number;
}

// Location types
export interface StoredLocation {
  id: string;              // Server location_id (UUID from server)
  localId: string;         // Stable client-side UUID — never changes, used as React key
  name: string;
  deviceIds: string[];     // Server device IDs ("T1234"), NOT local UUIDs
  overcrowdingLimit: number | null;
  colorName: string;
  isAuto: boolean;         // auto-created 1:1 location on server
  isOnMap: boolean;        // visible on public map
  serverColor: string | null; // color from server (for on-map locations)
  latitude: number | null;
  longitude: number | null;
}

export interface LocationState extends StoredLocation {
  totalCount: number | null; // null = not yet fetched
  isOverLimit: boolean;
  allDevicesOnline: boolean;
  someDevicesOnline: boolean;
  serverDeviceCount: number | null; // total devices server knows about (null = not yet fetched)
}

// API response for location endpoints
export interface LocationResponse {
  location_id: string;
  location_name: string | null;
  location_color: string | null;
  devices: Array<{ device_id: string; label: string; current_count: number }>;
  overcrowding_limit: number | null;
  current_count: number;
  on_map: boolean;
  is_auto?: boolean;
  location_latitude?: number | null;
  location_longitude?: number | null;
}

// Reset schedule
export interface ResetSchedule {
  location_id: string;
  reset_hour: number;
  reset_minute: number;
  timezone: string;
}

// Closing time schedule
export interface ClosingTimeDay {
  day_of_week: number;
  close_hour: number;
  close_minute: number;
  open_hour: number;
  open_minute: number;
}

export interface ClosingTime {
  id: string;
  location_id: string;
  timezone: string;
  days: ClosingTimeDay[];
}

// Credentials for a location's devices
export interface LocationCredentials {
  credentials: Array<{ device_id: string; password: string }>;
  signingDevice: SigningCredentials;
}

export interface SigningCredentials {
  deviceId: string;
  password: string;
}

export const LOCATION_COLORS = [
  { name: "red", value: "#ef4444" },
  { name: "orange", value: "#f97316" },
  { name: "yellow", value: "#eab308" },
  { name: "green", value: "#22c55e" },
  { name: "blue", value: "#3b82f6" },
  { name: "purple", value: "#a855f7" },
] as const;

export type LocationColorName = (typeof LOCATION_COLORS)[number]["name"];

// Apple system colors for on-map location dots (light/dark variants)
const APPLE_COLORS: Record<string, { light: string; dark: string }> = {
  red:    { light: "#FF383C", dark: "#FF4245" },
  orange: { light: "#FF8D28", dark: "#FF9230" },
  yellow: { light: "#FFCC00", dark: "#FFD600" },
  green:  { light: "#34C759", dark: "#30D158" },
  mint:   { light: "#00C8B3", dark: "#00DAC3" },
  teal:   { light: "#00C3D0", dark: "#00D2E0" },
  cyan:   { light: "#00C0E8", dark: "#3CD3FE" },
  blue:   { light: "#0088FF", dark: "#0091FF" },
  indigo: { light: "#6155F5", dark: "#6D7CFF" },
  purple: { light: "#CB30E0", dark: "#DB34F2" },
  pink:   { light: "#FF2D55", dark: "#FF375F" },
  brown:  { light: "#AC7F5E", dark: "#B78A66" },
};

export function getAppleColorHex(name: string, theme: "light" | "dark"): string {
  const color = APPLE_COLORS[name];
  if (!color) return theme === "dark" ? "#0091FF" : "#0088FF";
  return theme === "dark" ? color.dark : color.light;
}

// Location API response types
export interface CreateLocationResponse {
  location_id: string;
}

export interface LocationsForDeviceResponse {
  locations: LocationResponse[];
}

// Entry data response types
export interface EntryDayDataResponse {
  entry_day_data: Record<string, number>;
}

export interface AverageEntryDayDataResponse {
  average_entry_day_data: Record<string, number>;
}

export interface EntryWeekDataResponse {
  entry_week_data: Record<string, number>;
}

export interface AverageEntryWeekDataResponse {
  average_entry_week_data: Record<string, number>;
}

export interface EntryYearDataResponse {
  entry_year_data: Record<string, number>;
}

export interface AverageEntryYearDataResponse {
  average_entry_year_data: Record<string, number> | string;
}
