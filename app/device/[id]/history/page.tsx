"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HistoryChart } from "@/components/HistoryChart";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";

interface ChartData {
  label: string;
  value: number;
  average?: number;
}

// Format date string (YYYY-MM-DD) for display without timezone issues
function formatDateForDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString();
}

export default function HistoryPage() {
  const params = useParams();
  const deviceId = params.id as string;
  const { getDevice } = useDevices();
  const device = getDevice(deviceId);

  // Available dates
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isLoadingDates, setIsLoadingDates] = useState(true);

  // Day data
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dayData, setDayData] = useState<ChartData[]>([]);
  const [isLoadingDay, setIsLoadingDay] = useState(false);

  // Week data
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>("");
  const [weekData, setWeekData] = useState<ChartData[]>([]);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);

  // Year data
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [yearData, setYearData] = useState<ChartData[]>([]);
  const [isLoadingYear, setIsLoadingYear] = useState(false);

  // Load available dates
  const loadAvailableDates = useCallback(async () => {
    if (!device) return;
    setIsLoadingDates(true);
    try {
      const dates = await api.getAvailableDates(device.deviceId, device.password);
      setAvailableDates(dates);
      if (dates.length > 0) {
        // Set most recent date as default
        const mostRecent = dates[dates.length - 1];
        setSelectedDate(mostRecent);
        setSelectedWeekDate(mostRecent);
        // Extract year from most recent date
        const year = mostRecent.split("-")[0];
        setSelectedYear(year);
      }
    } catch (error) {
      console.error("Failed to load dates:", error);
    } finally {
      setIsLoadingDates(false);
    }
  }, [device]);

  useEffect(() => {
    if (device) {
      loadAvailableDates();
    }
  }, [device, loadAvailableDates]);

  // Load day data
  const loadDayData = useCallback(async () => {
    if (!device || !selectedDate) return;
    setIsLoadingDay(true);
    try {
      const [data, avgData] = await Promise.all([
        api.getDayData(device.deviceId, device.password, selectedDate),
        api.getAverageDayData(device.deviceId, device.password, selectedDate),
      ]);

      // Create chart data for each hour (0-23)
      const chartData: ChartData[] = [];
      for (let hour = 0; hour < 24; hour++) {
        const hourStr = hour.toString();
        chartData.push({
          label: `${hour}:00`,
          value: data[hourStr] || 0,
          average: avgData[hourStr] || 0,
        });
      }
      setDayData(chartData);
    } catch (error) {
      console.error("Failed to load day data:", error);
      setDayData([]);
    } finally {
      setIsLoadingDay(false);
    }
  }, [device, selectedDate]);

  useEffect(() => {
    if (device && selectedDate) {
      loadDayData();
    }
  }, [device, selectedDate, loadDayData]);

  // Load week data
  const loadWeekData = useCallback(async () => {
    if (!device || !selectedWeekDate) return;
    setIsLoadingWeek(true);
    try {
      const [data, avgData] = await Promise.all([
        api.getWeekData(device.deviceId, device.password, selectedWeekDate),
        api.getAverageWeekData(device.deviceId, device.password, selectedWeekDate),
      ]);

      // Days of week in order
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
        // Sum all hours for each day
        const dayHours = data[day] || {};
        const dayTotal = Object.values(dayHours).reduce(
          (sum: number, val) => sum + (val as number),
          0
        );
        return {
          label: day.substring(0, 3),
          value: dayTotal,
          average: avgData[day] || 0,
        };
      });

      setWeekData(chartData);
    } catch (error) {
      console.error("Failed to load week data:", error);
      setWeekData([]);
    } finally {
      setIsLoadingWeek(false);
    }
  }, [device, selectedWeekDate]);

  useEffect(() => {
    if (device && selectedWeekDate) {
      loadWeekData();
    }
  }, [device, selectedWeekDate, loadWeekData]);

  // Load year data
  const loadYearData = useCallback(async () => {
    if (!device || !selectedYear) return;
    setIsLoadingYear(true);
    try {
      // Use first day of selected year for the API call
      const dateStr = `${selectedYear}-01-01`;
      const [data, avgData] = await Promise.all([
        api.getYearData(device.deviceId, device.password, dateStr),
        api.getAverageYearData(device.deviceId, device.password, dateStr),
      ]);

      // Months in order
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
        // Sum all days for each month
        const monthDays = data[month] || {};
        const monthTotal = Object.values(monthDays).reduce(
          (sum: number, val) => sum + (val as number),
          0
        );
        return {
          label: month.substring(0, 3),
          value: monthTotal,
          average: avgData ? avgData[month] || 0 : 0,
        };
      });

      setYearData(chartData);
    } catch (error) {
      console.error("Failed to load year data:", error);
      setYearData([]);
    } finally {
      setIsLoadingYear(false);
    }
  }, [device, selectedYear]);

  useEffect(() => {
    if (device && selectedYear) {
      loadYearData();
    }
  }, [device, selectedYear, loadYearData]);

  // Get available years from dates
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    availableDates.forEach((date) => {
      years.add(date.split("-")[0]);
    });
    return Array.from(years).sort().reverse();
  }, [availableDates]);

  // Handle CSV export
  const handleExport = async (date?: string) => {
    if (!device) return;
    try {
      const blob = await api.exportCsv(device.deviceId, device.password, date);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = date
        ? `${device.deviceId}-${date}.csv`
        : `${device.deviceId}-all.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export:", error);
    }
  };

  if (!device) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Device not found</p>
          <Button asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-xl font-bold">
                  {device.name || device.deviceId} History
                </h1>
                <p className="text-sm text-muted-foreground">{device.deviceId}</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {isLoadingDates ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : availableDates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No historical data available yet
              </p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="day" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>

            {/* Day Tab */}
            <TabsContent value="day">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Daily Traffic</CardTitle>
                      <CardDescription>Hourly count breakdown</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedDate}
                        onValueChange={setSelectedDate}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDates.map((date) => (
                            <SelectItem key={date} value={date}>
                              {formatDateForDisplay(date)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleExport(selectedDate)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingDay ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <HistoryChart data={dayData} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Week Tab */}
            <TabsContent value="week">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Weekly Traffic</CardTitle>
                      <CardDescription>Daily count breakdown</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedWeekDate}
                        onValueChange={setSelectedWeekDate}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDates.map((date) => (
                            <SelectItem key={date} value={date}>
                              Week of {formatDateForDisplay(date)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleExport(selectedWeekDate)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingWeek ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <HistoryChart data={weekData} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Year Tab */}
            <TabsContent value="year">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Yearly Traffic</CardTitle>
                      <CardDescription>Monthly count breakdown</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedYear}
                        onValueChange={setSelectedYear}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableYears.map((year) => (
                            <SelectItem key={year} value={year}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleExport()}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingYear ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <HistoryChart data={yearData} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
