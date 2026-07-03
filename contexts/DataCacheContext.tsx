"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import {
  fetchLocationInsights,
  fetchLocationAvailableDates,
  fetchLocationHistoryCharts,
  type InsightsCacheEntry,
  type HistoryCacheEntry,
  type LocationFetchParams,
} from "@/lib/dataFetchers";
import type { POSTransactionData } from "@/lib/types";
import * as api from "@/lib/api";
import { resolveLocationTimezone } from "@/lib/locationTimezone";
import { todayInTimeZone } from "@/lib/timezone";
import { logError } from "@/lib/logger";

interface DataCacheContextType {
  cacheVersion: number;
  getCachedInsights(credKey: string): InsightsCacheEntry | null;
  setCachedInsights(credKey: string, data: InsightsCacheEntry): void;
  getCachedDates(credKey: string): string[] | null;
  setCachedDates(credKey: string, dates: string[]): void;
  getCachedHistory(cacheKey: string): HistoryCacheEntry | null;
  setCachedHistory(cacheKey: string, data: HistoryCacheEntry): void;
  getCachedPOSTransactions(cacheKey: string): POSTransactionData | null;
  setCachedPOSTransactions(cacheKey: string, data: POSTransactionData): void;
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined);

const REFRESH_INTERVAL = 30_000; // 30 seconds

