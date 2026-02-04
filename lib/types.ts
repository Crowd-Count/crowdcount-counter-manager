// Device stored locally in the app
export interface StoredDevice {
  id: string; // UUID for local storage
  deviceId: string; // Device ID from server (e.g., "T1234")
  password: string;
  name?: string; // Custom friendly name
  pollInterval: number; // Refresh interval in seconds (default: 5)
}

// Device state with live data
export interface DeviceState extends StoredDevice {
  currentCount: number;
  overcrowdingLimit: number | null;
  isOnline: boolean;
  directionFlipped: boolean;
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

// Settings types
export type PollInterval = 1 | 3 | 5 | 10 | 15 | 30 | 45 | 60;

export const POLL_INTERVALS: PollInterval[] = [1, 3, 5, 10, 15, 30, 45, 60];

// Location types
export interface StoredLocation {
  id: string;
  name: string;
  deviceIds: string[]; // Local UUIDs (StoredDevice.id), not server device IDs
  overcrowdingLimit: number | null;
  colorName: string;
  overcrowdingGroupId: string | null;
}

export interface LocationState extends StoredLocation {
  totalCount: number;
  isOverLimit: boolean;
  allDevicesOnline: boolean;
  someDevicesOnline: boolean;
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

// Overcrowding group API types
export interface OvercrowdingGroupResponse {
  group_id: string;
  group_name?: string;
  device_ids: string[];
  limit: number;
  current_total: number;
}

export interface CreateGroupResponse {
  group_id: string;
}

export interface GroupIdsResponse {
  group_ids: string[];
}
