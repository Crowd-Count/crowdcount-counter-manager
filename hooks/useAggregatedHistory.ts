"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import * as api from "@/lib/api";
import { getLocalDayUTCBounds, shiftDayDataToLocal } from "@/lib/timezone";

export interface ChartData {
  label: string;
  value: number;
  average?: number;
}

export interface DeviceCredentials {
  deviceId: string;
  password: string;
}

export type DataType = "population" | "entries";

export interface AggregatedHistoryResult {
  availableDates: string[];
  isLoadingDates: boolean;
  // Data type toggle
  dataType: DataType;
  setDataType: (type: DataType) => void;
  // Day
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  dayData: ChartData[];
  isLoadingDay: boolean;
  // Week
  selectedWeekDate: string;
  setSelectedWeekDate: (date: string) => void;
  weekData: ChartData[];
  isLoadingWeek: boolean;
  // Year
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  yearData: ChartData[];
  isLoadingYear: boolean;
  availableYears: string[];
}

// Helper to build day chart from already-shifted local-hour data across devices
function buildDayChart(
  allData: { data: Record<string, number>; avgData: Record<string, number> }[]
): ChartData[] {
  const chartData: ChartData[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourStr = hour.toString();
    let totalValue = 0;
    let totalAverage = 0;
    allData.forEach(({ data, avgData }) => {
      totalValue += data[hourStr] || 0;
      totalAverage += avgData[hourStr] || 0;
    });
    chartData.push({ label: `${hour}:00`, value: totalValue, average: totalAverage });
  }
  return chartData;
}

// Helper to aggregate week data across devices
function buildWeekChart(
  allData: { data: Record<string, number>; avgData: Record<string, number> }[]
): ChartData[] {
  const daysOfWeek = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
  ];
  return daysOfWeek.map((day) => {
    let totalValue = 0;
    let totalAverage = 0;
    allData.forEach(({ data, avgData }) => {
      totalValue += data[day] || 0;
      totalAverage += avgData[day] || 0;
    });
    return { label: day.substring(0, 3), value: totalValue, average: totalAverage };
  });
}

// Helper to aggregate year data across devices
function buildYearChart(
  allData: { data: Record<string, number>; avgData: Record<string, number> | null }[]
): ChartData[] {
  const months = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December",
  ];
  return months.map((month) => {
    let totalValue = 0;
    let totalAverage = 0;
    allData.forEach(({ data, avgData }) => {
      totalValue += data[month] || 0;
      if (avgData) totalAverage += avgData[month] || 0;
    });
    return { label: month.substring(0, 3), value: totalValue, average: totalAverage };
  });
}

