"use client";

import { useState } from "react";
import type { InsightsData } from "@/hooks/useInsightsData";
import * as calc from "@/lib/insights";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  UserPlus,
  Clock,
  Sunrise,
  ArrowLeftRight,
  Calendar,
  CalendarClock,
  ArrowUp,
  ArrowDown,
  Minus,
  Loader2,
  Timer,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import type { POSTransactionData } from "@/lib/types";

interface POSInsightsData {
  today?: POSTransactionData;
  week?: POSTransactionData;
  year?: POSTransactionData;
}

interface InsightsContentProps {
  data: InsightsData;
  posData?: POSInsightsData;
  hasPOS?: boolean;
}

function TrendIndicator({ percentage }: { percentage: number }) {
  const dir = calc.trendDirection(percentage);
  if (dir === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-green-600 dark:text-green-400 text-sm font-medium">
        <ArrowUp className="h-3.5 w-3.5" />
        {calc.formatPercentage(percentage)}
      </span>
    );
  }
  if (dir === "down") {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 text-sm font-medium">
        <ArrowDown className="h-3.5 w-3.5" />
        {calc.formatPercentage(percentage)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground text-sm font-medium">
      <Minus className="h-3.5 w-3.5" />
      0%
    </span>
  );
}

function StatRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold">{value}</span>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function InsightCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">{children}</CardContent>
    </Card>
  );
}

function ComparisonRow({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  highlightLeft,
}: {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  highlightLeft?: boolean;
}) {
  const leftHighlight = highlightLeft === true;
  const rightHighlight = highlightLeft === false;

  return (
    <div className="grid grid-cols-2 gap-3 py-1.5">
      <div
        className={`text-center p-2 rounded-md ${
          leftHighlight ? "bg-primary/10" : "bg-muted/50"
        }`}
      >
        <p className="text-xs text-muted-foreground">{leftLabel}</p>
        <p className={`text-sm font-semibold ${leftHighlight ? "text-primary" : ""}`}>
          {leftValue}
        </p>
      </div>
      <div
        className={`text-center p-2 rounded-md ${
          rightHighlight ? "bg-primary/10" : "bg-muted/50"
        }`}
      >
        <p className="text-xs text-muted-foreground">{rightLabel}</p>
        <p className={`text-sm font-semibold ${rightHighlight ? "text-primary" : ""}`}>
          {rightValue}
        </p>
      </div>
    </div>
  );
}

function roundDisplay(n: number): string {
  return Math.round(n).toLocaleString();
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Wrapper that renders POS cards greyed out when not connected
function POSCardWrapper({ hasPOS, children }: { hasPOS: boolean; children: React.ReactNode }) {
  if (hasPOS) return <>{children}</>;
  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-medium text-muted-foreground bg-background/90 px-3 py-1.5 rounded-full border border-dashed">
          Connect a POS system to unlock
        </span>
      </div>
    </div>
  );
}

// POS insight cards for each period
function POSSalesSummary({ pos, periodLabel }: { pos?: POSTransactionData; periodLabel: string }) {
  const revenue = pos ? formatCurrency(pos.totalRevenue) : "—";
  const transactions = pos ? pos.totalTransactions.toLocaleString() : "—";
  const avgTransaction = pos && pos.totalTransactions > 0
    ? formatCurrency(Math.round(pos.totalRevenue / pos.totalTransactions))
    : "—";

  return (
    <InsightCard icon={DollarSign} title={`${periodLabel} Sales`}>
      <StatRow label="Total Revenue" value={revenue} />
      <StatRow label="Transactions" value={transactions} />
      <StatRow label="Avg Transaction" value={avgTransaction} />
    </InsightCard>
  );
}

