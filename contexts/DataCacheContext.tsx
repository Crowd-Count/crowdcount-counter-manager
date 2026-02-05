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
  fetchInsightsForCredentials,
  fetchAvailableDates,
  fetchHistoryCharts,
  makeCredKey,
  type DeviceCredentials,
  type InsightsCacheEntry,
  type HistoryCacheEntry,
} from "@/lib/dataFetchers";

interface DataCacheContextType {
  cacheVersion: number;
  getCachedInsights(credKey: string): InsightsCacheEntry | null;
  setCachedInsights(credKey: string, data: InsightsCacheEntry): void;
  getCachedDates(credKey: string): string[] | null;
  setCachedDates(credKey: string, dates: string[]): void;
  getCachedHistory(cacheKey: string): HistoryCacheEntry | null;
  setCachedHistory(cacheKey: string, data: HistoryCacheEntry): void;
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

  // Build all credential sets that need pre-fetching
  const buildCredentialSets = useCallback((): { credKey: string; credentials: DeviceCredentials[] }[] => {
    const sets: { credKey: string; credentials: DeviceCredentials[] }[] = [];
    const seen = new Set<string>();

    // Each individual device
    for (const device of devices) {
      const creds: DeviceCredentials[] = [{ deviceId: device.deviceId, password: device.password }];
      const key = makeCredKey(creds);
      if (!seen.has(key)) {
        seen.add(key);
        sets.push({ credKey: key, credentials: creds });
      }
    }

    // Each location's devices
    for (const location of locations) {
      const memberDevices = devices.filter((d) => location.deviceIds.includes(d.id));
      if (memberDevices.length === 0) continue;
      const creds: DeviceCredentials[] = memberDevices.map((d) => ({
        deviceId: d.deviceId,
        password: d.password,
      }));
      const key = makeCredKey(creds);
      if (!seen.has(key)) {
        seen.add(key);
        sets.push({ credKey: key, credentials: creds });
      }
    }

    // All-devices aggregate (if 2+ devices)
    if (devices.length >= 2) {
      const creds: DeviceCredentials[] = devices.map((d) => ({
        deviceId: d.deviceId,
        password: d.password,
      }));
      const key = makeCredKey(creds);
      if (!seen.has(key)) {
        seen.add(key);
        sets.push({ credKey: key, credentials: creds });
      }
    }

    return sets;
  }, [devices, locations]);

  // Pre-fetch all data for a credential set
  const prefetchForCredSet = useCallback(async (
    credKey: string,
    credentials: DeviceCredentials[],
    force: boolean
  ) => {
    try {
      // Fetch dates + insights in parallel
      const [dates, insights] = await Promise.all([
        fetchAvailableDates(credentials, force).catch(() => [] as string[]),
        fetchInsightsForCredentials(credentials, force).catch(() => null),
      ]);

      datesCache.current.set(credKey, dates);
      if (insights) {
        insightsCache.current.set(credKey, insights);
      }

      // Fetch default history for the most recent date
      if (dates.length > 0) {
        const mostRecent = dates[dates.length - 1];
        const year = mostRecent.split("-")[0];

        // Fetch both population and entries in parallel
        const [popHistory, entryHistory] = await Promise.all([
          fetchHistoryCharts(credentials, mostRecent, mostRecent, year, "population", force).catch(() => null),
          fetchHistoryCharts(credentials, mostRecent, mostRecent, year, "entries", force).catch(() => null),
        ]);

        if (popHistory) {
          const histKey = `${credKey}:${mostRecent}:${mostRecent}:${year}:population`;
          historyCache.current.set(histKey, popHistory);
        }
        if (entryHistory) {
          const histKey = `${credKey}:${mostRecent}:${mostRecent}:${year}:entries`;
          historyCache.current.set(histKey, entryHistory);
        }
      }
    } catch (error) {
      console.error(`Failed to prefetch data for ${credKey}:`, error);
    }
  }, []);

  // Main prefetch orchestration
  const runPrefetch = useCallback(async (force: boolean) => {
    const credSets = buildCredentialSets();
    if (credSets.length === 0) return;

    // Fetch all credential sets in parallel
    await Promise.all(
      credSets.map(({ credKey, credentials }) =>
        prefetchForCredSet(credKey, credentials, force)
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

  // 30-second background refresh
  useEffect(() => {
    if (devicesLoading || locationsLoading) return;
    if (devices.length === 0) return;

    const interval = setInterval(() => {
      runPrefetch(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [devicesLoading, locationsLoading, devices.length, runPrefetch]);

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
