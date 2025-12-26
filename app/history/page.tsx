"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
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

interface DeviceCredentials {
  deviceId: string;
  password: string;
}

// Format date string (YYYY-MM-DD) for display without timezone issues
function formatDateForDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString();
}

export default function AggregateHistoryPage() {
  const router = useRouter();
  const { devices, isLoading } = useDevices();

  // Store stable credentials to prevent re-fetching when device state updates from polling
  const credentialsRef = useRef<DeviceCredentials[]>([]);
  if (devices.length >= 2 && credentialsRef.current.length === 0) {
    credentialsRef.current = devices.map((d) => ({
      deviceId: d.deviceId,
      password: d.password,
    }));
  }
  const credentials = credentialsRef.current;
  const deviceCount = devices.length;

  // Available dates (intersection of all devices)
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

  // Redirect if less than 2 devices
  useEffect(() => {
    if (!isLoading && devices.length < 2) {
      router.push("/dashboard");
    }
  }, [devices, isLoading, router]);

  // Load available dates from all devices
  const loadAvailableDates = useCallback(async () => {
    if (credentials.length < 2) return;
    setIsLoadingDates(true);
    try {
      // Get dates from all devices
      const allDatesArrays = await Promise.all(
        credentials.map((cred) =>
          api.getAvailableDates(cred.deviceId, cred.password)
        )
      );

      // Find union of all dates (any date that exists in any device)
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
  }, [credentials]);

  useEffect(() => {
    if (credentials.length >= 2) {
      loadAvailableDates();
    }
  }, [credentials, loadAvailableDates]);

  // Load aggregated day data
  const loadDayData = useCallback(async () => {
    if (credentials.length < 2 || !selectedDate) return;
    setIsLoadingDay(true);
    try {
      // Fetch data from all devices
      const allData = await Promise.all(
        credentials.map(async (cred) => {
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

      // Aggregate data for each hour
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
  }, [credentials, selectedDate]);

  useEffect(() => {
    if (credentials.length >= 2 && selectedDate) {
      loadDayData();
    }
  }, [credentials, selectedDate, loadDayData]);

  // Load aggregated week data
  const loadWeekData = useCallback(async () => {
    if (credentials.length < 2 || !selectedWeekDate) return;
    setIsLoadingWeek(true);
    try {
      const allData = await Promise.all(
        credentials.map(async (cred) => {
          try {
            const [data, avgData] = await Promise.all([
              api.getWeekData(cred.deviceId, cred.password, selectedWeekDate),
              api.getAverageWeekData(cred.deviceId, cred.password, selectedWeekDate),
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
          const dayHours = data[day] || {};
          const dayTotal = Object.values(dayHours).reduce(
            (sum: number, val) => sum + (val as number),
            0
          );
          totalValue += dayTotal;
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
  }, [credentials, selectedWeekDate]);

  useEffect(() => {
    if (credentials.length >= 2 && selectedWeekDate) {
      loadWeekData();
    }
  }, [credentials, selectedWeekDate, loadWeekData]);

  // Load aggregated year data
  const loadYearData = useCallback(async () => {
    if (credentials.length < 2 || !selectedYear) return;
    setIsLoadingYear(true);
    try {
      const dateStr = `${selectedYear}-01-01`;
      const allData = await Promise.all(
        credentials.map(async (cred) => {
          try {
            const [data, avgData] = await Promise.all([
              api.getYearData(cred.deviceId, cred.password, dateStr),
              api.getAverageYearData(cred.deviceId, cred.password, dateStr),
            ]);
            return { data, avgData };
          } catch {
            return { data: {}, avgData: null };
          }
        })
      );

      // Months in order with various possible key formats
      const monthsConfig = [
        { name: "January", keys: ["January", "january", "Jan", "jan", "1", "01"] },
        { name: "February", keys: ["February", "february", "Feb", "feb", "2", "02"] },
        { name: "March", keys: ["March", "march", "Mar", "mar", "3", "03"] },
        { name: "April", keys: ["April", "april", "Apr", "apr", "4", "04"] },
        { name: "May", keys: ["May", "may", "5", "05"] },
        { name: "June", keys: ["June", "june", "Jun", "jun", "6", "06"] },
        { name: "July", keys: ["July", "july", "Jul", "jul", "7", "07"] },
        { name: "August", keys: ["August", "august", "Aug", "aug", "8", "08"] },
        { name: "September", keys: ["September", "september", "Sep", "sep", "9", "09"] },
        { name: "October", keys: ["October", "october", "Oct", "oct", "10"] },
        { name: "November", keys: ["November", "november", "Nov", "nov", "11"] },
        { name: "December", keys: ["December", "december", "Dec", "dec", "12"] },
      ];

      const chartData: ChartData[] = monthsConfig.map(({ name, keys }) => {
        let totalValue = 0;
        let totalAverage = 0;

        allData.forEach(({ data, avgData }) => {
          // Find data using any matching key
          let monthDays: Record<string, number> = {};
          for (const key of keys) {
            if (data[key]) {
              monthDays = data[key];
              break;
            }
          }

          const monthTotal = Object.values(monthDays).reduce(
            (sum: number, val) => sum + (val as number),
            0
          );
          totalValue += monthTotal;

          // Find average using any matching key
          if (avgData) {
            for (const key of keys) {
              if (avgData[key] !== undefined) {
                totalAverage += avgData[key];
                break;
              }
            }
          }
        });

        return {
          label: name.substring(0, 3),
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
  }, [credentials, selectedYear]);

  useEffect(() => {
    if (credentials.length >= 2 && selectedYear) {
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (devices.length < 2) {
    return null;
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
                <h1 className="text-xl font-bold">Total History</h1>
                <p className="text-sm text-muted-foreground">
                  Aggregated data from {devices.length} devices
                </p>
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
                      <CardDescription>
                        Combined hourly count from all devices
                      </CardDescription>
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
                      <CardDescription>
                        Combined daily count from all devices
                      </CardDescription>
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
                      <CardDescription>
                        Combined monthly count from all devices
                      </CardDescription>
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