function POSConversionCard({ pos, totalEntries, periodLabel }: { pos?: POSTransactionData; totalEntries: number; periodLabel: string }) {
  const hasData = pos && totalEntries > 0;

  // Conversion rate: % of visitors who made at least one purchase, capped at 100%
  const rawRate = hasData ? (pos.totalTransactions / totalEntries) : 0;
  const conversionRate = hasData
    ? `${(Math.min(rawRate, 1) * 100).toFixed(1)}%`
    : "—";

  // Revenue per visitor (not capped — shows actual revenue efficiency)
  const revenuePerVisitor = hasData
    ? formatCurrency(Math.round(pos.totalRevenue / totalEntries))
    : "—";

  // Transactions per visitor (can exceed 1 — shows repeat purchase behavior)
  const txPerVisitor = hasData
    ? rawRate.toFixed(2)
    : "—";

  return (
    <InsightCard icon={TrendingUp} title="Conversion">
      <StatRow label="Conversion Rate" value={conversionRate} />
      <StatRow label="Revenue per Visitor" value={revenuePerVisitor} />
      <StatRow
        label="Transactions per Visitor"
        value={txPerVisitor}
        sub={rawRate > 1 ? "Includes repeat purchases" : undefined}
      />
      {!hasData && pos && pos.totalTransactions > 0 && (
        <p className="text-xs text-muted-foreground">Entry data required for conversion metrics</p>
      )}
    </InsightCard>
  );
}

function POSSalesVsTraffic({ pos, trafficData }: { pos?: POSTransactionData; trafficData: Record<string, number> }) {
  // Find peak sales hour and peak traffic hour
  let peakSalesHour = 0;
  let peakSalesVal = 0;
  if (pos) {
    for (const [hour, data] of Object.entries(pos.hourlyBreakdown)) {
      if (data.revenue > peakSalesVal) {
        peakSalesVal = data.revenue;
        peakSalesHour = parseInt(hour);
      }
    }
  }

  const peakTraffic = calc.peakOccupancy(trafficData);
  const peakSalesStr = pos && peakSalesVal > 0 ? calc.formatHour(peakSalesHour) : "—";
  const peakTrafficStr = peakTraffic.count > 0 ? calc.formatHour(peakTraffic.hour) : "—";

  return (
    <InsightCard icon={ArrowLeftRight} title="Sales vs Traffic">
      <ComparisonRow
        leftLabel="Peak Sales Hour"
        leftValue={peakSalesStr}
        rightLabel="Peak Traffic Hour"
        rightValue={peakTrafficStr}
        highlightLeft={peakSalesHour !== peakTraffic.hour ? true : undefined}
      />
    </InsightCard>
  );
}

// --- Today Tab ---

