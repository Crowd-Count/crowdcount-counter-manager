"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useDataCache } from "@/contexts/DataCacheContext";
import {
  fetchAvailableDates,
  fetchLocationAvailableDates,
  fetchHistoryCharts,
  fetchLocationHistoryCharts,
  makeCredKey,
  type ChartData,
  type DeviceCredentials,
  type DataType,
  type LocationFetchParams,
} from "@/lib/dataFetchers";
import { todayInTimeZone } from "@/lib/timezone";
import { logError } from "@/lib/logger";

/** Strip any dates after today's date in the display zone (belt-and-suspenders for timezone edge cases) */
function filterFutureDates(dates: string[], timeZone?: string): string[] {
  const today = todayInTimeZone(timeZone);
  return dates.filter((d) => d <= today);
}

/** Get the Monday (YYYY-MM-DD) of the week containing a given date string (pure civil-date math) */
function getMondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Derive unique week Mondays from available dates, sorted ascending */
function deriveAvailableWeeks(dates: string[]): string[] {
  const mondays = new Set<string>();
  for (const d of dates) {
    mondays.add(getMondayOfWeek(d));
  }
  return Array.from(mondays).sort();
}

export type { ChartData, DeviceCredentials, DataType, LocationFetchParams } from "@/lib/dataFetchers";

export interface AggregatedHistoryResult {
  availableDates: string[];
  isLoadingDates: boolean;
  dataType: DataType;
  setDataType: (type: DataType) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  dayData: ChartData[];
  isLoadingDay: boolean;
  selectedWeekDate: string;
  setSelectedWeekDate: (date: string) => void;
  weekData: ChartData[];
  isLoadingWeek: boolean;
  /** Available weeks as Monday dates (YYYY-MM-DD), most recent last */
  availableWeeks: string[];
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  yearData: ChartData[];
  isLoadingYear: boolean;
  availableYears: string[];
}

