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

function downloadCsv(data: ChartData[], filename: string, dataType: string) {
  const header = `Label,${dataType === "entries" ? "Entries" : "Count"},Average`;
  const rows = data.map(
    (d) => `${d.label},${d.value},${d.average ?? ""}`
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
  /** Whether the location has a POS connection */
  hasPOS?: boolean;
}

export function HistoryContent({
  history,
  filenamePrefix = "history",
  dayDescription = "Hourly count breakdown",
  weekDescription = "Daily count breakdown",
  yearDescription = "Monthly count breakdown",
  onDownloadDay,
  posSalesData,
  hasPOS,
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
    selectedYear,
    setSelectedYear,
    yearData,
    isLoadingYear,
    availableYears,
  } = history;

  const [isDayDownloading, setIsDayDownloading] = useState(false);
  const [showSales, setShowSales] = useState(true);

  const dataLabel = dataType === "entries" ? "Entries" : "Count";

  // Merge POS sales data into chart data for the selected day
  const mergeSalesIntoDay = (chartData: ChartData[]): ChartData[] => {
    const sales = posSalesData?.[selectedDate];
    if (!sales || !showSales) return chartData;
    return chartData.map((d) => {
      // label is "0:00", "1:00", etc. — extract hour
      const hour = d.label.split(":")[0];
      const hourData = sales.hourlyBreakdown[hour];
      return {
        ...d,
        salesRevenue: hourData ? hourData.revenue / 100 : 0,
      };
    });
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

        {hasPOS ? (
          <label className="flex items-center justify-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSales}
              onChange={(e) => setShowSales(e.target.checked)}
              className="rounded border-input accent-green-500"
            />
            <span className="text-sm text-muted-foreground">
              Show Sales Data
            </span>
            <span className="inline-block w-4 h-0.5 rounded bg-green-500" />
          </label>
        ) : (
          <div className="flex items-center justify-center gap-2 mt-2 opacity-40">
            <input
              type="checkbox"
              disabled
              className="rounded border-input"
            />
            <span className="text-sm text-muted-foreground">
              Show Sales Data
            </span>
            <span className="text-xs text-muted-foreground italic">
              — Connect a POS system to overlay sales
            </span>
          </div>
        )}

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
                          downloadCsv(dayData, filename, dataType);
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
              <CardContent>
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
                      disabled={isLoadingWeek || weekData.length === 0}
                      onClick={() =>
                        downloadCsv(
                          weekData,
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
              <CardContent>
                {isLoadingWeek ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <HistoryChart data={weekData} dataType={dataType} />
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
                          yearData,
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
              <CardContent>
                {isLoadingYear ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <HistoryChart data={yearData} dataType={dataType} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