function TodayInsights({ data, posData, hasPOS }: { data: InsightsData; posData?: POSTransactionData; hasPOS: boolean }) {
  const peak = calc.peakOccupancy(data.dayData);
  const avgOcc = calc.averageDayOccupancy(data.dayData);
  const fairAvg = calc.fairHistoricalAvg(
    data.dayData,
    data.avgDayData,
    calc.averageDayOccupancy
  );
  const peakVsTypical = calc.vsAveragePercentage(
    peak.count,
    calc.peakOccupancy(data.avgDayData).count
  );

  const busy = calc.busiestPeriod(data.dayData);
  const slow = calc.slowestPeriod(data.dayData);

  const ma = calc.morningAfternoonComparison(data.dayData);

  const totalEntries = calc.totalDayEntries(data.entryDayData);
  const avgEntries = calc.avgHourlyEntries(data.entryDayData);
  const peakEntry = calc.peakEntryHour(data.entryDayData);
  const busiestEntry = calc.busiestEntryPeriod(data.entryDayData);
  const maEntries = calc.morningAfternoonEntries(data.entryDayData);

  const typicalEntries = calc.totalDayEntries(data.avgEntryDayData);
  const entriesTrend = calc.vsAveragePercentage(totalEntries, typicalEntries);

  const vsTypicalOcc = calc.vsAveragePercentage(avgOcc, fairAvg);
  const fairEntryAvg = calc.fairHistoricalAvg(
    data.entryDayData,
    data.avgEntryDayData,
    calc.totalDayEntries
  );
  const vsTypicalEntries = calc.vsAveragePercentage(totalEntries, fairEntryAvg);

  const posCards = (
    <>
      <POSConversionCard pos={posData} totalEntries={totalEntries} periodLabel="Today" />
      <POSSalesSummary pos={posData} periodLabel="Today's" />
      <POSSalesVsTraffic pos={posData} trafficData={data.dayData} />
    </>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. Entries */}
      {totalEntries > 0 && (
        <InsightCard icon={UserPlus} title="Entries">
          <StatRow
            label="Total Entries Today"
            value={roundDisplay(totalEntries)}
            sub={<TrendIndicator percentage={entriesTrend} />}
          />
          <StatRow label="Peak Entry Hour" value={calc.formatHour(peakEntry.hour)} sub={`${roundDisplay(peakEntry.count)} entries`} />
          <StatRow label="Avg Hourly Entries" value={roundDisplay(avgEntries)} />
          <StatRow label="Busiest Window" value={calc.formatHourRange(busiestEntry.startHour, busiestEntry.endHour)} sub={`${roundDisplay(busiestEntry.total)} entries`} />
        </InsightCard>
      )}

      {/* 2. Occupancy */}
      <InsightCard icon={BarChart3} title="Occupancy">
        <StatRow
          label="Peak Occupancy"
          value={roundDisplay(peak.count)}
          sub={<TrendIndicator percentage={peakVsTypical} />}
        />
        <StatRow label="Peak Hour" value={calc.formatHour(peak.hour)} />
        <StatRow label="Avg Occupancy" value={roundDisplay(avgOcc)} />
      </InsightCard>

      {/* 3. Avg Time of Stay */}
      {data.dwellTimeMinutes != null && data.dwellTimeMinutes > 0 && (
        <InsightCard icon={Timer} title="Avg Time of Stay">
          <StatRow
            label="Avg Visit Duration"
            value={calc.formatDwellTime(data.dwellTimeMinutes)}
          />
          <p className="text-xs text-muted-foreground">Estimated from occupancy and entry data</p>
        </InsightCard>
      )}

      {/* 4-6. POS: Conversion, Today's Sales, Sales vs Traffic */}
      {hasPOS && posCards}

      {/* 7. vs Typical Day */}
      <InsightCard icon={ArrowLeftRight} title="vs Typical Day">
        <StatRow
          label="vs Historical Average"
          value={<TrendIndicator percentage={vsTypicalOcc} />}
        />
        {totalEntries > 0 && (
          <StatRow
            label="Entries vs Historical"
            value={<TrendIndicator percentage={vsTypicalEntries} />}
          />
        )}
      </InsightCard>

      {/* 8. Peak Times */}
      <InsightCard icon={Clock} title="Peak Times">
        <ComparisonRow
          leftLabel="Busiest"
          leftValue={calc.formatHourRange(busy.startHour, busy.endHour)}
          rightLabel="Slowest"
          rightValue={calc.formatHourRange(slow.startHour, slow.endHour)}
          highlightLeft={busy.avg > slow.avg}
        />
        <div className="grid grid-cols-2 gap-3">
          <p className="text-center text-xs text-muted-foreground">Avg: {roundDisplay(busy.avg)}</p>
          <p className="text-center text-xs text-muted-foreground">Avg: {roundDisplay(slow.avg)}</p>
        </div>
      </InsightCard>

      {/* 9. Time of Day */}
      <InsightCard icon={Sunrise} title="Time of Day">
        <ComparisonRow
          leftLabel="Morning Avg"
          leftValue={roundDisplay(ma.morningAvg)}
          rightLabel="Afternoon Avg"
          rightValue={roundDisplay(ma.afternoonAvg)}
          highlightLeft={ma.morningAvg > ma.afternoonAvg ? true : ma.morningAvg < ma.afternoonAvg ? false : undefined}
        />
        {totalEntries > 0 && (
          <ComparisonRow
            leftLabel="Morning Entries"
            leftValue={roundDisplay(maEntries.morning)}
            rightLabel="Afternoon Entries"
            rightValue={roundDisplay(maEntries.afternoon)}
            highlightLeft={maEntries.morning > maEntries.afternoon ? true : maEntries.morning < maEntries.afternoon ? false : undefined}
          />
        )}
      </InsightCard>

      {/* POS Cards greyed out at bottom when not connected */}
      {!hasPOS && (
        <div className="lg:col-span-2">
          <POSCardWrapper hasPOS={false}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{posCards}</div>
          </POSCardWrapper>
        </div>
      )}
    </div>
  );
}

