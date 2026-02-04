"use client";

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
}

export function HistoryContent({
  history,
  filenamePrefix = "history",
  dayDescription = "Hourly count breakdown",
  weekDescription = "Daily count breakdown",
  yearDescription = "Monthly count breakdown",
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

  const dataLabel = dataType === "entries" ? "Entries" : "Count";

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
          <TabsTrigger value="population">Population</TabsTrigger>
          <TabsTrigger value="entries">Entries</TabsTrigger>
        </TabsList>

        <p className="text-xs text-muted-foreground text-center px-4 mt-3">
          {dataType === "population"
            ? "Population shows the number of people present at each point in time."
            : "Entries shows the total number of people who entered during each period."}
        </p>

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
                      disabled={isLoadingDay || dayData.length === 0}
                      onClick={() =>
                        downloadCsv(
                          dayData,
                          `${filenamePrefix}-day-${selectedDate}-${dataType}`,
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
                {isLoadingDay ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <HistoryChart data={dayData} />
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
                  <HistoryChart data={weekData} />
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
                  <HistoryChart data={yearData} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
