import * as api from "@/lib/api";
import type { SigningCredentials } from "@/lib/api";
import {
  getLocalDayUTCBounds,
  shiftDayDataToLocal,
  formatLocalDate,
  getLocalDayOfWeekIndex,
  isDateInCurrentLocalWeek,
  utcDatesToLocalDates,
} from "@/lib/timezone";
import { getOrFetch, forceRefresh } from "@/lib/apiCache";

// ── Types ──

export interface DeviceCredentials {
  deviceId: string;
  password: string;
}

export interface LocationFetchParams {
  locationId: string;
  credentials: Array<{ device_id: string; password: string }>;
  signingDevice: SigningCredentials;
}

export type DataType = "population" | "entries";

export interface InsightsCacheEntry {
  dayData: Record<string, number>;
  avgDayData: Record<string, number>;
  entryDayData: Record<string, number>;
  avgEntryDayData: Record<string, number>;
  weekData: Record<string, number>;
  avgWeekData: Record<string, number>;
  entryWeekData: Record<string, number>;
  avgEntryWeekData: Record<string, number>;
  yearData: Record<string, number>;
  avgYearData: Record<string, number> | null;
  entryYearData: Record<string, number>;
  avgEntryYearData: Record<string, number> | null;
}

export interface ChartData {
  label: string;
  value: number;
  average?: number;
}

export interface HistoryCacheEntry {
  dayData: ChartData[];
  weekData: ChartData[];
  yearData: ChartData[];
}

// ── Helpers ──

function aggregateRecords(records: Record<string, number>[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const rec of records) {
    for (const [key, val] of Object.entries(rec)) {
      result[key] = (result[key] || 0) + val;
    }
  }
  return result;
}

function aggregateNullableRecords(
  records: (Record<string, number> | null)[]
): Record<string, number> | null {
  const valid = records.filter((r): r is Record<string, number> => r !== null);
  if (valid.length === 0) return null;
  return aggregateRecords(valid);
}

// ── Chart builders (shared between hooks and data cache) ──

export function buildDayChart(
  allData: { data: Record<string, number>; avgData: Record<string, number> }[]
): ChartData[] {
  const chartData: ChartData[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourStr = hour.toString();
    let totalValue = 0;
    let totalAverage = 0;
    allData.forEach(({ data, avgData }) => {
      totalValue += data[hourStr] || 0;
      totalAverage += avgData[hourStr] || 0;
    });
    chartData.push({ label: `${hour}:00`, value: totalValue, average: totalAverage });
  }
  return chartData;
}

export function buildWeekChart(
  allData: { data: Record<string, number>; avgData: Record<string, number> }[],
  maxDayIndex?: number
): ChartData[] {
  const daysOfWeek = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
  ];
  return daysOfWeek.map((day, index) => {
    let totalValue = 0;
    let totalAverage = 0;
    allData.forEach(({ data, avgData }) => {
      totalValue += data[day] || 0;
      totalAverage += avgData[day] || 0;
    });
    // Zero out future days in the current local week
    if (maxDayIndex !== undefined && index > maxDayIndex) {
      totalValue = 0;
    }
    return { label: day.substring(0, 3), value: totalValue, average: totalAverage };
  });
}

export function buildYearChart(
  allData: { data: Record<string, number>; avgData: Record<string, number> | null }[]
): ChartData[] {
  const months = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December",
  ];
  return months.map((month) => {
    let totalValue = 0;
    let totalAverage = 0;
    allData.forEach(({ data, avgData }) => {
      totalValue += data[month] || 0;
      if (avgData) totalAverage += avgData[month] || 0;
    });
    return { label: month.substring(0, 3), value: totalValue, average: totalAverage };
  });
}

// ── Credential key ──

export function makeCredKey(credentials: DeviceCredentials[]): string {
  return credentials.map((c) => c.deviceId).sort().join(",");
}

// ── Cached API wrappers ──

function cachedApiCall<T>(
  fnName: string,
  deviceId: string,
  params: string,
  fetcher: () => Promise<T>,
  force: boolean
): Promise<T> {
  const key = `${fnName}:${deviceId}:${params}`;
  return force ? forceRefresh(key, fetcher) : getOrFetch(key, fetcher);
}