export function useAggregatedHistory(
  credentials: DeviceCredentials[],
  locationParams?: LocationFetchParams,
  timeZone?: string
): AggregatedHistoryResult {
  // Latch the first non-empty value of each input (useState + render-phase
  // adjustment — the compiler-legal version of the previous ref-during-render
  // latch; the committed output is identical).
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

  const [latchedTz, setLatchedTz] = useState<string | undefined>(timeZone);
  if (timeZone && !latchedTz) {
    setLatchedTz(timeZone);
  }
  // Display zone: the location's own timezone when pinned, browser tz otherwise
  const tz = stableLocationParams?.timeZone ?? latchedTz;

  const {
    getCachedDates,
    setCachedDates,
    getCachedHistory,
    setCachedHistory,
  } = useDataCache();

  // Use location ID as the cred key when available, otherwise device-based
  const credKey = stableLocationParams
    ? `loc:${stableLocationParams.locationId}`
    : stableCredentials.length > 0
      ? makeCredKey(stableCredentials)
      : "";

  const hasData = !!stableLocationParams || stableCredentials.length > 0;

  // Dates come straight from the cache during render — the DataCache context
  // bumps cacheVersion (a state change) whenever entries land, so cache
  // updates (including background refreshes) arrive as ordinary re-renders.
  // Only non-empty cached dates are used, with future dates stripped.
  const rawCachedDates = credKey ? getCachedDates(credKey) : null;
  const filteredCachedDates = rawCachedDates ? filterFutureDates(rawCachedDates, tz) : null;
  const cachedDates =
    filteredCachedDates && filteredCachedDates.length > 0 ? filteredCachedDates : null;

  const [dataType, setDataType] = useState<DataType>("entries");
  const [fetchedDates, setFetchedDates] = useState<string[] | null>(null);
  const [datesSettled, setDatesSettled] = useState(false);

  const availableDates = cachedDates ?? fetchedDates ?? [];
  const isLoadingDates = hasData && !cachedDates && !fetchedDates && !datesSettled;

  const mostRecent = availableDates.length > 0 ? availableDates[availableDates.length - 1] : "";

  const [selectedDate, setSelectedDate] = useState<string>(mostRecent);
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(
    mostRecent ? getMondayOfWeek(mostRecent) : ""
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    mostRecent ? mostRecent.split("-")[0] : ""
  );

  // Default the selections once dates arrive (render-phase adjustment).
  if (mostRecent && !selectedDate) {
    setSelectedDate(mostRecent);
    setSelectedWeekDate(getMondayOfWeek(mostRecent));
    setSelectedYear(mostRecent.split("-")[0]);
  }

  // Guards the dates fetch across re-renders (only touched inside effects).
  const datesFetchStarted = useRef(false);

  // Load available dates when the cache has none
  const loadAvailableDates = useCallback(async () => {
    try {
      const rawDates = stableLocationParams
        ? await fetchLocationAvailableDates(stableLocationParams)
        : await fetchAvailableDates(stableCredentials, false, tz);
      const dates = filterFutureDates(rawDates, tz);
      setFetchedDates(dates);
      if (dates.length > 0) {
        setCachedDates(credKey, dates);
      }
    } catch (error) {
      logError("Failed to load dates:", error);
    } finally {
      setDatesSettled(true);
    }
  }, [stableCredentials, stableLocationParams, credKey, setCachedDates, tz]);

  useEffect(() => {
    if (!hasData || cachedDates || datesFetchStarted.current) return;
    datesFetchStarted.current = true;
    loadAvailableDates();
  }, [hasData, cachedDates, loadAvailableDates]);

  // Chart data: cache is consulted during render; the effect only fetches on
  // a miss. Cache writes bump the context version, so a completed fetch (or a
  // background refresh) re-renders straight into the cached branch.
  const histKey =
    hasData && selectedDate && selectedWeekDate && selectedYear
      ? `${credKey}:${tz ?? "browser"}:${selectedDate}:${selectedWeekDate}:${selectedYear}:${dataType}`
      : "";
  const cachedHist = histKey ? getCachedHistory(histKey) : null;

  const [fetchedCharts, setFetchedCharts] = useState<{
    key: string;
    dayData: ChartData[];
    weekData: ChartData[];
    yearData: ChartData[];
  } | null>(null);

  useEffect(() => {
    if (!histKey || cachedHist) return;
    if (fetchedCharts?.key === histKey) return;

    let cancelled = false;

    const fetchPromise = stableLocationParams
      ? fetchLocationHistoryCharts(stableLocationParams, selectedDate, selectedWeekDate, selectedYear, dataType)
      : fetchHistoryCharts(stableCredentials, selectedDate, selectedWeekDate, selectedYear, dataType, false, tz);

    fetchPromise
      .then((result) => {
        if (cancelled) return;
        setFetchedCharts({
          key: histKey,
          dayData: result.dayData,
          weekData: result.weekData,
          yearData: result.yearData,
        });
        setCachedHistory(histKey, result);
      })
      .catch((error) => {
        if (cancelled) return;
        logError("Failed to load chart data:", error);
        setFetchedCharts({ key: histKey, dayData: [], weekData: [], yearData: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [
    histKey,
    cachedHist,
    fetchedCharts,
    stableCredentials,
    stableLocationParams,
    selectedDate,
    selectedWeekDate,
    selectedYear,
    dataType,
    setCachedHistory,
    tz,
  ]);

  const chartsForKey = cachedHist ?? (fetchedCharts?.key === histKey ? fetchedCharts : null);
  const dayData = chartsForKey?.dayData ?? [];
  const weekData = chartsForKey?.weekData ?? [];
  const yearData = chartsForKey?.yearData ?? [];
  const isLoadingCharts = !!histKey && !chartsForKey;
  // The three chart panes load together (one fetch), so the flags coincide.
  const isLoadingDay = isLoadingCharts;
  const isLoadingWeek = isLoadingCharts;
  const isLoadingYear = isLoadingCharts;

  const availableWeeks = useMemo(
    () => deriveAvailableWeeks(availableDates),
    [availableDates]
  );

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    availableDates.forEach((date) => {
      years.add(date.split("-")[0]);
    });
    return Array.from(years).sort().reverse();
  }, [availableDates]);

  return {
    availableDates,
    isLoadingDates,
    dataType,
    setDataType,
    selectedDate,
    setSelectedDate,
    dayData,
    isLoadingDay,
    selectedWeekDate,
    setSelectedWeekDate,
    weekData,
    isLoadingWeek,
    availableWeeks,
    selectedYear,
    setSelectedYear,
    yearData,
    isLoadingYear,
    availableYears,
  };
}
