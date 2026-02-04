"use client";

import { useState, useEffect, useRef } from "react";
import * as api from "@/lib/api";
import type { DeviceCredentials } from "@/hooks/useAggregatedHistory";

export interface InsightsData {
  isLoading: boolean;
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

function aggregateRecords(
  records: Record<string, number>[]
): Record<string, number> {
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

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function useInsightsData(credentials: DeviceCredentials[]): InsightsData {
  const credentialsRef = useRef<DeviceCredentials[]>([]);
  if (credentials.length > 0 && credentialsRef.current.length === 0) {
    credentialsRef.current = credentials;
  }
  const stableCredentials = credentialsRef.current;

  const [isLoading, setIsLoading] = useState(true);
  const [dayData, setDayData] = useState<Record<string, number>>({});
  const [avgDayData, setAvgDayData] = useState<Record<string, number>>({});
  const [entryDayData, setEntryDayData] = useState<Record<string, number>>({});
  const [avgEntryDayData, setAvgEntryDayData] = useState<Record<string, number>>({});
  const [weekData, setWeekData] = useState<Record<string, number>>({});
  const [avgWeekData, setAvgWeekData] = useState<Record<string, number>>({});
  const [entryWeekData, setEntryWeekData] = useState<Record<string, number>>({});
  const [avgEntryWeekData, setAvgEntryWeekData] = useState<Record<string, number>>({});
  const [yearData, setYearData] = useState<Record<string, number>>({});
  const [avgYearData, setAvgYearData] = useState<Record<string, number> | null>(null);
  const [entryYearData, setEntryYearData] = useState<Record<string, number>>({});
  const [avgEntryYearData, setAvgEntryYearData] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (stableCredentials.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const today = getTodayDateString();
    const currentYear = new Date().getFullYear();

    // Fetch all 12 datasets for each device sequentially per device, then aggregate
    async function fetchAll() {
      try {
        // For each credential, fetch all 12 endpoints
        const allResults = await Promise.all(
          stableCredentials.map(async (cred) => {
            const [
              day, avgDay, entryDay, avgEntryDay,
              week, avgWeek, entryWeek, avgEntryWeek,
              year, avgYear, entryYear, avgEntryYear,
            ] = await Promise.all([
              api.getDayData(cred.deviceId, cred.password, today).catch(() => ({})),
              api.getAverageDayData(cred.deviceId, cred.password, today).catch(() => ({})),
              api.getEntryDayData(cred.deviceId, cred.password, today).catch(() => ({})),
              api.getAverageEntryDayData(cred.deviceId, cred.password, today).catch(() => ({})),
              api.getWeekData(cred.deviceId, cred.password, today).catch(() => ({})),
              api.getAverageWeekData(cred.deviceId, cred.password, today).catch(() => ({})),
              api.getEntryWeekData(cred.deviceId, cred.password, today).catch(() => ({})),
              api.getAverageEntryWeekData(cred.deviceId, cred.password, today).catch(() => ({})),
              api.getYearData(cred.deviceId, cred.password, currentYear).catch(() => ({})),
              api.getAverageYearData(cred.deviceId, cred.password, currentYear).catch(() => null),
              api.getEntryYearData(cred.deviceId, cred.password, currentYear).catch(() => ({})),
              api.getAverageEntryYearData(cred.deviceId, cred.password, currentYear).catch(() => null),
            ]);

            return {
              day, avgDay, entryDay, avgEntryDay,
              week, avgWeek, entryWeek, avgEntryWeek,
              year, avgYear, entryYear, avgEntryYear,
            };
          })
        );

        if (cancelled) return;

        setDayData(aggregateRecords(allResults.map((r) => r.day)));
        setAvgDayData(aggregateRecords(allResults.map((r) => r.avgDay)));
        setEntryDayData(aggregateRecords(allResults.map((r) => r.entryDay)));
        setAvgEntryDayData(aggregateRecords(allResults.map((r) => r.avgEntryDay)));
        setWeekData(aggregateRecords(allResults.map((r) => r.week)));
        setAvgWeekData(aggregateRecords(allResults.map((r) => r.avgWeek)));
        setEntryWeekData(aggregateRecords(allResults.map((r) => r.entryWeek)));
        setAvgEntryWeekData(aggregateRecords(allResults.map((r) => r.avgEntryWeek)));
        setYearData(aggregateRecords(allResults.map((r) => r.year)));
        setAvgYearData(aggregateNullableRecords(allResults.map((r) => r.avgYear)));
        setEntryYearData(aggregateRecords(allResults.map((r) => r.entryYear)));
        setAvgEntryYearData(aggregateNullableRecords(allResults.map((r) => r.avgEntryYear)));
      } catch (error) {
        console.error("Failed to load insights data:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [stableCredentials]);

  return {
    isLoading,
    dayData,
    avgDayData,
    entryDayData,
    avgEntryDayData,
    weekData,
    avgWeekData,
    entryWeekData,
    avgEntryWeekData,
    yearData,
    avgYearData,
    entryYearData,
    avgEntryYearData,
  };
}