// ── Fetchers ──

export async function fetchInsightsForCredentials(
  credentials: DeviceCredentials[],
  force = false
): Promise<InsightsCacheEntry> {
  const { utcDate1, utcDate2, utcMinutesAtMidnight } = getLocalDayUTCBounds();
  const needsSecondDate = utcDate1 !== utcDate2;
  const localDate = formatLocalDate();
  const now = new Date();
  const currentYear = now.getUTCFullYear();

  const allResults = await Promise.all(
    credentials.map(async (cred) => {
      const [
        day1, avgDay1, entryDay1, avgEntryDay1,
        day2, avgDay2, entryDay2, avgEntryDay2,
        week, avgWeek, entryWeek, avgEntryWeek,
        year, avgYear, entryYear, avgEntryYear,
      ] = await Promise.all([
        cachedApiCall("getDayData", cred.deviceId, utcDate1, () => api.getDayData(cred.deviceId, cred.password, utcDate1), force).catch(() => ({})),
        cachedApiCall("getAverageDayData", cred.deviceId, utcDate1, () => api.getAverageDayData(cred.deviceId, cred.password, utcDate1), force).catch(() => ({})),
        cachedApiCall("getEntryDayData", cred.deviceId, utcDate1, () => api.getEntryDayData(cred.deviceId, cred.password, utcDate1), force).catch(() => ({})),
        cachedApiCall("getAverageEntryDayData", cred.deviceId, utcDate1, () => api.getAverageEntryDayData(cred.deviceId, cred.password, utcDate1), force).catch(() => ({})),
        needsSecondDate ? cachedApiCall("getDayData", cred.deviceId, utcDate2, () => api.getDayData(cred.deviceId, cred.password, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
        needsSecondDate ? cachedApiCall("getAverageDayData", cred.deviceId, utcDate2, () => api.getAverageDayData(cred.deviceId, cred.password, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
        needsSecondDate ? cachedApiCall("getEntryDayData", cred.deviceId, utcDate2, () => api.getEntryDayData(cred.deviceId, cred.password, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
        needsSecondDate ? cachedApiCall("getAverageEntryDayData", cred.deviceId, utcDate2, () => api.getAverageEntryDayData(cred.deviceId, cred.password, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
        cachedApiCall("getWeekData", cred.deviceId, localDate, () => api.getWeekData(cred.deviceId, cred.password, localDate), force).catch(() => ({})),
        cachedApiCall("getAverageWeekData", cred.deviceId, localDate, () => api.getAverageWeekData(cred.deviceId, cred.password, localDate), force).catch(() => ({})),
        cachedApiCall("getEntryWeekData", cred.deviceId, localDate, () => api.getEntryWeekData(cred.deviceId, cred.password, localDate), force).catch(() => ({})),
        cachedApiCall("getAverageEntryWeekData", cred.deviceId, localDate, () => api.getAverageEntryWeekData(cred.deviceId, cred.password, localDate), force).catch(() => ({})),
        cachedApiCall("getYearData", cred.deviceId, String(currentYear), () => api.getYearData(cred.deviceId, cred.password, currentYear), force).catch(() => ({})),
        cachedApiCall("getAverageYearData", cred.deviceId, String(currentYear), () => api.getAverageYearData(cred.deviceId, cred.password, currentYear), force).catch(() => null),
        cachedApiCall("getEntryYearData", cred.deviceId, String(currentYear), () => api.getEntryYearData(cred.deviceId, cred.password, currentYear), force).catch(() => ({})),
        cachedApiCall("getAverageEntryYearData", cred.deviceId, String(currentYear), () => api.getAverageEntryYearData(cred.deviceId, cred.password, currentYear), force).catch(() => null),
      ]);

      return {
        day: shiftDayDataToLocal(day1, day2, utcMinutesAtMidnight),
        avgDay: shiftDayDataToLocal(avgDay1, avgDay2, utcMinutesAtMidnight),
        entryDay: shiftDayDataToLocal(entryDay1, entryDay2, utcMinutesAtMidnight),
        avgEntryDay: shiftDayDataToLocal(avgEntryDay1, avgEntryDay2, utcMinutesAtMidnight),
        week, avgWeek, entryWeek, avgEntryWeek,
        year, avgYear, entryYear, avgEntryYear,
      };
    })
  );

  // Filter future local days from current-week data (insights is always "today")
  const maxIdx = getLocalDayOfWeekIndex();
  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  function stripFutureDays(rec: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, val] of Object.entries(rec)) {
      const idx = daysOfWeek.indexOf(key);
      if (idx === -1 || idx <= maxIdx) out[key] = val;
    }
    return out;
  }

  return {
    dayData: aggregateRecords(allResults.map((r) => r.day)),
    avgDayData: aggregateRecords(allResults.map((r) => r.avgDay)),
    entryDayData: aggregateRecords(allResults.map((r) => r.entryDay)),
    avgEntryDayData: aggregateRecords(allResults.map((r) => r.avgEntryDay)),
    weekData: stripFutureDays(aggregateRecords(allResults.map((r) => r.week))),
    avgWeekData: aggregateRecords(allResults.map((r) => r.avgWeek)),
    entryWeekData: stripFutureDays(aggregateRecords(allResults.map((r) => r.entryWeek))),
    avgEntryWeekData: aggregateRecords(allResults.map((r) => r.avgEntryWeek)),
    yearData: aggregateRecords(allResults.map((r) => r.year)),
    avgYearData: aggregateNullableRecords(allResults.map((r) => r.avgYear)),
    entryYearData: aggregateRecords(allResults.map((r) => r.entryYear)),
    avgEntryYearData: aggregateNullableRecords(allResults.map((r) => r.avgEntryYear)),
  };
}

export async function fetchAvailableDates(
  credentials: DeviceCredentials[],
  force = false
): Promise<string[]> {
  const allDatesArrays = await Promise.all(
    credentials.map((cred) =>
      cachedApiCall(
        "getAvailableDates", cred.deviceId, "",
        () => api.getAvailableDates(cred.deviceId, cred.password),
        force
      ).catch(() => [] as string[])
    )
  );
  const allDatesSet = new Set<string>();
  allDatesArrays.forEach((dates) => {
    dates.forEach((date) => allDatesSet.add(date));
  });
  const utcDates = Array.from(allDatesSet).sort();
  return utcDatesToLocalDates(utcDates);
}

export async function fetchHistoryCharts(
  credentials: DeviceCredentials[],
  date: string,
  weekDate: string,
  year: string,
  dataType: DataType,
  force = false
): Promise<HistoryCacheEntry> {
  const yearNum = parseInt(year, 10);
  const { utcDate1, utcDate2, utcMinutesAtMidnight } = getLocalDayUTCBounds(date);
  const needsSecondDate = utcDate1 !== utcDate2;

  const getDayFn = dataType === "entries" ? api.getEntryDayData : api.getDayData;
  const getAvgDayFn = dataType === "entries" ? api.getAverageEntryDayData : api.getAverageDayData;
  const getWeekFn = dataType === "entries" ? api.getEntryWeekData : api.getWeekData;
  const getAvgWeekFn = dataType === "entries" ? api.getAverageEntryWeekData : api.getAverageWeekData;
  const getYearFn = dataType === "entries" ? api.getEntryYearData : api.getYearData;
  const getAvgYearFn = dataType === "entries" ? api.getAverageEntryYearData : api.getAverageYearData;

  const dayFnName = dataType === "entries" ? "getEntryDayData" : "getDayData";
  const avgDayFnName = dataType === "entries" ? "getAverageEntryDayData" : "getAverageDayData";
  const weekFnName = dataType === "entries" ? "getEntryWeekData" : "getWeekData";
  const avgWeekFnName = dataType === "entries" ? "getAverageEntryWeekData" : "getAverageWeekData";
  const yearFnName = dataType === "entries" ? "getEntryYearData" : "getYearData";
  const avgYearFnName = dataType === "entries" ? "getAverageEntryYearData" : "getAverageYearData";

  // All devices in parallel — apiCache deduplicates concurrent requests for the same device
  const allDeviceResults = await Promise.all(
    credentials.map(async (cred) => {
      const [dayD1, dayAvg1, dayD2, dayAvg2, weekD, weekAvg, yearD, yearAvg] = await Promise.all([
        cachedApiCall(dayFnName, cred.deviceId, utcDate1, () => getDayFn(cred.deviceId, cred.password, utcDate1), force).catch(() => ({})),
        cachedApiCall(avgDayFnName, cred.deviceId, utcDate1, () => getAvgDayFn(cred.deviceId, cred.password, utcDate1), force).catch(() => ({})),
        needsSecondDate ? cachedApiCall(dayFnName, cred.deviceId, utcDate2, () => getDayFn(cred.deviceId, cred.password, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
        needsSecondDate ? cachedApiCall(avgDayFnName, cred.deviceId, utcDate2, () => getAvgDayFn(cred.deviceId, cred.password, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
        cachedApiCall(weekFnName, cred.deviceId, weekDate, () => getWeekFn(cred.deviceId, cred.password, weekDate), force).catch(() => ({})),
        cachedApiCall(avgWeekFnName, cred.deviceId, weekDate, () => getAvgWeekFn(cred.deviceId, cred.password, weekDate), force).catch(() => ({})),
        cachedApiCall(yearFnName, cred.deviceId, String(yearNum), () => getYearFn(cred.deviceId, cred.password, yearNum), force).catch(() => ({})),
        cachedApiCall(avgYearFnName, cred.deviceId, String(yearNum), () => getAvgYearFn(cred.deviceId, cred.password, yearNum), force).catch(() => null),
      ]);

      return {
        day: {
          data: shiftDayDataToLocal(dayD1, dayD2, utcMinutesAtMidnight),
          avgData: shiftDayDataToLocal(dayAvg1, dayAvg2 as Record<string, number>, utcMinutesAtMidnight),
        },
        week: { data: weekD, avgData: weekAvg },
        year: { data: yearD, avgData: yearAvg ?? {} },
      };
    })
  );

  const dayResults = allDeviceResults.map((r) => r.day);
  const weekResults = allDeviceResults.map((r) => r.week);
  const yearResults = allDeviceResults.map((r) => r.year);

  // For the current local week, zero out days that haven't started locally yet
  const maxDayIndex = isDateInCurrentLocalWeek(weekDate)
    ? getLocalDayOfWeekIndex()
    : undefined;

  return {
    dayData: buildDayChart(dayResults),
    weekData: buildWeekChart(weekResults, maxDayIndex),
    yearData: buildYearChart(yearResults),
  };
}

// ── Location-level fetchers (server-side aggregation) ──

function cachedLocationCall<T>(
  fnName: string,
  locationId: string,
  params: string,
  fetcher: () => Promise<T>,
  force: boolean
): Promise<T> {
  const key = `loc:${fnName}:${locationId}:${params}`;
  return force ? forceRefresh(key, fetcher) : getOrFetch(key, fetcher);
}

export async function fetchLocationInsights(
  loc: LocationFetchParams,
  force = false
): Promise<InsightsCacheEntry> {
  const { locationId, credentials, signingDevice } = loc;
  const { utcDate1, utcDate2, utcMinutesAtMidnight } = getLocalDayUTCBounds();
  const needsSecondDate = utcDate1 !== utcDate2;
  const localDate = formatLocalDate();
  const now = new Date();
  const currentYear = now.getUTCFullYear();

  const [
    day1, avgDay1, entryDay1, avgEntryDay1,
    day2, avgDay2, entryDay2, avgEntryDay2,
    week, avgWeek, entryWeek, avgEntryWeek,
    year, avgYear, entryYear, avgEntryYear,
  ] = await Promise.all([
    cachedLocationCall("getDayData", locationId, utcDate1, () => api.getLocationDayData(locationId, credentials, signingDevice, utcDate1), force).catch(() => ({})),
    cachedLocationCall("getAverageDayData", locationId, utcDate1, () => api.getLocationAverageDayData(locationId, credentials, signingDevice, utcDate1), force).catch(() => ({})),
    cachedLocationCall("getEntryDayData", locationId, utcDate1, () => api.getLocationEntryDayData(locationId, credentials, signingDevice, utcDate1), force).catch(() => ({})),
    cachedLocationCall("getAverageEntryDayData", locationId, utcDate1, () => api.getLocationAverageEntryDayData(locationId, credentials, signingDevice, utcDate1), force).catch(() => ({})),
    needsSecondDate ? cachedLocationCall("getDayData", locationId, utcDate2, () => api.getLocationDayData(locationId, credentials, signingDevice, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
    needsSecondDate ? cachedLocationCall("getAverageDayData", locationId, utcDate2, () => api.getLocationAverageDayData(locationId, credentials, signingDevice, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
    needsSecondDate ? cachedLocationCall("getEntryDayData", locationId, utcDate2, () => api.getLocationEntryDayData(locationId, credentials, signingDevice, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
    needsSecondDate ? cachedLocationCall("getAverageEntryDayData", locationId, utcDate2, () => api.getLocationAverageEntryDayData(locationId, credentials, signingDevice, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
    cachedLocationCall("getWeekData", locationId, localDate, () => api.getLocationWeekData(locationId, credentials, signingDevice, localDate), force).catch(() => ({})),
    cachedLocationCall("getAverageWeekData", locationId, localDate, () => api.getLocationAverageWeekData(locationId, credentials, signingDevice, localDate), force).catch(() => ({})),
    cachedLocationCall("getEntryWeekData", locationId, localDate, () => api.getLocationEntryWeekData(locationId, credentials, signingDevice, localDate), force).catch(() => ({})),
    cachedLocationCall("getAverageEntryWeekData", locationId, localDate, () => api.getLocationAverageEntryWeekData(locationId, credentials, signingDevice, localDate), force).catch(() => ({})),
    cachedLocationCall("getYearData", locationId, String(currentYear), () => api.getLocationYearData(locationId, credentials, signingDevice, currentYear), force).catch(() => ({})),
    cachedLocationCall("getAverageYearData", locationId, String(currentYear), () => api.getLocationAverageYearData(locationId, credentials, signingDevice, currentYear), force).catch(() => null),
    cachedLocationCall("getEntryYearData", locationId, String(currentYear), () => api.getLocationEntryYearData(locationId, credentials, signingDevice, currentYear), force).catch(() => ({})),
    cachedLocationCall("getAverageEntryYearData", locationId, String(currentYear), () => api.getLocationAverageEntryYearData(locationId, credentials, signingDevice, currentYear), force).catch(() => null),
  ]);

  // Filter future local days from current-week data
  const maxIdx = getLocalDayOfWeekIndex();
  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  function stripFutureDays(rec: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, val] of Object.entries(rec)) {
      const idx = daysOfWeek.indexOf(key);
      if (idx === -1 || idx <= maxIdx) out[key] = val;
    }
    return out;
  }

  return {
    dayData: shiftDayDataToLocal(day1, day2, utcMinutesAtMidnight),
    avgDayData: shiftDayDataToLocal(avgDay1, avgDay2, utcMinutesAtMidnight),
    entryDayData: shiftDayDataToLocal(entryDay1, entryDay2, utcMinutesAtMidnight),
    avgEntryDayData: shiftDayDataToLocal(avgEntryDay1, avgEntryDay2, utcMinutesAtMidnight),
    weekData: stripFutureDays(week),
    avgWeekData: avgWeek,
    entryWeekData: stripFutureDays(entryWeek),
    avgEntryWeekData: avgEntryWeek,
    yearData: year,
    avgYearData: avgYear,
    entryYearData: entryYear,
    avgEntryYearData: avgEntryYear,
  };
}

export async function fetchLocationAvailableDates(
  loc: LocationFetchParams,
  force = false
): Promise<string[]> {
  const { locationId, credentials, signingDevice } = loc;
  const dates = await cachedLocationCall(
    "getAvailableDates", locationId, "",
    () => api.getLocationAvailableDates(locationId, credentials, signingDevice),
    force
  ).catch(() => [] as string[]);
  return utcDatesToLocalDates(dates);
}

export async function fetchLocationHistoryCharts(
  loc: LocationFetchParams,
  date: string,
  weekDate: string,
  year: string,
  dataType: DataType,
  force = false
): Promise<HistoryCacheEntry> {
  const { locationId, credentials, signingDevice } = loc;
  const yearNum = parseInt(year, 10);
  const { utcDate1, utcDate2, utcMinutesAtMidnight } = getLocalDayUTCBounds(date);
  const needsSecondDate = utcDate1 !== utcDate2;

  const getDayFn = dataType === "entries" ? api.getLocationEntryDayData : api.getLocationDayData;
  const getAvgDayFn = dataType === "entries" ? api.getLocationAverageEntryDayData : api.getLocationAverageDayData;
  const getWeekFn = dataType === "entries" ? api.getLocationEntryWeekData : api.getLocationWeekData;
  const getAvgWeekFn = dataType === "entries" ? api.getLocationAverageEntryWeekData : api.getLocationAverageWeekData;
  const getYearFn = dataType === "entries" ? api.getLocationEntryYearData : api.getLocationYearData;
  const getAvgYearFn = dataType === "entries" ? api.getLocationAverageEntryYearData : api.getLocationAverageYearData;

  const dayFnName = dataType === "entries" ? "getEntryDayData" : "getDayData";
  const avgDayFnName = dataType === "entries" ? "getAverageEntryDayData" : "getAverageDayData";
  const weekFnName = dataType === "entries" ? "getEntryWeekData" : "getWeekData";
  const avgWeekFnName = dataType === "entries" ? "getAverageEntryWeekData" : "getAverageWeekData";
  const yearFnName = dataType === "entries" ? "getEntryYearData" : "getYearData";
  const avgYearFnName = dataType === "entries" ? "getAverageEntryYearData" : "getAverageYearData";

  const [dayD1, dayAvg1, dayD2, dayAvg2, weekD, weekAvg, yearD, yearAvg] = await Promise.all([
    cachedLocationCall(dayFnName, locationId, utcDate1, () => getDayFn(locationId, credentials, signingDevice, utcDate1), force).catch(() => ({})),
    cachedLocationCall(avgDayFnName, locationId, utcDate1, () => getAvgDayFn(locationId, credentials, signingDevice, utcDate1), force).catch(() => ({})),
    needsSecondDate ? cachedLocationCall(dayFnName, locationId, utcDate2, () => getDayFn(locationId, credentials, signingDevice, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
    needsSecondDate ? cachedLocationCall(avgDayFnName, locationId, utcDate2, () => getAvgDayFn(locationId, credentials, signingDevice, utcDate2), force).catch(() => ({})) : Promise.resolve({} as Record<string, number>),
    cachedLocationCall(weekFnName, locationId, weekDate, () => getWeekFn(locationId, credentials, signingDevice, weekDate), force).catch(() => ({})),
    cachedLocationCall(avgWeekFnName, locationId, weekDate, () => getAvgWeekFn(locationId, credentials, signingDevice, weekDate), force).catch(() => ({})),
    cachedLocationCall(yearFnName, locationId, String(yearNum), () => getYearFn(locationId, credentials, signingDevice, yearNum), force).catch(() => ({})),
    cachedLocationCall(avgYearFnName, locationId, String(yearNum), () => getAvgYearFn(locationId, credentials, signingDevice, yearNum), force).catch(() => null),
  ]);

  const dayResult = {
    data: shiftDayDataToLocal(dayD1, dayD2, utcMinutesAtMidnight),
    avgData: shiftDayDataToLocal(dayAvg1, dayAvg2 as Record<string, number>, utcMinutesAtMidnight),
  };
  const weekResult = { data: weekD, avgData: weekAvg };
  const yearResult = { data: yearD, avgData: yearAvg ?? {} };

  const maxDayIndex = isDateInCurrentLocalWeek(weekDate)
    ? getLocalDayOfWeekIndex()
    : undefined;

  return {
    dayData: buildDayChart([dayResult]),
    weekData: buildWeekChart([weekResult], maxDayIndex),
    yearData: buildYearChart([yearResult]),
  };
}
