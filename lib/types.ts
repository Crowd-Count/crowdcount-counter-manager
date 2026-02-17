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
