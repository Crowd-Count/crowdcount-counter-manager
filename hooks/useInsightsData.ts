"use client";

import { useState, useEffect, useRef } from "react";
import * as api from "@/lib/api";
import { getLocalDayUTCBounds, shiftDayDataToLocal } from "@/lib/timezone";
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

    // Compute the two UTC dates that span the user's local "today"
    const { utcDate1, utcDate2, utcMinutesAtMidnight } = getLocalDayUTCBounds();
    const needsSecondDate = utcDate1 !== utcDate2;

    // Use utcDate1 for week/year queries (the UTC date when local midnight falls)
    const utcDateForWeek = utcDate1;
    const now = new Date();
    const currentYear = now.getUTCFullYear();

    async function fetchAll() {
      try {
        const allResults = await Promise.all(
          stableCredentials.map(async (cred) => {
            const [
              day1, avgDay1, entryDay1, avgEntryDay1,
              day2, avgDay2, entryDay2, avgEntryDay2,
              week, avgWeek, entryWeek, avgEntryWeek,
              year, avgYear, entryYear, avgEntryYear,
            ] = await Promise.all([
              // Day data for utcDate1
              api.getDayData(cred.deviceId, cred.password, utcDate1).catch(() => ({})),
              api.getAverageDayData(cred.deviceId, cred.password, utcDate1).catch(() => ({})),
              api.getEntryDayData(cred.deviceId, cred.password, utcDate1).catch(() => ({})),
              api.getAverageEntryDayData(cred.deviceId, cred.password, utcDate1).catch(() => ({})),
              // Day data for utcDate2 (needed to fill local hours that wrap into the next UTC date)
              needsSecondDate ? api.getDayData(cred.deviceId, cred.password, utcDate2).catch(() => ({})) : Promise.resolve({}),
              needsSecondDate ? api.getAverageDayData(cred.deviceId, cred.password, utcDate2).catch(() => ({})) : Promise.resolve({}),
              needsSecondDate ? api.getEntryDayData(cred.deviceId, cred.password, utcDate2).catch(() => ({})) : Promise.resolve({}),
              needsSecondDate ? api.getAverageEntryDayData(cred.deviceId, cred.password, utcDate2).catch(() => ({})) : Promise.resolve({}),
              // Week & Year data (UTC-based, no shift needed)
              api.getWeekData(cred.deviceId, cred.password, utcDateForWeek).catch(() => ({})),
              api.getAverageWeekData(cred.deviceId, cred.password, utcDateForWeek).catch(() => ({})),
              api.getEntryWeekData(cred.deviceId, cred.password, utcDateForWeek).catch(() => ({})),
              api.getAverageEntryWeekData(cred.deviceId, cred.password, utcDateForWeek).catch(() => ({})),
              api.getYearData(cred.deviceId, cred.password, currentYear).catch(() => ({})),
              api.getAverageYearData(cred.deviceId, cred.password, currentYear).catch(() => null),
              api.getEntryYearData(cred.deviceId, cred.password, currentYear).catch(() => ({})),
              api.getAverageEntryYearData(cred.deviceId, cred.password, currentYear).catch(() => null),
            ]);

            // Shift day data from UTC hours to local hours
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
