import type {
  CheckPasswordResponse,
  CurrentCountResponse,
  ConnectionStatusResponse,
  OvercrowdingResponse,
  DirectionFlippedResponse,
  AvailableDatesResponse,
  HasDayResponse,
  HasWeekResponse,
  DayDataResponse,
  AverageDayDataResponse,
  WeekDataResponse,
  AverageWeekDataResponse,
  YearDataResponse,
  AverageYearDataResponse,
  EntryDayDataResponse,
  AverageEntryDayDataResponse,
  EntryWeekDataResponse,
  AverageEntryWeekDataResponse,
  EntryYearDataResponse,
  AverageEntryYearDataResponse,
  LocationResponse,
  CreateLocationResponse,
  LocationsForDeviceResponse,
  ClosingTime,
  ClosingTimeDay,
  SigningCredentials,
  StoredLocation,
  DeviceState,
  LocationCredentials,
} from "./types";
import { signRequest, generateIdempotencyKey } from "./crypto";
import {
  checkRateLimit,
  recordFailure,
  recordSuccess,
} from "./rateLimiter";
import { logSecurityEvent } from "./securityAudit";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    try {
      const testing = localStorage.getItem("crowdcount_testing");
      if (testing === "true") {
        return "https://api-staging.crowdcount.tech";
      }
    } catch {}
  }
  return "https://api.crowdcount.tech";
}

export type { SigningCredentials };

interface ApiRequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  sign?: SigningCredentials;
  idempotent?: boolean;
}

async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  // Enforce client-side rate limit / backoff
  const rateCheck = checkRateLimit(endpoint);
  if (!rateCheck.allowed) {
    logSecurityEvent("RATE_LIMITED", {
      endpoint,
      retryAfterMs: rateCheck.retryAfterMs,
    });
    throw new Error(
      `Rate limited. Retry after ${Math.ceil(rateCheck.retryAfterMs / 1000)}s`
    );
  }

  const { sign, idempotent, headers: extraHeaders, ...fetchOptions } = options;
  const method = fetchOptions.method || "GET";
  const bodyStr = (fetchOptions.body as string) || "";

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  // Sign request if credentials provided
  if (sign) {
    const sigHeaders = await signRequest(
      sign.deviceId,
      sign.password,
      method,
      endpoint,
      bodyStr
    );
    Object.assign(headers, sigHeaders);
  }

  // Add idempotency key for mutating requests
  if (idempotent) {
    headers["Idempotency-Key"] = generateIdempotencyKey();
  }

  const url = `${getApiBaseUrl()}${endpoint}`;
  const response = await fetch(url, {
    method,
    body: fetchOptions.body,
    headers,
  });

  if (!response.ok) {
    // Track auth and rate-limit failures for backoff
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 429
    ) {
      recordFailure(endpoint);
      logSecurityEvent("AUTH_FAILURE", {
        endpoint,
        status: response.status,
      });
    }
    throw new Error(`API request failed: ${response.status}`);
  }

  recordSuccess(endpoint);
  return response.json();
}

