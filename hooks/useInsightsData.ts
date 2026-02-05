"use client";

import { useState, useEffect, useRef } from "react";
import { useDataCache } from "@/contexts/DataCacheContext";
import {
  fetchInsightsForCredentials,
  makeCredKey,
  type DeviceCredentials,
  type InsightsCacheEntry,
} from "@/lib/dataFetchers";

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

function applyInsightsCache(entry: InsightsCacheEntry): Omit<InsightsData, "isLoading"> {
  return {
    dayData: entry.dayData,
    avgDayData: entry.avgDayData,
    entryDayData: entry.entryDayData,
    avgEntryDayData: entry.avgEntryDayData,
    weekData: entry.weekData,
    avgWeekData: entry.avgWeekData,
    entryWeekData: entry.entryWeekData,
    avgEntryWeekData: entry.avgEntryWeekData,
    yearData: entry.yearData,
    avgYearData: entry.avgYearData,
    entryYearData: entry.entryYearData,
    avgEntryYearData: entry.avgEntryYearData,
  };
}

const EMPTY_DATA: Omit<InsightsData, "isLoading"> = {
  dayData: {},
  avgDayData: {},
  entryDayData: {},
  avgEntryDayData: {},
  weekData: {},
  avgWeekData: {},
  entryWeekData: {},
  avgEntryWeekData: {},
  yearData: {},
  avgYearData: null,
  entryYearData: {},
  avgEntryYearData: null,
};

export function useInsightsData(credentials: DeviceCredentials[]): InsightsData {
  const credentialsRef = useRef<DeviceCredentials[]>([]);
  if (credentials.length > 0 && credentialsRef.current.length === 0) {
    credentialsRef.current = credentials;
  }
  const stableCredentials = credentialsRef.current;

  const { cacheVersion, getCachedInsights, setCachedInsights } = useDataCache();
  const credKey = stableCredentials.length > 0 ? makeCredKey(stableCredentials) : "";

  // Check cache synchronously for initial state
  const initialCache = credKey ? getCachedInsights(credKey) : null;
  const [isLoading, setIsLoading] = useState(!initialCache && stableCredentials.length > 0);
  const [data, setData] = useState<Omit<InsightsData, "isLoading">>(
    initialCache ? applyInsightsCache(initialCache) : EMPTY_DATA
  );

  // Track whether we've done the initial fetch
  const hasFetched = useRef(!!initialCache);

  // Fetch on mount if cache miss
  useEffect(() => {
    if (stableCredentials.length === 0) {
      setIsLoading(false);
      return;
    }
    if (hasFetched.current) return;

    let cancelled = false;
    setIsLoading(true);

    fetchInsightsForCredentials(stableCredentials)
      .then((result) => {
        if (cancelled) return;
        hasFetched.current = true;
        setData(applyInsightsCache(result));
        setCachedInsights(credKey, result);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load insights data:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stableCredentials, credKey, setCachedInsights]);

  // Silently update when cacheVersion changes (background refresh)
  useEffect(() => {
    if (!credKey || cacheVersion === 0) return;
    const cached = getCachedInsights(credKey);
    if (cached) {
      setData(applyInsightsCache(cached));
      hasFetched.current = true;
      setIsLoading(false);
    }
  }, [cacheVersion, credKey, getCachedInsights]);

  return {
    isLoading,
    ...data,
  };
}
