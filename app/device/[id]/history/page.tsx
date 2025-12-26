"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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

  // Store stable credentials to prevent re-fetching when device state updates from polling
  const credentialsRef = useRef<{ deviceId: string; password: string } | null>(null);
  if (device && !credentialsRef.current) {
    credentialsRef.current = { deviceId: device.deviceId, password: device.password };
  }
  const credentials = credentialsRef.current;

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
    if (!credentials) return;
    setIsLoadingDates(true);
    try {
      const dates = await api.getAvailableDates(credentials.deviceId, credentials.password);
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
  }, [credentials]);

  useEffect(() => {
    if (credentials) {
      loadAvailableDates();
    }
  }, [credentials, loadAvailableDates]);

  // Load day data
  const loadDayData = useCallback(async () => {
    if (!credentials || !selectedDate) return;
    setIsLoadingDay(true);
    try {
      const [data, avgData] = await Promise.all([
        api.getDayData(credentials.deviceId, credentials.password, selectedDate),
        api.getAverageDayData(credentials.deviceId, credentials.password, selectedDate),
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
  }, [credentials, selectedDate]);

  useEffect(() => {
    if (credentials && selectedDate) {
      loadDayData();
    }
  }, [credentials, selectedDate, loadDayData]);

  // Load week data
  const loadWeekData = useCallback(async () => {
    if (!credentials || !selectedWeekDate) return;
    setIsLoadingWeek(true);
    try {
      const [data, avgData] = await Promise.all([
        api.getWeekData(credentials.deviceId, credentials.password, selectedWeekDate),
        api.getAverageWeekData(credentials.deviceId, credentials.password, selectedWeekDate),
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
  }, [credentials, selectedWeekDate]);

  useEffect(() => {
    if (credentials && selectedWeekDate) {
      loadWeekData();
    }
  }, [credentials, selectedWeekDate, loadWeekData]);

  // Load year data by aggregating daily data for each month
  const loadYearData = useCallback(async () => {
    if (!credentials || !selectedYear) return;
    setIsLoadingYear(true);
    try {
      // Filter dates for the selected year
      const yearDates = availableDates.filter((date) =>
        date.startsWith(selectedYear)
      );

      // Group dates by month
      const datesByMonth: Record<number, string[]> = {};
      yearDates.forEach((date) => {
        const month = parseInt(date.split("-")[1], 10);
        if (!datesByMonth[month]) {
          datesByMonth[month] = [];
        }
        datesByMonth[month].push(date);
      });

      // Fetch day data for all dates in the year
      const allDayData = await Promise.all(
        yearDates.map(async (date) => {
          try {
            const [data, avgData] = await Promise.all([
              api.getDayData(credentials.deviceId, credentials.password, date),
              api.getAverageDayData(credentials.deviceId, credentials.password, date),
            ]);
            const month = parseInt(date.split("-")[1], 10);
            const dayTotal = Object.values(data).reduce(
              (sum: number, val) => sum + (val as number),
              0
            );
            const avgTotal = Object.values(avgData).reduce(
              (sum: number, val) => sum + (val as number),
              0
            );
            return { month, dayTotal, avgTotal };
          } catch {
            return null;
          }
        })
      );

      // Aggregate by month
      const monthTotals: Record<number, { value: number; average: number; count: number }> = {};
      allDayData.forEach((dayData) => {
        if (dayData) {
          if (!monthTotals[dayData.month]) {
            monthTotals[dayData.month] = { value: 0, average: 0, count: 0 };
          }
          monthTotals[dayData.month].value += dayData.dayTotal;
          monthTotals[dayData.month].average += dayData.avgTotal;
          monthTotals[dayData.month].count += 1;
        }
      });

      const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];

      const chartData: ChartData[] = months.map((month, index) => {
        const monthNum = index + 1;
        const totals = monthTotals[monthNum];
        return {
          label: month,
          value: totals?.value || 0,
          average: totals?.average || 0,
        };
      });

      setYearData(chartData);
    } catch (error) {
      console.error("Failed to load year data:", error);
      setYearData([]);
    } finally {
      setIsLoadingYear(false);
    }
  }, [credentials, selectedYear, availableDates]);

  useEffect(() => {
    if (credentials && selectedYear) {
      loadYearData();
    }
  }, [credentials, selectedYear, loadYearData]);

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
    if (!credentials) return;
    try {
      const blob = await api.exportCsv(credentials.deviceId, credentials.password, date);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = date
        ? `${credentials.deviceId}-${date}.csv`
        : `${credentials.deviceId}-all.zip`;
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