export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  const { devices, isLoading: devicesLoading } = useDevices();
  const { locations, isLoading: locationsLoading } = useLocations();

  const [cacheVersion, setCacheVersion] = useState(0);

  // Use refs for the actual cache maps to avoid re-renders on every cache write
  const insightsCache = useRef<Map<string, InsightsCacheEntry>>(new Map());
  const datesCache = useRef<Map<string, string[]>>(new Map());
  const historyCache = useRef<Map<string, HistoryCacheEntry>>(new Map());

  // TODO: Integrate posTransactionCache to reduce API calls for POS transactions when viewing location insights/history. This will require some adjustments to how we fetch and cache insights data, since POS transactions are currently fetched separately on the insights page.
  // Note: POS is pulled server side side every 15 mins so no need for aggressive polling or caching just yet (unless we change that?)
  const posTransactionCache = useRef<Map<string, POSTransactionData>>(new Map());

  const getCachedInsights = useCallback((credKey: string) => {
    return insightsCache.current.get(credKey) ?? null;
  }, []);

  const setCachedInsights = useCallback((credKey: string, data: InsightsCacheEntry) => {
    insightsCache.current.set(credKey, data);
  }, []);

  const getCachedDates = useCallback((credKey: string) => {
    return datesCache.current.get(credKey) ?? null;
  }, []);

  const setCachedDates = useCallback((credKey: string, dates: string[]) => {
    datesCache.current.set(credKey, dates);
  }, []);

  const getCachedHistory = useCallback((cacheKey: string) => {
    return historyCache.current.get(cacheKey) ?? null;
  }, []);

  const setCachedHistory = useCallback((cacheKey: string, data: HistoryCacheEntry) => {
    historyCache.current.set(cacheKey, data);
  }, []);

  const getCachedPOSTransactions = useCallback((cacheKey: string) => {
    return posTransactionCache.current.get(cacheKey) ?? null;
  }, []);

  const setCachedPOSTransactions = useCallback((cacheKey: string, data: POSTransactionData) => {
    posTransactionCache.current.set(cacheKey, data);
  }, []);

  // Build credential sets for locations that need pre-fetching
  const buildCredentialSets = useCallback((): {
    credKey: string;
    locationParams: LocationFetchParams;
  }[] => {
    const sets: {
      credKey: string;
      locationParams: LocationFetchParams;
    }[] = [];
    const seen = new Set<string>();

    for (const location of locations) {
      const locCreds = api.getLocationCredentials(location, devices);
      if (!locCreds) continue;
      const locKey = `loc:${location.id}`;
      if (!seen.has(locKey)) {
        seen.add(locKey);
        sets.push({
          credKey: locKey,
          locationParams: {
            locationId: location.id,
            credentials: locCreds.credentials,
            signingDevice: locCreds.signingDevice,
            timeZone: resolveLocationTimezone(location),
          },
        });
      }
    }

    return sets;
  }, [devices, locations]);

  // Pre-fetch all data for a location credential set
  const prefetchForCredSet = useCallback(async (
    credKey: string,
    locationParams: LocationFetchParams,
    force: boolean
  ) => {
    try {
      // Fetch dates, insights, and default history all in parallel
      const datesPromise = fetchLocationAvailableDates(locationParams, force).catch(() => [] as string[]);
      const insightsPromise = fetchLocationInsights(locationParams, force).catch(() => null);

      // Start history fetch immediately (uses "today" as default date)
      // We don't wait for dates to finish — use the location's current date as best guess
      const todayLocal = todayInTimeZone(locationParams.timeZone);
      const currentYear = todayLocal.slice(0, 4);

      const historyPromise = fetchLocationHistoryCharts(
        locationParams, todayLocal, todayLocal, currentYear, "population", force
      ).catch(() => null);

      const [dates, insights, popHistory] = await Promise.all([
        datesPromise, insightsPromise, historyPromise,
      ]);

      if (dates.length > 0) {
        datesCache.current.set(credKey, dates);
      }
      if (insights) {
        insightsCache.current.set(credKey, insights);
      }
      if (popHistory) {
        // Must mirror useAggregatedHistory's histKey format for prefetch hits
        const histKey = `${credKey}:${locationParams.timeZone ?? "browser"}:${todayLocal}:${todayLocal}:${currentYear}:population`;
        historyCache.current.set(histKey, popHistory);
      }
    } catch (error) {
      logError(`Failed to prefetch data for ${credKey}:`, error);
    }
  }, []);

  // Main prefetch orchestration — single pass over location sets
  const runPrefetch = useCallback(async (force: boolean) => {
    const credSets = buildCredentialSets();
    if (credSets.length === 0) return;

    await Promise.all(
      credSets.map(({ credKey, locationParams }) =>
        prefetchForCredSet(credKey, locationParams, force)
      )
    );
    setCacheVersion((v) => v + 1);
  }, [buildCredentialSets, prefetchForCredSet]);

  // Initial prefetch once devices and locations are loaded
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (devicesLoading || locationsLoading) return;
    if (devices.length === 0) return;
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    runPrefetch(false);
  }, [devicesLoading, locationsLoading, devices.length, runPrefetch]);

  // 30-second background refresh (skip when tab is hidden)
  useEffect(() => {
    if (devicesLoading || locationsLoading) return;
    if (devices.length === 0) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      runPrefetch(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [devicesLoading, locationsLoading, devices.length, runPrefetch]);

  // Refresh immediately when tab becomes visible again
  const runPrefetchRef = useRef(runPrefetch);
  runPrefetchRef.current = runPrefetch;
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible" && hasInitialized.current) {
        runPrefetchRef.current(true);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // Re-prefetch when devices/locations change (new device added, etc.)
  const prevDeviceIdsRef = useRef<string>("");
  const prevLocationDeviceIdsRef = useRef<string>("");
  useEffect(() => {
    if (devicesLoading || locationsLoading) return;
    if (!hasInitialized.current) return;

    const deviceIdsKey = devices.map((d) => d.deviceId).sort().join(",");
    const locationDeviceIdsKey = locations.map((l) => l.deviceIds.sort().join(":")).join(",");

    if (
      deviceIdsKey !== prevDeviceIdsRef.current ||
      locationDeviceIdsKey !== prevLocationDeviceIdsRef.current
    ) {
      prevDeviceIdsRef.current = deviceIdsKey;
      prevLocationDeviceIdsRef.current = locationDeviceIdsKey;
      runPrefetch(false);
    }
  }, [devices, locations, devicesLoading, locationsLoading, runPrefetch]);

  return (
    <DataCacheContext.Provider
      value={{
        cacheVersion,
        getCachedInsights,
        setCachedInsights,
        getCachedDates,
        setCachedDates,
        getCachedHistory,
        setCachedHistory,
        getCachedPOSTransactions,
        setCachedPOSTransactions,
      }}
    >
      {children}
    </DataCacheContext.Provider>
  );
}

export function useDataCache() {
  const context = useContext(DataCacheContext);
  if (context === undefined) {
    throw new Error("useDataCache must be used within a DataCacheProvider");
  }
  return context;
}
