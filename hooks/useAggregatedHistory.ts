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
import { formatLocalDate } from "@/lib/timezone";
import { logError } from "@/lib/logger";

/** Strip any dates after today's local date (belt-and-suspenders for timezone edge cases) */
function filterFutureDates(dates: string[]): string[] {
  const today = formatLocalDate();
  return dates.filter((d) => d <= today);
}

/** Get the Monday (YYYY-MM-DD) of the week containing a given date string */
function getMondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + mondayOffset);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
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
  locationParams?: LocationFetchParams
): AggregatedHistoryResult {
  const credentialsRef = useRef<DeviceCredentials[]>([]);
  if (credentials.length > 0 && credentialsRef.current.length === 0) {
    credentialsRef.current = credentials;
  }
  const stableCredentials = credentialsRef.current;

  const locationParamsRef = useRef<LocationFetchParams | undefined>(undefined);
  if (locationParams && !locationParamsRef.current) {
    locationParamsRef.current = locationParams;
  }
  const stableLocationParams = locationParamsRef.current;

  const {
    cacheVersion,
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

  // Check dates cache synchronously — only use non-empty cached dates, strip future
  const rawCachedDates = credKey ? getCachedDates(credKey) : null;
  const filteredCachedDates = rawCachedDates ? filterFutureDates(rawCachedDates) : null;
  const initialDates = filteredCachedDates && filteredCachedDates.length > 0 ? filteredCachedDates : null;

  const [dataType, setDataType] = useState<DataType>("entries");
  const [availableDates, setAvailableDates] = useState<string[]>(initialDates ?? []);
  const [isLoadingDates, setIsLoadingDates] = useState(!initialDates && hasData);

  // Compute initial date selections from cached dates
  const initialMostRecent = initialDates ? initialDates[initialDates.length - 1] : "";
  const initialYear = initialMostRecent ? initialMostRecent.split("-")[0] : "";
  const initialWeekMonday = initialMostRecent ? getMondayOfWeek(initialMostRecent) : "";

  const [selectedDate, setSelectedDate] = useState<string>(initialMostRecent);
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(initialWeekMonday);
  const [selectedYear, setSelectedYear] = useState<string>(initialYear);

  // Check history cache for default params
  const initialHistKey = credKey && initialMostRecent && initialYear
    ? `${credKey}:${initialMostRecent}:${initialMostRecent}:${initialYear}:population`
    : "";
  const initialHistory = initialHistKey ? getCachedHistory(initialHistKey) : null;

  const [dayData, setDayData] = useState<ChartData[]>(initialHistory?.dayData ?? []);
  const [isLoadingDay, setIsLoadingDay] = useState(!initialHistory && hasData);
  const [weekData, setWeekData] = useState<ChartData[]>(initialHistory?.weekData ?? []);
  const [isLoadingWeek, setIsLoadingWeek] = useState(!initialHistory && hasData);
  const [yearData, setYearData] = useState<ChartData[]>(initialHistory?.yearData ?? []);
  const [isLoadingYear, setIsLoadingYear] = useState(!initialHistory && hasData);

  // Track whether initial fetches have been done
  const datesFetched = useRef(!!initialDates);
  const chartsFetched = useRef(!!initialHistory);

  // Load available dates
  const loadAvailableDates = useCallback(async () => {
    if (!hasData) return;
    if (datesFetched.current) return;

    setIsLoadingDates(true);
    try {
      const rawDates = stableLocationParams
        ? await fetchLocationAvailableDates(stableLocationParams)
        : await fetchAvailableDates(stableCredentials);
      const dates = filterFutureDates(rawDates);
      datesFetched.current = true;
      setAvailableDates(dates);
      if (dates.length > 0) {
        setCachedDates(credKey, dates);
      }

      if (dates.length > 0) {
        const mostRecent = dates[dates.length - 1];
        setSelectedDate(mostRecent);
        setSelectedWeekDate(getMondayOfWeek(mostRecent));
        const year = mostRecent.split("-")[0];
        setSelectedYear(year);
      }
    } catch (error) {
      logError("Failed to load dates:", error);
    } finally {
      setIsLoadingDates(false);
    }
  }, [stableCredentials, stableLocationParams, credKey, hasData, setCachedDates]);

  useEffect(() => {
    if (hasData && !datesFetched.current) {
      loadAvailableDates();
    }
  }, [hasData, loadAvailableDates]);

  // Load chart data — check cache first, then fetch
  useEffect(() => {
    if (!hasData || !selectedDate || !selectedWeekDate || !selectedYear) return;

    const histKey = `${credKey}:${selectedDate}:${selectedWeekDate}:${selectedYear}:${dataType}`;

    // Check cache
    const cached = getCachedHistory(histKey);
    if (cached) {
      setDayData(cached.dayData);
      setWeekData(cached.weekData);
      setYearData(cached.yearData);
      setIsLoadingDay(false);
      setIsLoadingWeek(false);
      setIsLoadingYear(false);
      chartsFetched.current = true;
      return;
    }

    let cancelled = false;
    setIsLoadingDay(true);
    setIsLoadingWeek(true);
    setIsLoadingYear(true);

    const fetchPromise = stableLocationParams
      ? fetchLocationHistoryCharts(stableLocationParams, selectedDate, selectedWeekDate, selectedYear, dataType)
      : fetchHistoryCharts(stableCredentials, selectedDate, selectedWeekDate, selectedYear, dataType);

    fetchPromise
      .then((result) => {
        if (cancelled) return;
        chartsFetched.current = true;
        setDayData(result.dayData);
        setWeekData(result.weekData);
        setYearData(result.yearData);
        setCachedHistory(histKey, result);
      })
      .catch((error) => {
        if (cancelled) return;
        logError("Failed to load chart data:", error);
        setDayData([]);
        setWeekData([]);
        setYearData([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingDay(false);
        setIsLoadingWeek(false);
        setIsLoadingYear(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stableCredentials, stableLocationParams, selectedDate, selectedWeekDate, selectedYear, dataType, credKey, hasData, getCachedHistory, setCachedHistory]);

  // Silently update when cacheVersion changes (background refresh)
  useEffect(() => {
    if (!credKey || cacheVersion === 0) return;

    // Update dates — filter future dates as safety net
    const cachedDates = getCachedDates(credKey);
    if (cachedDates) {
      setAvailableDates(filterFutureDates(cachedDates));
      datesFetched.current = true;
      setIsLoadingDates(false);
    }

    // Update current chart data
    if (selectedDate && selectedWeekDate && selectedYear) {
      const histKey = `${credKey}:${selectedDate}:${selectedWeekDate}:${selectedYear}:${dataType}`;
      const cachedHist = getCachedHistory(histKey);
      if (cachedHist) {
        setDayData(cachedHist.dayData);
        setWeekData(cachedHist.weekData);
        setYearData(cachedHist.yearData);
        chartsFetched.current = true;
        setIsLoadingDay(false);
        setIsLoadingWeek(false);
        setIsLoadingYear(false);
      }
    }
  }, [cacheVersion, credKey, getCachedDates, getCachedHistory, selectedDate, selectedWeekDate, selectedYear, dataType]);

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