// --- This Week Tab ---

function WeekInsights({ data, posData, hasPOS }: { data: InsightsData; posData?: POSTransactionData; hasPOS: boolean }) {
  const busiest = calc.busiestDay(data.weekData);
  const slowest = calc.slowestDay(data.weekData);
  const avgOcc = calc.averageWeekOccupancy(data.weekData);
  const fairAvg = calc.fairHistoricalAvg(
    data.weekData,
    data.avgWeekData,
    calc.averageWeekOccupancy
  );
  const peakVsTypical = calc.vsAveragePercentage(busiest.avg, calc.busiestDay(data.avgWeekData).avg);

  const ww = calc.weekendWeekdayComparison(data.weekData);

  const totalEntries = calc.totalWeekEntries(data.entryWeekData);
  const avgDEntries = calc.avgDailyEntries(data.entryWeekData);
  const busiestE = calc.busiestEntryDay(data.entryWeekData);
  const slowestE = calc.slowestEntryDay(data.entryWeekData);
  const wwEntries = calc.weekendWeekdayEntries(data.entryWeekData);

  const proRated = calc.proRatedWeekEntries(data.avgEntryWeekData);
  const entriesTrend = calc.vsAveragePercentage(totalEntries, proRated);

  const vsTypicalOcc = calc.vsAveragePercentage(avgOcc, fairAvg);
  const fairEntryAvg = calc.proRatedWeekEntries(data.avgEntryWeekData);
  const vsTypicalEntries = calc.vsAveragePercentage(totalEntries, fairEntryAvg);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. Entries */}
      {totalEntries > 0 && (
        <InsightCard icon={UserPlus} title="Entries">
          <StatRow
            label="Total Entries This Week"
            value={roundDisplay(totalEntries)}
            sub={<TrendIndicator percentage={entriesTrend} />}
          />
          <StatRow label="Avg Daily Entries" value={roundDisplay(avgDEntries)} />
          <StatRow label="Most Entries" value={`${roundDisplay(busiestE.avg)} (${busiestE.day})`} />
          <StatRow label="Fewest Entries" value={`${roundDisplay(slowestE.avg)} (${slowestE.day})`} />
        </InsightCard>
      )}

      {/* 2. Occupancy */}
      <InsightCard icon={BarChart3} title="Occupancy">
        <StatRow
          label="Peak Daily Avg"
          value={`${roundDisplay(busiest.avg)} (${busiest.day})`}
          sub={<TrendIndicator percentage={peakVsTypical} />}
        />
        <StatRow label="Weekly Avg Occupancy" value={roundDisplay(avgOcc)} />
      </InsightCard>

      {/* 3-4. POS: Conversion, Weekly Sales */}
      {hasPOS && (
        <>
          <POSConversionCard pos={posData} totalEntries={totalEntries} periodLabel="Week" />
          <POSSalesSummary pos={posData} periodLabel="Weekly" />
        </>
      )}

      {/* 5. vs Typical Week */}
      <InsightCard icon={ArrowLeftRight} title="vs Typical Week">
        <StatRow
          label="vs Historical Average"
          value={<TrendIndicator percentage={vsTypicalOcc} />}
        />
        {totalEntries > 0 && (
          <StatRow
            label="Entries vs Historical"
            value={<TrendIndicator percentage={vsTypicalEntries} />}
          />
        )}
      </InsightCard>

      {/* 6. Day Performance */}
      <InsightCard icon={Calendar} title="Day Performance">
        <ComparisonRow
          leftLabel="Busiest"
          leftValue={busiest.day}
          rightLabel="Slowest"
          rightValue={slowest.day}
          highlightLeft={busiest.avg > slowest.avg}
        />
        <div className="grid grid-cols-2 gap-3">
          <p className="text-center text-xs text-muted-foreground">Avg: {roundDisplay(busiest.avg)}</p>
          <p className="text-center text-xs text-muted-foreground">Avg: {roundDisplay(slowest.avg)}</p>
        </div>
      </InsightCard>

      {/* 7. Weekend vs Weekday */}
      <InsightCard icon={CalendarClock} title="Weekend vs Weekday">
        <ComparisonRow
          leftLabel="Weekday Avg"
          leftValue={roundDisplay(ww.weekdayAvg)}
          rightLabel="Weekend Avg"
          rightValue={roundDisplay(ww.weekendAvg)}
          highlightLeft={ww.weekdayAvg > ww.weekendAvg ? true : ww.weekdayAvg < ww.weekendAvg ? false : undefined}
        />
        {totalEntries > 0 && (
          <ComparisonRow
            leftLabel="Weekday Entries"
            leftValue={roundDisplay(wwEntries.weekday)}
            rightLabel="Weekend Entries"
            rightValue={roundDisplay(wwEntries.weekend)}
            highlightLeft={wwEntries.weekday > wwEntries.weekend ? true : wwEntries.weekday < wwEntries.weekend ? false : undefined}
          />
        )}
      </InsightCard>

      {/* POS Cards greyed out at bottom when not connected */}
      {!hasPOS && (
        <div className="lg:col-span-2">
          <POSCardWrapper hasPOS={false}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <POSConversionCard pos={posData} totalEntries={totalEntries} periodLabel="Week" />
              <POSSalesSummary pos={posData} periodLabel="Weekly" />
            </div>
          </POSCardWrapper>
        </div>
      )}
    </div>
  );
}