// Health check — lightweight ping to verify server availability
export async function pingServer(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/ping`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Authentication
export async function checkPassword(
  deviceId: string,
  password: string
): Promise<boolean> {
  const response = await apiRequest<CheckPasswordResponse>("/check_password", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, password }),
    sign: { deviceId, password },
  });
  return response.is_password_correct;
}

// Count operations
export async function getCurrentCount(
  deviceId: string,
  password: string
): Promise<number> {
  const response = await apiRequest<CurrentCountResponse>("/currentcount", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, password }),
    sign: { deviceId, password },
  });
  return response.current_count;
}

export async function setCount(
  deviceId: string,
  password: string,
  newCount: number
): Promise<void> {
  await apiRequest("/setcount", {
    method: "POST",
    body: JSON.stringify({
      device_id: deviceId,
      password,
      new_count: newCount,
    }),
    sign: { deviceId, password },
    idempotent: true,
  });
}

export async function addToCount(
  deviceId: string,
  password: string,
  delta: number
): Promise<number> {
  const response = await apiRequest<{ new_count: number }>("/add_to_count", {
    method: "POST",
    body: JSON.stringify({
      device_id: deviceId,
      password,
      count_to_add: delta,
    }),
    sign: { deviceId, password },
    idempotent: true,
  });
  return response.new_count;
}

export async function subFromCount(
  deviceId: string,
  password: string,
  delta: number
): Promise<number> {
  const response = await apiRequest<{ new_count: number }>("/sub_from_count", {
    method: "POST",
    body: JSON.stringify({
      device_id: deviceId,
      password,
      count_to_sub: delta,
    }),
    sign: { deviceId, password },
    idempotent: true,
  });
  return response.new_count;
}

// Connection status
export async function getConnectionStatus(
  deviceId: string,
  password: string
): Promise<"online" | "offline" | "does_not_exist"> {
  const response = await apiRequest<ConnectionStatusResponse>(
    "/connection_status",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password }),
      sign: { deviceId, password },
    }
  );
  return response.status;
}

// Overcrowding
export async function getOvercrowding(
  deviceId: string,
  password: string
): Promise<number | null> {
  try {
    const response = await apiRequest<OvercrowdingResponse>(
      "/get_overcrowding",
      {
        method: "POST",
        body: JSON.stringify({ device_name: deviceId, password }),
        sign: { deviceId, password },
      }
    );
    return response.overcrowding;
  } catch {
    return null;
  }
}

export async function addOvercrowding(
  deviceId: string,
  password: string,
  limit: number
): Promise<void> {
  await apiRequest("/add_overcrowding", {
    method: "POST",
    body: JSON.stringify({
      device_name: deviceId,
      password,
      overcrowding_value: limit,
    }),
    sign: { deviceId, password },
    idempotent: true,
  });
}

export async function removeOvercrowding(
  deviceId: string,
  password: string
): Promise<void> {
  await apiRequest("/remove_overcrowding", {
    method: "POST",
    body: JSON.stringify({
      device_name: deviceId,
      password,
    }),
    sign: { deviceId, password },
    idempotent: true,
  });
}

// Direction
export async function getDirectionFlipped(
  deviceId: string,
  password: string
): Promise<boolean> {
  const response = await apiRequest<DirectionFlippedResponse>(
    "/get_direction_flipped",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password }),
      sign: { deviceId, password },
    }
  );
  return response.direction_flipped;
}

export async function setDirectionFlipped(
  deviceId: string,
  password: string,
  flipped: boolean
): Promise<void> {
  await apiRequest("/set_direction_flipped", {
    method: "POST",
    body: JSON.stringify({
      device_id: deviceId,
      password,
      direction_flipped: flipped,
    }),
    sign: { deviceId, password },
    idempotent: true,
  });
}

// Password
export async function setPassword(
  deviceId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await apiRequest("/set_password", {
    method: "POST",
    body: JSON.stringify({
      device_id: deviceId,
      current_password: currentPassword,
      new_password: newPassword,
    }),
    sign: { deviceId, password: currentPassword },
    idempotent: true,
  });
}

// Reset
export async function resetDeviceData(
  deviceId: string,
  password: string,
  date?: string
): Promise<void> {
  const body: Record<string, string> = { device_id: deviceId, password };
  if (date) {
    body.date = date;
  }
  await apiRequest("/reset_device_data", {
    method: "POST",
    body: JSON.stringify(body),
    sign: { deviceId, password },
    idempotent: true,
  });
}

// History - Available dates
export async function getAvailableDates(
  deviceId: string,
  password: string
): Promise<string[]> {
  const response = await apiRequest<AvailableDatesResponse>("/get_user_days", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, password }),
    sign: { deviceId, password },
  });
  return response.dates;
}

export async function checkIfUserHasDay(
  deviceId: string,
  password: string,
  date: string
): Promise<boolean> {
  const response = await apiRequest<HasDayResponse>("/check_if_user_has_day", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, password, date }),
    sign: { deviceId, password },
  });
  return response.has_day;
}

// Day data
export async function getDayData(
  deviceId: string,
  password: string,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<DayDataResponse>("/get_day_data", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, password, date }),
    sign: { deviceId, password },
  });
  return response.day_data;
}

export async function getAverageDayData(
  deviceId: string,
  password: string,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<AverageDayDataResponse>(
    "/get_average_day_data",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, date }),
      sign: { deviceId, password },
    }
  );
  return response.average_day_data;
}

// Week data
export async function checkIfUserHasWeek(
  deviceId: string,
  password: string,
  date: string
): Promise<boolean> {
  const response = await apiRequest<HasWeekResponse>(
    "/check_if_user_has_week",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, date }),
      sign: { deviceId, password },
    }
  );
  return response.has_week;
}

export async function getWeekData(
  deviceId: string,
  password: string,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<WeekDataResponse>("/get_week_data", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, password, date }),
    sign: { deviceId, password },
  });
  return response.week_data;
}

export async function getAverageWeekData(
  deviceId: string,
  password: string,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<AverageWeekDataResponse>(
    "/get_average_week_data",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, date }),
      sign: { deviceId, password },
    }
  );
  return response.average_week_data;
}

// Year data
export async function getYearData(
  deviceId: string,
  password: string,
  year: number
): Promise<Record<string, number>> {
  const response = await apiRequest<YearDataResponse>("/get_year_data", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, password, year }),
    sign: { deviceId, password },
  });
  return response.year_data;
}

export async function getAverageYearData(
  deviceId: string,
  password: string,
  year: number
): Promise<Record<string, number> | null> {
  const response = await apiRequest<AverageYearDataResponse>(
    "/get_average_year_data",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, year }),
      sign: { deviceId, password },
    }
  );
  if (typeof response.average_year_data === "string") {
    return null;
  }
  return response.average_year_data;
}

// Entry data
export async function getEntryDayData(
  deviceId: string,
  password: string,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<EntryDayDataResponse>(
    "/get_entry_day_data",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, date }),
      sign: { deviceId, password },
    }
  );
  return response.entry_day_data;
}

export async function getAverageEntryDayData(
  deviceId: string,
  password: string,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<AverageEntryDayDataResponse>(
    "/get_average_entry_day_data",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, date }),
      sign: { deviceId, password },
    }
  );
  return response.average_entry_day_data;
}

export async function getEntryWeekData(
  deviceId: string,
  password: string,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<EntryWeekDataResponse>(
    "/get_entry_week_data",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, date }),
      sign: { deviceId, password },
    }
  );
  return response.entry_week_data;
}

export async function getAverageEntryWeekData(
  deviceId: string,
  password: string,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<AverageEntryWeekDataResponse>(
    "/get_average_entry_week_data",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, date }),
      sign: { deviceId, password },
    }
  );
  return response.average_entry_week_data;
}

export async function getEntryYearData(
  deviceId: string,
  password: string,
  year: number
): Promise<Record<string, number>> {
  const response = await apiRequest<EntryYearDataResponse>(
    "/get_entry_year_data",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, year }),
      sign: { deviceId, password },
    }
  );
  return response.entry_year_data;
}

export async function getAverageEntryYearData(
  deviceId: string,
  password: string,
  year: number
): Promise<Record<string, number> | null> {
  const response = await apiRequest<AverageEntryYearDataResponse>(
    "/get_average_entry_year_data",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password, year }),
      sign: { deviceId, password },
    }
  );
  if (typeof response.average_entry_year_data === "string") {
    return null;
  }
  return response.average_entry_year_data;
}

// ── Location CRUD ──

export async function createLocation(
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  name?: string,
  overcrowdingLimit?: number | null,
  deviceLabels?: Record<string, string>
): Promise<string> {
  const body: Record<string, unknown> = {
    credentials,
  };
  if (name) body.name = name;
  if (overcrowdingLimit != null && overcrowdingLimit > 0) body.overcrowding_limit = overcrowdingLimit;
  if (deviceLabels) body.device_labels = deviceLabels;
  const response = await apiRequest<CreateLocationResponse>(
    "/create_location",
    {
      method: "POST",
      body: JSON.stringify(body),
      sign: signingDevice,
      idempotent: true,
    }
  );
  return response.location_id;
}

export async function updateLocation(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  updates: { name?: string; overcrowdingLimit?: number | null }
): Promise<void> {
  const body: Record<string, unknown> = {
    location_id: locationId,
    credentials,
  };
  if (updates.name !== undefined) body.name = updates.name;
  if (updates.overcrowdingLimit !== undefined) {
    body.overcrowding_limit = updates.overcrowdingLimit === null || updates.overcrowdingLimit <= 0
      ? null
      : updates.overcrowdingLimit;
  }
  await apiRequest("/update_location", {
    method: "POST",
    body: JSON.stringify(body),
    sign: signingDevice,
    idempotent: true,
  });
}

export async function deleteLocation(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials
): Promise<void> {
  await apiRequest("/delete_location", {
    method: "POST",
    body: JSON.stringify({
      location_id: locationId,
      credentials,
    }),
    sign: signingDevice,
    idempotent: true,
  });
}

export async function replaceLocation(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  deviceLabels?: Record<string, string>
): Promise<string> {
  const body: Record<string, unknown> = {
    location_id: locationId,
    credentials,
  };
  if (deviceLabels) body.device_labels = deviceLabels;
  const response = await apiRequest<CreateLocationResponse>(
    "/replace_location",
    {
      method: "POST",
      body: JSON.stringify(body),
      sign: signingDevice,
      idempotent: true,
    }
  );
  return response.location_id;
}

export async function getLocationsForDevice(
  deviceId: string,
  password: string
): Promise<LocationResponse[]> {
  const response = await apiRequest<LocationsForDeviceResponse>(
    "/get_locations_for_device",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, password }),
      sign: { deviceId, password },
    }
  );
  return response.locations;
}

export async function getLocation(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials
): Promise<LocationResponse> {
  return apiRequest<LocationResponse>("/get_location", {
    method: "POST",
    body: JSON.stringify({
      location_id: locationId,
      credentials,
    }),
    sign: signingDevice,
  });
}

// ── Location History (data key is "data") ──

export async function getLocationDayData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_day_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, date }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationAverageDayData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_average_day_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, date }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationWeekData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string,
  tzOffsetMinutes?: number
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_week_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, date, tz_offset_minutes: tzOffsetMinutes ?? new Date().getTimezoneOffset() * -1 }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationAverageWeekData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string,
  tzOffsetMinutes?: number
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_average_week_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, date, tz_offset_minutes: tzOffsetMinutes ?? new Date().getTimezoneOffset() * -1 }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationYearData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  year: number
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_year_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, year }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationAverageYearData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  year: number
): Promise<Record<string, number> | null> {
  const response = await apiRequest<{ data: Record<string, number> | string }>(
    "/get_location_average_year_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, year }),
      sign: signingDevice,
    }
  );
  if (typeof response.data === "string") return null;
  return response.data;
}

// Location entry data
export async function getLocationEntryDayData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_entry_day_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, date }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationAverageEntryDayData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_average_entry_day_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, date }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationEntryWeekData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string,
  tzOffsetMinutes?: number
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_entry_week_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, date, tz_offset_minutes: tzOffsetMinutes ?? new Date().getTimezoneOffset() * -1 }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationAverageEntryWeekData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string,
  tzOffsetMinutes?: number
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_average_entry_week_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, date, tz_offset_minutes: tzOffsetMinutes ?? new Date().getTimezoneOffset() * -1 }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationEntryYearData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  year: number
): Promise<Record<string, number>> {
  const response = await apiRequest<{ data: Record<string, number> }>(
    "/get_location_entry_year_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, year }),
      sign: signingDevice,
    }
  );
  return response.data;
}

export async function getLocationAverageEntryYearData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  year: number
): Promise<Record<string, number> | null> {
  const response = await apiRequest<{ data: Record<string, number> | string }>(
    "/get_location_average_entry_year_data",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials, year }),
      sign: signingDevice,
    }
  );
  if (typeof response.data === "string") return null;
  return response.data;
}

// ── Location Bundle Endpoints ──

export interface InsightsBundleResponse {
  day_view: Record<string, number>;
  average_day_view: Record<string, number>;
  entry_day_view: Record<string, number>;
  average_entry_day_view: Record<string, number>;
  day_view_2?: Record<string, number>;
  average_day_view_2?: Record<string, number>;
  entry_day_view_2?: Record<string, number>;
  average_entry_day_view_2?: Record<string, number>;
  week_view: Record<string, number>;
  average_week_view: Record<string, number>;
  entry_week_view: Record<string, number>;
  average_entry_week_view: Record<string, number>;
  year_view: Record<string, number>;
  average_year_view: Record<string, number> | null;
  entry_year_view: Record<string, number>;
  average_entry_year_view: Record<string, number> | null;
  dwell_time_view?: number | Record<string, never>;
}

export interface HistoryBundleResponse {
  day_view: Record<string, number>;
  average_day_view: Record<string, number>;
  day_view_2?: Record<string, number>;
  average_day_view_2?: Record<string, number>;
  week_view: Record<string, number>;
  average_week_view: Record<string, number>;
  year_view: Record<string, number>;
  average_year_view: Record<string, number> | null;
}

export async function getLocationInsightsBundle(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string,
  date2: string | null,
  weekDate: string,
  year: number,
  tzOffsetMinutes?: number
): Promise<InsightsBundleResponse> {
  const body: Record<string, unknown> = {
    location_id: locationId,
    credentials,
    date,
    week_date: weekDate,
    year,
    tz_offset_minutes: tzOffsetMinutes ?? new Date().getTimezoneOffset() * -1,
  };
  if (date2) body.date2 = date2;
  return apiRequest<InsightsBundleResponse>("/get_location_insights_bundle", {
    method: "POST",
    body: JSON.stringify(body),
    sign: signingDevice,
  });
}

export async function getLocationHistoryBundle(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string,
  date2: string | null,
  weekDate: string,
  year: number,
  dataType: "count" | "entries",
  tzOffsetMinutes?: number
): Promise<HistoryBundleResponse> {
  const body: Record<string, unknown> = {
    location_id: locationId,
    credentials,
    date,
    week_date: weekDate,
    year,
    data_type: dataType,
    tz_offset_minutes: tzOffsetMinutes ?? new Date().getTimezoneOffset() * -1,
  };
  if (date2) body.date2 = date2;
  return apiRequest<HistoryBundleResponse>("/get_location_history_bundle", {
    method: "POST",
    body: JSON.stringify(body),
    sign: signingDevice,
  });
}

// Detailed 15-minute interval day data (for CSV downloads)
export interface DayDataDetailedResponse {
  data: Record<string, number>;
  average: Record<string, number>;
}

export async function getLocationDayDataDetailed(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  date: string,
  dataType: "count" | "entries",
  tzOffsetMinutes?: number
): Promise<DayDataDetailedResponse> {
  return apiRequest<DayDataDetailedResponse>("/get_location_day_data_detailed", {
    method: "POST",
    body: JSON.stringify({
      location_id: locationId,
      credentials,
      date,
      data_type: dataType,
      tz_offset_minutes: tzOffsetMinutes ?? new Date().getTimezoneOffset() * -1,
    }),
    sign: signingDevice,
  });
}

// Location available dates
export async function getLocationAvailableDates(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials
): Promise<string[]> {
  const response = await apiRequest<AvailableDatesResponse>(
    "/get_location_available_dates",
    {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials }),
      sign: signingDevice,
    }
  );
  return response.dates;
}

// ── Closing Time ──

export async function getClosingTime(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials
): Promise<ClosingTime | null> {
  try {
    const response = await apiRequest<ClosingTime | { closing_time: null }>("/get_closing_time", {
      method: "POST",
      body: JSON.stringify({ location_id: locationId, credentials }),
      sign: signingDevice,
    });
    if ("closing_time" in response) return null;
    return response;
  } catch {
    return null;
  }
}

export async function setClosingTime(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  timezone: string,
  days: ClosingTimeDay[]
): Promise<ClosingTime> {
  return apiRequest<ClosingTime>("/set_closing_time", {
    method: "POST",
    body: JSON.stringify({
      location_id: locationId,
      credentials,
      timezone,
      days,
    }),
    sign: signingDevice,
    idempotent: true,
  });
}

export async function deleteClosingTime(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials
): Promise<void> {
  await apiRequest("/delete_closing_time", {
    method: "POST",
    body: JSON.stringify({ location_id: locationId, credentials }),
    sign: signingDevice,
    idempotent: true,
  });
}

// ── Reset Location Data ──

export async function resetLocationData(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials
): Promise<void> {
  await apiRequest("/reset_location_data", {
    method: "POST",
    body: JSON.stringify({ location_id: locationId, credentials }),
    sign: signingDevice,
    idempotent: true,
  });
}

// ── Location Count ──

export async function locationAddToCount(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  delta: number
): Promise<number> {
  const response = await apiRequest<{ new_count: number }>("/location/add_to_count", {
    method: "POST",
    body: JSON.stringify({ location_id: locationId, credentials, count_to_add: delta }),
    sign: signingDevice,
    idempotent: true,
  });
  return response.new_count;
}

export async function locationSubFromCount(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: SigningCredentials,
  delta: number
): Promise<number> {
  const response = await apiRequest<{ new_count: number }>("/location/sub_from_count", {
    method: "POST",
    body: JSON.stringify({ location_id: locationId, credentials, count_to_sub: delta }),
    sign: signingDevice,
    idempotent: true,
  });
  return response.new_count;
}

// ── Credentials Helper ──

export function getLocationCredentials(
  location: StoredLocation,
  devices: DeviceState[]
): LocationCredentials | null {
  const creds: Array<{ device_id: string; password: string }> = [];
  for (const serverDeviceId of location.deviceIds) {
    const device = devices.find((d) => d.deviceId === serverDeviceId);
    if (device) {
      creds.push({ device_id: device.deviceId, password: device.password });
    }
  }
  if (creds.length === 0) return null;
  return {
    credentials: creds,
    signingDevice: { deviceId: creds[0].device_id, password: creds[0].password },
  };
}

// Alerts
export interface AlertInfo {
  type: string;
  title: string;
  body: string;
  alertId: string;
}

export async function checkIfAlert(): Promise<boolean> {
  try {
    const response = await apiRequest<{ is_alert: boolean }>("/check_if_alert", {
      headers: { "X-Client-Type": "web" },
    });
    return response.is_alert;
  } catch {
    return false;
  }
}

export async function getActiveAlert(): Promise<AlertInfo | null> {
  try {
    const response = await apiRequest<{
      alert_info: { alert_type: string; title: string; body: string; alert_id: string }[];
    }>("/get_active_alert", {
      headers: { "X-Client-Type": "web" },
    });
    const alert = response.alert_info?.[0];
    if (!alert) return null;
    return {
      type: alert.alert_type,
      title: alert.title,
      body: alert.body,
      alertId: alert.alert_id,
    };
  } catch {
    return null;
  }
}

// CSV Export
export async function exportCsv(
  deviceId: string,
  password: string,
  date?: string
): Promise<Blob> {
  const bodyObj = {
    device_id: deviceId,
    password,
    ...(date && { date }),
  };
  const bodyStr = JSON.stringify(bodyObj);
  const sigHeaders = await signRequest(
    deviceId,
    password,
    "POST",
    "/export_csv",
    bodyStr
  );

  const response = await fetch(`${getApiBaseUrl()}/export_csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...sigHeaders,
    },
    body: bodyStr,
  });

  if (!response.ok) {
    throw new Error("Failed to export CSV");
  }

  return response.blob();
}
