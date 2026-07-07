"use client";

import { useState, useEffect, useRef } from "react";
import { useDataCache } from "@/contexts/DataCacheContext";
import {
  fetchInsightsForCredentials,
  fetchLocationInsights,
  makeCredKey,
  type DeviceCredentials,
  type InsightsCacheEntry,
  type LocationFetchParams,
} from "@/lib/dataFetchers";
import { logError } from "@/lib/logger";

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
  dwellTimeMinutes: number | null;
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
    dwellTimeMinutes: entry.dwellTimeMinutes,
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
  dwellTimeMinutes: null,
};

export function useInsightsData(
  credentials: DeviceCredentials[],
  locationParams?: LocationFetchParams,
  timeZone?: string
): InsightsData {
  // Latch the first non-empty value of each input so later prop churn doesn't
  // re-key the fetch. useState + render-phase adjustment is the sanctioned
  // (and compiler-legal) version of the previous read-a-ref-during-render
  // latch: React restarts the render synchronously, so the committed output
  // is identical.
  const [stableCredentials, setStableCredentials] = useState<DeviceCredentials[]>(
    credentials.length > 0 ? credentials : []
  );
  if (credentials.length > 0 && stableCredentials.length === 0) {
    setStableCredentials(credentials);
  }

  const [stableLocationParams, setStableLocationParams] = useState<
    LocationFetchParams | undefined
  >(locationParams);
  if (locationParams && !stableLocationParams) {
    setStableLocationParams(locationParams);
  }

  // Display zone for the device-credentials path (locations carry their own in params)
  const [tz, setTz] = useState<string | undefined>(timeZone);
  if (timeZone && !tz) {
    setTz(timeZone);
  }

  const { getCachedInsights, setCachedInsights } = useDataCache();

  const credKey = stableLocationParams
    ? `loc:${stableLocationParams.locationId}`
    : stableCredentials.length > 0
      ? `${makeCredKey(stableCredentials)}:${tz ?? "browser"}`
      : "";

  const hasData = !!stableLocationParams || stableCredentials.length > 0;

  // The cache is read during render: the DataCache context bumps cacheVersion
  // (a state change) whenever entries land, so cache hits — including
  // background refreshes — flow in as ordinary re-renders instead of being
  // mirrored into local state from an effect.
  const cached = credKey ? getCachedInsights(credKey) : null;

  const [fetched, setFetched] = useState<Omit<InsightsData, "isLoading"> | null>(null);
  const [fetchSettled, setFetchSettled] = useState(false);

  // Guards the mount fetch across re-renders (read/written only in the effect).
  const fetchStarted = useRef(false);

  // Fetch on mount if cache miss
  useEffect(() => {
    if (!hasData || cached || fetchStarted.current) return;
    fetchStarted.current = true;

    let cancelled = false;

    const fetchPromise = stableLocationParams
      ? fetchLocationInsights(stableLocationParams)
      : fetchInsightsForCredentials(stableCredentials, false, tz);

    fetchPromise
      .then((result) => {
        if (cancelled) return;
        setFetched(applyInsightsCache(result));
        setCachedInsights(credKey, result);
      })
      .catch((error) => {
        if (cancelled) return;
        logError("Failed to load insights data:", error);
      })
      .finally(() => {
        if (!cancelled) setFetchSettled(true);
      });

    return () => {
      cancelled = true;
    };
  }, [stableCredentials, stableLocationParams, credKey, hasData, cached, setCachedInsights, tz]);

  const data = cached ? applyInsightsCache(cached) : (fetched ?? EMPTY_DATA);
  const isLoading = hasData && !cached && !fetched && !fetchSettled;

  return {
    isLoading,
    ...data,
  };
}
