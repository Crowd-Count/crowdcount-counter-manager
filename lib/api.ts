import type {
  CheckPasswordResponse,
  CurrentCountResponse,
  ConnectionStatusResponse,
  OvercrowdingExistsResponse,
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
} from "./types";

const API_BASE_URL = "https://api.crowdcount.tech";

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
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
  });
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
export async function checkOvercrowdingExists(
  deviceId: string
): Promise<boolean> {
  const response = await apiRequest<OvercrowdingExistsResponse>(
    `/check_if_overcrowding_exists?device_name=${deviceId}`
  );
  return response.overcrowding_exists;
}

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
    }
  );
  if (typeof response.average_year_data === "string") {
    return null;
  }
  return response.average_year_data;
}

// CSV Export
export async function exportCsv(
  deviceId: string,
  password: string,
  date?: string
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export_csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      device_id: deviceId,
      password,
      ...(date && { date }),
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to export CSV");
  }

  return response.blob();
}