export function useAggregatedHistory(
  credentials: DeviceCredentials[]
): AggregatedHistoryResult {
  // Store stable credentials to prevent re-fetching when device state updates from polling
  const credentialsRef = useRef<DeviceCredentials[]>([]);
  if (credentials.length > 0 && credentialsRef.current.length === 0) {
    credentialsRef.current = credentials;
  }
  const stableCredentials = credentialsRef.current;

  const [dataType, setDataType] = useState<DataType>("population");

  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isLoadingDates, setIsLoadingDates] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dayData, setDayData] = useState<ChartData[]>([]);
  const [isLoadingDay, setIsLoadingDay] = useState(false);

  const [selectedWeekDate, setSelectedWeekDate] = useState<string>("");
  const [weekData, setWeekData] = useState<ChartData[]>([]);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);

  const [selectedYear, setSelectedYear] = useState<string>("");
  const [yearData, setYearData] = useState<ChartData[]>([]);
  const [isLoadingYear, setIsLoadingYear] = useState(false);

  // Load available dates (union across all devices)
  const loadAvailableDates = useCallback(async () => {
    if (stableCredentials.length === 0) return;
    setIsLoadingDates(true);
    try {
      const allDatesArrays = await Promise.all(
        stableCredentials.map((cred) =>
          api.getAvailableDates(cred.deviceId, cred.password)
        )
      );
      const allDatesSet = new Set<string>();
      allDatesArrays.forEach((dates) => {
        dates.forEach((date) => allDatesSet.add(date));
      });
      const dates = Array.from(allDatesSet).sort();
      setAvailableDates(dates);

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
  }, [stableCredentials]);

  useEffect(() => {
    if (stableCredentials.length > 0) {
      loadAvailableDates();
    }
  }, [stableCredentials, loadAvailableDates]);

  // Load chart data — fetch devices sequentially to avoid browser connection limits
  // Day data is timezone-shifted: we treat the selected date as a local date,
  // compute the two UTC dates that span it, and merge into local hours.
  useEffect(() => {
    if (stableCredentials.length === 0 || !selectedDate || !selectedWeekDate || !selectedYear) return;

    let cancelled = false;

    const getDayFn = dataType === "entries" ? api.getEntryDayData : api.getDayData;
    const getAvgDayFn = dataType === "entries" ? api.getAverageEntryDayData : api.getAverageDayData;
    const getWeekFn = dataType === "entries" ? api.getEntryWeekData : api.getWeekData;
    const getAvgWeekFn = dataType === "entries" ? api.getAverageEntryWeekData : api.getAverageWeekData;
    const getYearFn = dataType === "entries" ? api.getEntryYearData : api.getYearData;
    const getAvgYearFn = dataType === "entries" ? api.getAverageEntryYearData : api.getAverageYearData;

    setIsLoadingDay(true);
    setIsLoadingWeek(true);
    setIsLoadingYear(true);

    const yearNum = parseInt(selectedYear, 10);

    // Compute UTC bounds for the selected local day
    const { utcDate1, utcDate2, utcMinutesAtMidnight } = getLocalDayUTCBounds(selectedDate);
    const needsSecondDate = utcDate1 !== utcDate2;

    // Fetch all data for one device at a time (sequential) to stay within browser's 6-connection limit
    async function fetchAll() {
      const dayResults: { data: Record<string, number>; avgData: Record<string, number> }[] = [];
      const weekResults: { data: Record<string, number>; avgData: Record<string, number> }[] = [];
      const yearResults: { data: Record<string, number>; avgData: Record<string, number> | null }[] = [];

      for (const cred of stableCredentials) {
        if (cancelled) return;
        const [dayD1, dayAvg1, dayD2, dayAvg2, weekD, weekAvg, yearD, yearAvg] = await Promise.all([
          getDayFn(cred.deviceId, cred.password, utcDate1).catch(() => ({})),
          getAvgDayFn(cred.deviceId, cred.password, utcDate1).catch(() => ({})),
          needsSecondDate ? getDayFn(cred.deviceId, cred.password, utcDate2).catch(() => ({})) : Promise.resolve({}),
          needsSecondDate ? getAvgDayFn(cred.deviceId, cred.password, utcDate2).catch(() => ({})) : Promise.resolve({}),
          getWeekFn(cred.deviceId, cred.password, selectedWeekDate).catch(() => ({})),
          getAvgWeekFn(cred.deviceId, cred.password, selectedWeekDate).catch(() => ({})),
          getYearFn(cred.deviceId, cred.password, yearNum).catch(() => ({})),
          getAvgYearFn(cred.deviceId, cred.password, yearNum).catch(() => null),
        ]);
        // Shift day data from UTC to local hours
        dayResults.push({
          data: shiftDayDataToLocal(dayD1, dayD2, utcMinutesAtMidnight),
          avgData: shiftDayDataToLocal(dayAvg1, dayAvg2 as Record<string, number>, utcMinutesAtMidnight),
        });
        weekResults.push({ data: weekD, avgData: weekAvg });
        yearResults.push({ data: yearD, avgData: yearAvg ?? {} });
      }

      if (cancelled) return;
      setDayData(buildDayChart(dayResults));
      setWeekData(buildWeekChart(weekResults));
      setYearData(buildYearChart(yearResults));
    }

    fetchAll()
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
  }, [stableCredentials, selectedDate, selectedWeekDate, selectedYear, dataType]);

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
