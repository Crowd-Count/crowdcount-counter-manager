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
  OvercrowdingGroupResponse,
  CreateGroupResponse,
  GroupIdsResponse,
  EntryDayDataResponse,
  AverageEntryDayDataResponse,
  EntryWeekDataResponse,
  AverageEntryWeekDataResponse,
  EntryYearDataResponse,
  AverageEntryYearDataResponse,
} from "./types";
import { signRequest, generateIdempotencyKey } from "./crypto";

const API_BASE_URL = "https://api.crowdcount.tech";

interface SigningCredentials {
  deviceId: string;
  password: string;
}

interface ApiRequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  sign?: SigningCredentials;
  idempotent?: boolean;
}

async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
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

  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method,
    body: fetchOptions.body,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
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
export async function getCurrentCount(deviceId: string): Promise<number> {
  const response = await apiRequest<CurrentCountResponse>("/currentcount", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId }),
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
  deviceId: string
): Promise<"online" | "offline" | "does_not_exist"> {
  const response = await apiRequest<ConnectionStatusResponse>(
    "/connection_status",
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId }),
    }
  );
  return response.status;
}

// Overcrowding
export async function getOvercrowding(
  deviceId: string
): Promise<number | null> {
  try {
    const response = await apiRequest<OvercrowdingResponse>(
      `/get_overcrowding?device_name=${deviceId}`
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

// Overcrowding Groups — commented out: the counter-manager should NOT create/modify
// server-side overcrowding groups. Groups should be managed from the iOS app which
// handles push notification subscriptions. Creating groups here would interfere with
// iOS-created groups and has no utility since web can't receive push notifications.
//
// export async function createOvercrowdingGroup(
//   deviceIds: string[],
//   limit: number,
//   groupName?: string
// ): Promise<string> {
//   const body: Record<string, unknown> = { device_ids: deviceIds, limit };
//   if (groupName) body.group_name = groupName;
//   const response = await apiRequest<CreateGroupResponse>(
//     "/create_overcrowding_group",
//     { method: "POST", body: JSON.stringify(body) }
//   );
//   return response.group_id;
// }
//
// export async function updateOvercrowdingGroup(
//   groupId: string, deviceIds?: string[], limit?: number
// ): Promise<void> {
//   const body: Record<string, unknown> = { group_id: groupId };
//   if (deviceIds !== undefined) body.device_ids = deviceIds;
//   if (limit !== undefined) body.limit = limit;
//   await apiRequest("/update_overcrowding_group", {
//     method: "POST", body: JSON.stringify(body),
//   });
// }
//
// export async function deleteOvercrowdingGroup(groupId: string): Promise<void> {
//   await apiRequest("/delete_overcrowding_group", {
//     method: "POST", body: JSON.stringify({ group_id: groupId }),
//   });
// }
//
// export async function getOvercrowdingGroup(
//   groupId: string
// ): Promise<OvercrowdingGroupResponse> {
//   return apiRequest<OvercrowdingGroupResponse>(
//     `/get_overcrowding_group?group_id=${groupId}`
//   );
// }
//
// export async function getGroupIdsForDevice(
//   deviceId: string
// ): Promise<string[]> {
//   const response = await apiRequest<GroupIdsResponse>(
//     `/get_groups_for_device?device_id=${deviceId}`
//   );
//   return response.group_ids;
// }

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

  const response = await fetch(`${API_BASE_URL}/export_csv`, {
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
