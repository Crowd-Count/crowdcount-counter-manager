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
  fetchLocationInsights,
  fetchLocationAvailableDates,
  fetchLocationHistoryCharts,
  makeCredKey,
  type DeviceCredentials,
  type InsightsCacheEntry,
  type HistoryCacheEntry,
  type LocationFetchParams,
} from "@/lib/dataFetchers";
import * as api from "@/lib/api";

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
  const buildCredentialSets = useCallback((): {
    credKey: string;
    credentials: DeviceCredentials[];
    locationParams?: LocationFetchParams;
  }[] => {
    const sets: {
      credKey: string;
      credentials: DeviceCredentials[];
      locationParams?: LocationFetchParams;
    }[] = [];
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

    // Each location — use location-level server endpoints
    for (const location of locations) {
      const locCreds = api.getLocationCredentials(location, devices);
      if (!locCreds) continue;
      const locKey = `loc:${location.id}`;
      if (!seen.has(locKey)) {
        seen.add(locKey);
        sets.push({
          credKey: locKey,
          credentials: locCreds.credentials.map((c) => ({ deviceId: c.device_id, password: c.password })),
          locationParams: {
            locationId: location.id,
            credentials: locCreds.credentials,
            signingDevice: locCreds.signingDevice,
          },
        });
      }
    }

    return sets;
  }, [devices, locations]);

  // Pre-fetch all data for a credential set
  const prefetchForCredSet = useCallback(async (
    credKey: string,
    credentials: DeviceCredentials[],
    force: boolean,
    locationParams?: LocationFetchParams
  ) => {
    try {
      // Fetch dates + insights in parallel
      const [dates, insights] = await Promise.all([
        locationParams
          ? fetchLocationAvailableDates(locationParams, force).catch(() => [] as string[])
          : fetchAvailableDates(credentials, force).catch(() => [] as string[]),
        locationParams
          ? fetchLocationInsights(locationParams, force).catch(() => null)
          : fetchInsightsForCredentials(credentials, force).catch(() => null),
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
          locationParams
            ? fetchLocationHistoryCharts(locationParams, mostRecent, mostRecent, year, "population", force).catch(() => null)
            : fetchHistoryCharts(credentials, mostRecent, mostRecent, year, "population", force).catch(() => null),
          locationParams
            ? fetchLocationHistoryCharts(locationParams, mostRecent, mostRecent, year, "entries", force).catch(() => null)
            : fetchHistoryCharts(credentials, mostRecent, mostRecent, year, "entries", force).catch(() => null),
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

    // Phase 1: Individual devices first — populates apiCache per-device
    const individuals = credSets.filter((s) => !s.locationParams && s.credentials.length === 1);
    const locationSets = credSets.filter((s) => !!s.locationParams);

    if (individuals.length > 0) {
      await Promise.all(
        individuals.map(({ credKey, credentials }) =>
          prefetchForCredSet(credKey, credentials, force)
        )
      );
      // Notify hooks so single-device pages update immediately
      setCacheVersion((v) => v + 1);
    }

    // Phase 2: Location-level data — uses server-side aggregation
    if (locationSets.length > 0) {
      await Promise.all(
        locationSets.map(({ credKey, credentials, locationParams }) =>
          prefetchForCredSet(credKey, credentials, force, locationParams)
        )
      );
      setCacheVersion((v) => v + 1);
    }
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
