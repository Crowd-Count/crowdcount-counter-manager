"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import * as api from "@/lib/api";

export interface ChartData {
  label: string;
  value: number;
  average?: number;
}

export interface DeviceCredentials {
  deviceId: string;
  password: string;
}

export interface AggregatedHistoryResult {
  availableDates: string[];
  isLoadingDates: boolean;
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

export function useAggregatedHistory(
  credentials: DeviceCredentials[]
): AggregatedHistoryResult {
  // Store stable credentials to prevent re-fetching when device state updates from polling
  const credentialsRef = useRef<DeviceCredentials[]>([]);
  if (credentials.length > 0 && credentialsRef.current.length === 0) {
    credentialsRef.current = credentials;
  }
  const stableCredentials = credentialsRef.current;

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

  // Load aggregated day data
  const loadDayData = useCallback(async () => {
    if (stableCredentials.length === 0 || !selectedDate) return;
    setIsLoadingDay(true);
    try {
      const allData = await Promise.all(
        stableCredentials.map(async (cred) => {
          try {
            const [data, avgData] = await Promise.all([
              api.getDayData(cred.deviceId, cred.password, selectedDate),
              api.getAverageDayData(cred.deviceId, cred.password, selectedDate),
            ]);
            return { data, avgData };
          } catch {
            return { data: {}, avgData: {} };
          }
        })
      );

      const chartData: ChartData[] = [];
      for (let hour = 0; hour < 24; hour++) {
        const hourStr = hour.toString();
        let totalValue = 0;
        let totalAverage = 0;
        allData.forEach(({ data, avgData }) => {
          totalValue += data[hourStr] || 0;
          totalAverage += avgData[hourStr] || 0;
        });
        chartData.push({
          label: `${hour}:00`,
          value: totalValue,
          average: totalAverage,
        });
      }
      setDayData(chartData);
    } catch (error) {
      console.error("Failed to load day data:", error);
      setDayData([]);
    } finally {
      setIsLoadingDay(false);
    }
  }, [stableCredentials, selectedDate]);

  useEffect(() => {
    if (stableCredentials.length > 0 && selectedDate) {
      loadDayData();
    }
  }, [stableCredentials, selectedDate, loadDayData]);

  // Load aggregated week data
  const loadWeekData = useCallback(async () => {
    if (stableCredentials.length === 0 || !selectedWeekDate) return;
    setIsLoadingWeek(true);
    try {
      const allData = await Promise.all(
        stableCredentials.map(async (cred) => {
          try {
            const [data, avgData] = await Promise.all([
              api.getWeekData(cred.deviceId, cred.password, selectedWeekDate),
              api.getAverageWeekData(
                cred.deviceId,
                cred.password,
                selectedWeekDate
              ),
            ]);
            return { data, avgData };
          } catch {
            return { data: {}, avgData: {} };
          }
        })
      );

      const daysOfWeek = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];

      const chartData: ChartData[] = daysOfWeek.map((day) => {
        let totalValue = 0;
        let totalAverage = 0;
        allData.forEach(({ data, avgData }) => {
          totalValue += data[day] || 0;
          totalAverage += avgData[day] || 0;
        });
        return {
          label: day.substring(0, 3),
          value: totalValue,
          average: totalAverage,
        };
      });

      setWeekData(chartData);
    } catch (error) {
      console.error("Failed to load week data:", error);
      setWeekData([]);
    } finally {
      setIsLoadingWeek(false);
    }
  }, [stableCredentials, selectedWeekDate]);

  useEffect(() => {
    if (stableCredentials.length > 0 && selectedWeekDate) {
      loadWeekData();
    }
  }, [stableCredentials, selectedWeekDate, loadWeekData]);

  // Load aggregated year data
  const loadYearData = useCallback(async () => {
    if (stableCredentials.length === 0 || !selectedYear) return;
    setIsLoadingYear(true);
    try {
      const yearNum = parseInt(selectedYear, 10);
      const allData = await Promise.all(
        stableCredentials.map(async (cred) => {
          try {
            const [data, avgData] = await Promise.all([
              api.getYearData(cred.deviceId, cred.password, yearNum),
              api.getAverageYearData(cred.deviceId, cred.password, yearNum),
            ]);
            return { data, avgData };
          } catch {
            return { data: {}, avgData: null };
          }
        })
      );

      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      const chartData: ChartData[] = months.map((month) => {
        let totalValue = 0;
        let totalAverage = 0;
        allData.forEach(({ data, avgData }) => {
          totalValue += data[month] || 0;
          if (avgData) {
            totalAverage += avgData[month] || 0;
          }
        });
        return {
          label: month.substring(0, 3),
          value: totalValue,
          average: totalAverage,
        };
      });

      setYearData(chartData);
    } catch (error) {
      console.error("Failed to load year data:", error);
      setYearData([]);
    } finally {
      setIsLoadingYear(false);
    }
  }, [stableCredentials, selectedYear]);

  useEffect(() => {
    if (stableCredentials.length > 0 && selectedYear) {
      loadYearData();
    }
  }, [stableCredentials, selectedYear, loadYearData]);

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
