"use client";

import { useState } from "react";
import type { ChartData, AggregatedHistoryResult } from "@/hooks/useAggregatedHistory";
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
import { Download, RefreshCw } from "lucide-react";
import type { POSTransactionData } from "@/lib/types";

function formatDateForDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString();
}

/** Format a Monday date as a week range label, e.g. "Mar 24 - Mar 30" or "This Week" */
function formatWeekLabel(mondayStr: string): string {
  const [y, m, d] = mondayStr.split("-").map(Number);
  const monday = new Date(y, m - 1, d);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  // Check if this is the current week
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayDow = today.getDay(); // 0=Sun
  const currentMondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const currentMonday = new Date(today);
  currentMonday.setDate(currentMonday.getDate() + currentMondayOffset);
  if (
    monday.getFullYear() === currentMonday.getFullYear() &&
    monday.getMonth() === currentMonday.getMonth() &&
    monday.getDate() === currentMonday.getDate()
  ) {
    return "This Week";
  }

  const fmt = (date: Date) =>
    date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function downloadCsv(data: ChartData[], filename: string, dataType: string) {
  const hasSalesData = data.some((d) => d.salesCount !== undefined);
  const header = `Label,${dataType === "entries" ? "Entries" : "Count"},Average${hasSalesData ? ",Transactions" : ""}`;
  const rows = data.map(
    (d) => `${d.label},${d.value},${d.average ?? ""}${hasSalesData ? `,${d.salesCount ?? ""}` : ""}`
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface HistoryContentProps {
  history: AggregatedHistoryResult;
  filenamePrefix?: string;
  dayDescription?: string;
  weekDescription?: string;
  yearDescription?: string;
  /** If provided, fetches 15-min interval data for daily CSV download instead of using hourly chart data */
  onDownloadDay?: (date: string, dataType: string, filename: string) => Promise<void>;
  /** POS sales data keyed by date (YYYY-MM-DD) with hourly breakdown */
  posSalesData?: Record<string, POSTransactionData>;
  /** POS weekly sales: total revenue per day label (e.g. "Mon" → dollars) */
  posWeekSales?: Record<string, number>;
  /** POS yearly sales: total revenue per month label (e.g. "Jan" → dollars) */
  posYearSales?: Record<string, number>;
  /** Whether the location has a POS connection */
  hasPOS?: boolean;
  /** Callback to open POS connect dialog */
  onConnectPOS?: () => void;
}

export function HistoryContent({
  history,
  filenamePrefix = "history",
  dayDescription = "Hourly count breakdown",
  weekDescription = "Daily count breakdown",
  yearDescription = "Monthly count breakdown",
  onDownloadDay,
  posSalesData,
  posWeekSales,
  posYearSales,
  hasPOS,
  onConnectPOS,
}: HistoryContentProps) {
  const {
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
  } = history;

  const [isDayDownloading, setIsDayDownloading] = useState(false);
  const [showSales, setShowSales] = useState(true);

  const dataLabel = dataType === "entries" ? "Entries" : "Count";

  // Shift POS UTC hours to local hours
  const tzOffsetHours = -(new Date().getTimezoneOffset() / 60);

  // Merge POS transaction counts into chart data for the selected day
  const mergeSalesIntoDay = (chartData: ChartData[]): ChartData[] => {
    const sales = posSalesData?.[selectedDate];
    if (!sales || !showSales) return chartData;
    return chartData.map((d) => {
      // label is "0:00", "1:00", etc. — extract local hour
      const localHour = parseInt(d.label.split(":")[0], 10);
      // Convert local hour back to UTC to look up POS data
      const utcHour = ((localHour - tzOffsetHours) % 24 + 24) % 24;
      const hourData = sales.hourlyBreakdown[String(utcHour)];
      return {
        ...d,
        salesCount: hourData ? hourData.transactions : 0,
      };
    });
  };

  // Merge POS weekly transaction counts into chart data
  const mergeSalesIntoWeek = (chartData: ChartData[]): ChartData[] => {
    if (!posWeekSales || !showSales) return chartData;
    return chartData.map((d) => ({
      ...d,
      salesCount: posWeekSales[d.label] ?? 0,
    }));
  };

  // Merge POS yearly transaction counts into chart data
  const mergeSalesIntoYear = (chartData: ChartData[]): ChartData[] => {
    if (!posYearSales || !showSales) return chartData;
    return chartData.map((d) => ({
      ...d,
      salesCount: posYearSales[d.label] ?? 0,
    }));
  };

  if (isLoadingDates) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (availableDates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No historical data available yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Population / Entries tabs */}
      <Tabs value={dataType} onValueChange={(v) => setDataType(v as "population" | "entries")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="population">Population</TabsTrigger>
        </TabsList>

        <p className="text-xs text-muted-foreground text-center px-4 mt-3">
          {dataType === "population"
            ? "Population shows the number of people present at each point in time."
            : "Entries shows the total number of people who entered during each period."}
        </p>

        <div className="flex items-center justify-center mt-3">
          {hasPOS ? (
            <label className="flex items-center gap-2.5 cursor-pointer select-none rounded-lg border px-4 py-2 transition-colors hover:bg-muted/50">
              <input
                type="checkbox"
                checked={showSales}
                onChange={(e) => setShowSales(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-green-500"
              />
              <span className="inline-block w-5 h-[3px] rounded-full bg-green-500" />
              <span className="text-sm font-medium">Show Transactions</span>
            </label>
          ) : (
            <button
              type="button"
              onClick={onConnectPOS}
              className="flex items-center gap-2.5 rounded-lg border border-dashed px-4 py-2 opacity-60 hover:opacity-100 hover:border-primary/50 transition-opacity cursor-pointer"
            >
              <input
                type="checkbox"
                disabled
                className="h-4 w-4 rounded border-input pointer-events-none"
              />
              <span className="text-sm text-muted-foreground">
                Connect a POS system to overlay transactions
              </span>
            </button>
          )}
        </div>

        {/* Both tabs share the same stacked layout */}
        {["population", "entries"].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-4 mt-4">
            {/* Day Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Daily {dataLabel}</CardTitle>
                    <CardDescription>{dayDescription}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedDate} onValueChange={setSelectedDate}>
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
                      disabled={isLoadingDay || isDayDownloading || dayData.length === 0}
                      onClick={async () => {
                        const filename = `${filenamePrefix}-day-${selectedDate}-${dataType}`;
                        if (onDownloadDay) {
                          setIsDayDownloading(true);
                          try {
                            await onDownloadDay(selectedDate, dataType, filename);
                          } finally {
                            setIsDayDownloading(false);
                          }
                        } else {
                          downloadCsv(mergeSalesIntoDay(dayData), filename, dataType);
                        }
                      }}
                    >
                      {isDayDownloading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-4">
                {isLoadingDay ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <HistoryChart data={mergeSalesIntoDay(dayData)} dataType={dataType} showSales={showSales && hasPOS} />
                )}
              </CardContent>
            </Card>

            {/* Week Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Weekly {dataLabel}</CardTitle>
                    <CardDescription>{weekDescription}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedWeekDate}
                      onValueChange={setSelectedWeekDate}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...availableWeeks].reverse().map((monday) => (
                          <SelectItem key={monday} value={monday}>
                            {formatWeekLabel(monday)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={isLoadingWeek || weekData.length === 0}
                      onClick={() =>
                        downloadCsv(
                          mergeSalesIntoWeek(weekData),
                          `${filenamePrefix}-week-${selectedWeekDate}-${dataType}`,
                          dataType
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-4">
                {isLoadingWeek ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <HistoryChart data={mergeSalesIntoWeek(weekData)} dataType={dataType} showSales={showSales && hasPOS} />
                )}
              </CardContent>
            </Card>

            {/* Year Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Yearly {dataLabel}</CardTitle>
                    <CardDescription>{yearDescription}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
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
                      disabled={isLoadingYear || yearData.length === 0}
                      onClick={() =>
                        downloadCsv(
                          mergeSalesIntoYear(yearData),
                          `${filenamePrefix}-year-${selectedYear}-${dataType}`,
                          dataType
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-4">
                {isLoadingYear ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <HistoryChart data={mergeSalesIntoYear(yearData)} dataType={dataType} showSales={showSales && hasPOS} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