// --- This Year Tab ---

function YearInsights({ data, posData, hasPOS }: { data: InsightsData; posData?: POSTransactionData; hasPOS: boolean }) {
  const busiest = calc.busiestMonth(data.yearData);
  const slowest = calc.slowestMonth(data.yearData);
  const avgOcc = calc.averageYearOccupancy(data.yearData);

  const avgYearAvailable = data.avgYearData !== null;
  const fairAvg = avgYearAvailable
    ? calc.fairHistoricalAvg(data.yearData, data.avgYearData!, calc.averageYearOccupancy)
    : 0;
  const peakVsTypical = avgYearAvailable
    ? calc.vsAveragePercentage(busiest.avg, calc.busiestMonth(data.avgYearData!).avg)
    : 0;

  const totalEntries = calc.totalYearEntries(data.entryYearData);
  const avgMEntries = calc.avgMonthlyEntries(data.entryYearData);
  const busiestE = calc.busiestEntryMonth(data.entryYearData);
  const slowestE = calc.slowestEntryMonth(data.entryYearData);

  const avgEntryYearAvailable = data.avgEntryYearData !== null;
  const proRated = avgEntryYearAvailable
    ? calc.proRatedYearEntries(data.avgEntryYearData!)
    : 0;
  const entriesTrend = avgEntryYearAvailable
    ? calc.vsAveragePercentage(totalEntries, proRated)
    : 0;

  const vsTypicalOcc = avgYearAvailable
    ? calc.vsAveragePercentage(avgOcc, fairAvg)
    : 0;
  const vsTypicalEntries = avgEntryYearAvailable
    ? calc.vsAveragePercentage(totalEntries, proRated)
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. Entries */}
      {totalEntries > 0 && (
        <InsightCard icon={UserPlus} title="Entries">
          <StatRow
            label="Total Entries This Year"
            value={roundDisplay(totalEntries)}
            sub={avgEntryYearAvailable ? <TrendIndicator percentage={entriesTrend} /> : undefined}
          />
          <StatRow label="Avg Monthly Entries" value={roundDisplay(avgMEntries)} />
          <StatRow label="Most Entries" value={`${roundDisplay(busiestE.avg)} (${busiestE.month})`} />
          <StatRow label="Fewest Entries" value={`${roundDisplay(slowestE.avg)} (${slowestE.month})`} />
        </InsightCard>
      )}

      {/* 2. Occupancy */}
      <InsightCard icon={BarChart3} title="Occupancy">
        <StatRow
          label="Peak Monthly Avg"
          value={`${roundDisplay(busiest.avg)} (${busiest.month})`}
          sub={avgYearAvailable ? <TrendIndicator percentage={peakVsTypical} /> : undefined}
        />
        <StatRow label="Yearly Avg Occupancy" value={roundDisplay(avgOcc)} />
      </InsightCard>

      {/* 3-4. POS: Conversion, Yearly Sales */}
      {hasPOS && (
        <>
          <POSConversionCard pos={posData} totalEntries={totalEntries} periodLabel="Year" />
          <POSSalesSummary pos={posData} periodLabel="Yearly" />
        </>
      )}

      {/* 5. vs Previous Years */}
      {avgYearAvailable && (
        <InsightCard icon={ArrowLeftRight} title="vs Previous Years">
          <StatRow
            label="vs Historical Average"
            value={<TrendIndicator percentage={vsTypicalOcc} />}
          />
          {totalEntries > 0 && avgEntryYearAvailable && (
            <StatRow
              label="Entries vs Historical"
              value={<TrendIndicator percentage={vsTypicalEntries} />}
            />
          )}
        </InsightCard>
      )}

      {/* 6. Month Performance */}
      <InsightCard icon={Calendar} title="Month Performance">
        <ComparisonRow
          leftLabel="Busiest"
          leftValue={busiest.month}
          rightLabel="Slowest"
          rightValue={slowest.month}
          highlightLeft={busiest.avg > slowest.avg}
        />
        <div className="grid grid-cols-2 gap-3">
          <p className="text-center text-xs text-muted-foreground">Avg: {roundDisplay(busiest.avg)}</p>
          <p className="text-center text-xs text-muted-foreground">Avg: {roundDisplay(slowest.avg)}</p>
        </div>
      </InsightCard>

      {/* POS Cards greyed out at bottom when not connected */}
      {!hasPOS && (
        <div className="lg:col-span-2">
          <POSCardWrapper hasPOS={false}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <POSSalesSummary pos={posData} periodLabel="Yearly" />
              <POSConversionCard pos={posData} totalEntries={totalEntries} periodLabel="Year" />
            </div>
          </POSCardWrapper>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export function InsightsContent({ data, posData, hasPOS = false }: InsightsContentProps) {
  const [period, setPeriod] = useState("today");

  if (data.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading insights...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList className="w-full">
          <TabsTrigger value="today" className="flex-1">Today</TabsTrigger>
          <TabsTrigger value="week" className="flex-1">This Week</TabsTrigger>
          <TabsTrigger value="year" className="flex-1">This Year</TabsTrigger>
        </TabsList>

        {/* Info text */}
        <p className="text-xs text-muted-foreground mt-3 px-1">
          {period === "today" &&
            "Statistics are based on today's data. Only completed hours are fully counted."}
          {period === "week" &&
            "Statistics are based on this week's data. Only completed days are fully counted, and the current day is pro-rated by hour."}
          {period === "year" &&
            "Statistics are based on this year's data. Only completed months are fully counted, and the current month is pro-rated by day."}
        </p>

        <TabsContent value="today">
          <TodayInsights data={data} posData={posData?.today} hasPOS={hasPOS} />
        </TabsContent>
        <TabsContent value="week">
          <WeekInsights data={data} posData={posData?.week} hasPOS={hasPOS} />
        </TabsContent>
        <TabsContent value="year">
          <YearInsights data={data} posData={posData?.year} hasPOS={hasPOS} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
