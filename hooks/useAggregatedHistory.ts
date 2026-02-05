"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useDataCache } from "@/contexts/DataCacheContext";
import {
  fetchAvailableDates,
  fetchHistoryCharts,
  makeCredKey,
  type ChartData,
  type DeviceCredentials,
  type DataType,
} from "@/lib/dataFetchers";

export type { ChartData, DeviceCredentials, DataType } from "@/lib/dataFetchers";

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
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  yearData: ChartData[];
  isLoadingYear: boolean;
  availableYears: string[];
}

export function useAggregatedHistory(
  credentials: DeviceCredentials[]
): AggregatedHistoryResult {
  const credentialsRef = useRef<DeviceCredentials[]>([]);
  if (credentials.length > 0 && credentialsRef.current.length === 0) {
    credentialsRef.current = credentials;
  }
  const stableCredentials = credentialsRef.current;

  const {
    cacheVersion,
    getCachedDates,
    setCachedDates,
    getCachedHistory,
    setCachedHistory,
  } = useDataCache();

  const credKey = stableCredentials.length > 0 ? makeCredKey(stableCredentials) : "";

  // Check dates cache synchronously
  const initialDates = credKey ? getCachedDates(credKey) : null;

  const [dataType, setDataType] = useState<DataType>("population");
  const [availableDates, setAvailableDates] = useState<string[]>(initialDates ?? []);
  const [isLoadingDates, setIsLoadingDates] = useState(!initialDates && stableCredentials.length > 0);

  // Compute initial date selections from cached dates
  const initialMostRecent = initialDates && initialDates.length > 0 ? initialDates[initialDates.length - 1] : "";
  const initialYear = initialMostRecent ? initialMostRecent.split("-")[0] : "";

  const [selectedDate, setSelectedDate] = useState<string>(initialMostRecent);
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(initialMostRecent);
  const [selectedYear, setSelectedYear] = useState<string>(initialYear);

  // Check history cache for default params
  const initialHistKey = credKey && initialMostRecent && initialYear
    ? `${credKey}:${initialMostRecent}:${initialMostRecent}:${initialYear}:population`
    : "";
  const initialHistory = initialHistKey ? getCachedHistory(initialHistKey) : null;

  const [dayData, setDayData] = useState<ChartData[]>(initialHistory?.dayData ?? []);
  const [isLoadingDay, setIsLoadingDay] = useState(!initialHistory && stableCredentials.length > 0);
  const [weekData, setWeekData] = useState<ChartData[]>(initialHistory?.weekData ?? []);
  const [isLoadingWeek, setIsLoadingWeek] = useState(!initialHistory && stableCredentials.length > 0);
  const [yearData, setYearData] = useState<ChartData[]>(initialHistory?.yearData ?? []);
  const [isLoadingYear, setIsLoadingYear] = useState(!initialHistory && stableCredentials.length > 0);

  // Track whether initial fetches have been done
  const datesFetched = useRef(!!initialDates);
  const chartsFetched = useRef(!!initialHistory);

  // Load available dates
  const loadAvailableDates = useCallback(async () => {
    if (stableCredentials.length === 0) return;
    if (datesFetched.current) return;

    setIsLoadingDates(true);
    try {
      const dates = await fetchAvailableDates(stableCredentials);
      datesFetched.current = true;
      setAvailableDates(dates);
      setCachedDates(credKey, dates);

      if (dates.length > 0) {
        const mostRecent = dates[dates.length - 1];
        setSelectedDate(mostRecent);
        setSelectedWeekDate(mostRecent);
        const year = mostRecent.split("-")[0];
        setSelectedYear(year);
      }
    } catch (error) {
      console.error("Failed to load dates:", error);
    } finally {
      setIsLoadingDates(false);
    }
  }, [stableCredentials, credKey, setCachedDates]);

  useEffect(() => {
    if (stableCredentials.length > 0 && !datesFetched.current) {
      loadAvailableDates();
    }
  }, [stableCredentials, loadAvailableDates]);

  // Load chart data — check cache first, then fetch
  useEffect(() => {
    if (stableCredentials.length === 0 || !selectedDate || !selectedWeekDate || !selectedYear) return;

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

    fetchHistoryCharts(stableCredentials, selectedDate, selectedWeekDate, selectedYear, dataType)
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
        console.error("Failed to load chart data:", error);
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
  }, [stableCredentials, selectedDate, selectedWeekDate, selectedYear, dataType, credKey, getCachedHistory, setCachedHistory]);

  // Silently update when cacheVersion changes (background refresh)
  useEffect(() => {
    if (!credKey || cacheVersion === 0) return;

    // Update dates
    const cachedDates = getCachedDates(credKey);
    if (cachedDates) {
      setAvailableDates(cachedDates);
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
    selectedYear,
    setSelectedYear,
    yearData,
    isLoadingYear,
    availableYears,
  };
}
