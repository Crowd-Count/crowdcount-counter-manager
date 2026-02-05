// Pure calculation functions for Insights feature
// Ported from StatisticsCalculator.swift

const DAYS_OF_WEEK = [
  "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday", "Sunday",
];

const MONTHS = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

// --- Helpers ---

export function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function formatHourRange(start: number, end: number): string {
  return `${formatHour(start)} - ${formatHour(end)}`;
}

export function formatPercentage(value: number): string {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded}%` : `${rounded}%`;
}

export type TrendDirection = "up" | "down" | "neutral";

export function trendDirection(percentage: number): TrendDirection {
  if (percentage > 1) return "up";
  if (percentage < -1) return "down";
  return "neutral";
}

export function vsAveragePercentage(current: number, average: number): number {
  if (average === 0) return 0;
  return ((current - average) / average) * 100;
}

/** Filters avgData to only keys present (non-zero) in currentData, then computes average */
export function fairHistoricalAvg(
  currentData: Record<string, number>,
  avgData: Record<string, number>,
  avgFn: (data: Record<string, number>) => number
): number {
  const keysWithData = Object.keys(currentData).filter(
    (k) => (currentData[k] || 0) > 0
  );
  if (keysWithData.length === 0) return avgFn(avgData);
  const filtered: Record<string, number> = {};
  for (const k of keysWithData) {
    filtered[k] = avgData[k] || 0;
  }
  return avgFn(filtered);
}

function nonZeroValues(data: Record<string, number>): number[] {
  return Object.values(data).filter((v) => v > 0);
}

function sumValues(data: Record<string, number>): number {
  return Object.values(data).reduce((sum, v) => sum + v, 0);
}

function avgNonZero(data: Record<string, number>): number {
  const vals = nonZeroValues(data);
  if (vals.length === 0) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

// --- Today (hourly keys "0"-"23") ---

export function averageDayOccupancy(dayData: Record<string, number>): number {
  return avgNonZero(dayData);
}

export function peakOccupancy(dayData: Record<string, number>): { hour: number; count: number } {
  let maxHour = 0;
  let maxCount = 0;
  for (let h = 0; h < 24; h++) {
    const val = dayData[h.toString()] || 0;
    if (val > maxCount) {
      maxCount = val;
      maxHour = h;
    }
  }
  return { hour: maxHour, count: maxCount };
}

function bestWindow(
  dayData: Record<string, number>,
  mode: "max" | "min"
): { startHour: number; endHour: number; avg: number } {
  let bestStart = 0;
  let bestAvg = mode === "max" ? -Infinity : Infinity;

  for (let start = 0; start <= 21; start++) {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
      sum += dayData[(start + i).toString()] || 0;
    }
    const avg = sum / 3;
    if (mode === "max" ? avg > bestAvg : avg < bestAvg) {
      bestAvg = avg;
      bestStart = start;
    }
  }

  return { startHour: bestStart, endHour: bestStart + 3, avg: bestAvg === -Infinity || bestAvg === Infinity ? 0 : bestAvg };
}

export function busiestPeriod(dayData: Record<string, number>) {
  return bestWindow(dayData, "max");
}

export function slowestPeriod(dayData: Record<string, number>) {
  return bestWindow(dayData, "min");
}

export function morningAfternoonComparison(dayData: Record<string, number>): {
  morningAvg: number;
  afternoonAvg: number;
} {
  let morningSum = 0;
  let morningCount = 0;
  let afternoonSum = 0;
  let afternoonCount = 0;

  for (let h = 6; h < 12; h++) {
    const val = dayData[h.toString()] || 0;
    if (val > 0) { morningSum += val; morningCount++; }
  }
  for (let h = 12; h < 18; h++) {
    const val = dayData[h.toString()] || 0;
    if (val > 0) { afternoonSum += val; afternoonCount++; }
  }

  return {
    morningAvg: morningCount > 0 ? morningSum / morningCount : 0,
    afternoonAvg: afternoonCount > 0 ? afternoonSum / afternoonCount : 0,
  };
}

export function totalDayEntries(entryData: Record<string, number>): number {
  return sumValues(entryData);
}

export function avgHourlyEntries(entryData: Record<string, number>): number {
  return avgNonZero(entryData);
}

export function peakEntryHour(entryData: Record<string, number>): { hour: number; count: number } {
  return peakOccupancy(entryData); // same logic
}

export function busiestEntryPeriod(entryData: Record<string, number>): {
  startHour: number;
  endHour: number;
  total: number;
} {
  let bestStart = 0;
  let bestTotal = 0;

  for (let start = 0; start <= 21; start++) {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
      sum += entryData[(start + i).toString()] || 0;
    }
    if (sum > bestTotal) {
      bestTotal = sum;
      bestStart = start;
    }
  }

  return { startHour: bestStart, endHour: bestStart + 3, total: bestTotal };
}

export function morningAfternoonEntries(entryData: Record<string, number>): {
  morning: number;
  afternoon: number;
} {
  let morning = 0;
  let afternoon = 0;
  for (let h = 6; h < 12; h++) morning += entryData[h.toString()] || 0;
  for (let h = 12; h < 18; h++) afternoon += entryData[h.toString()] || 0;
  return { morning, afternoon };
}

// --- This Week (keys "Monday"-"Sunday") ---

export function averageWeekOccupancy(weekData: Record<string, number>): number {
  return avgNonZero(weekData);
}

function bestDay(
  weekData: Record<string, number>,
  mode: "max" | "min"
): { day: string; avg: number } {
  let bestDayName = "";
  let bestVal = mode === "max" ? -Infinity : Infinity;

  for (const day of DAYS_OF_WEEK) {
    const val = weekData[day] || 0;
    if (val === 0 && mode === "min") continue;
    if (mode === "max" ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestDayName = day;
    }
  }

  return { day: bestDayName || DAYS_OF_WEEK[0], avg: bestVal === -Infinity || bestVal === Infinity ? 0 : bestVal };
}

export function busiestDay(weekData: Record<string, number>) {
  return bestDay(weekData, "max");
}

export function slowestDay(weekData: Record<string, number>) {
  return bestDay(weekData, "min");
}

export function weekendWeekdayComparison(weekData: Record<string, number>): {
  weekdayAvg: number;
  weekendAvg: number;
} {
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const weekend = ["Saturday", "Sunday"];

  const wdVals = weekdays.map((d) => weekData[d] || 0).filter((v) => v > 0);
  const weVals = weekend.map((d) => weekData[d] || 0).filter((v) => v > 0);

  return {
    weekdayAvg: wdVals.length > 0 ? wdVals.reduce((s, v) => s + v, 0) / wdVals.length : 0,
    weekendAvg: weVals.length > 0 ? weVals.reduce((s, v) => s + v, 0) / weVals.length : 0,
  };
}

export function totalWeekEntries(entryData: Record<string, number>): number {
  return sumValues(entryData);
}

export function avgDailyEntries(entryData: Record<string, number>): number {
  return avgNonZero(entryData);
}

export function busiestEntryDay(entryData: Record<string, number>) {
  return bestDay(entryData, "max");
}

export function slowestEntryDay(entryData: Record<string, number>) {
  return bestDay(entryData, "min");
}

export function weekendWeekdayEntries(entryData: Record<string, number>): {
  weekday: number;
  weekend: number;
} {
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const weekendDays = ["Saturday", "Sunday"];

  return {
    weekday: weekdays.reduce((s, d) => s + (entryData[d] || 0), 0),
    weekend: weekendDays.reduce((s, d) => s + (entryData[d] || 0), 0),
  };
}

/** Pro-rate historical average weekly entries to current day+hour.
 *  Uses UTC time because week data is bucketed by UTC day boundaries. */
export function proRatedWeekEntries(avgEntryData: Record<string, number>): number {
  const now = new Date();
  const currentHour = now.getUTCHours();
  // JavaScript getUTCDay: 0=Sunday, 1=Monday, ..., 6=Saturday
  const jsDay = now.getUTCDay();
  // Convert to Mon=0..Sun=6
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;

  // Full days completed
  let total = 0;
  for (let i = 0; i < dayIndex; i++) {
    total += avgEntryData[DAYS_OF_WEEK[i]] || 0;
  }

  // Pro-rate current day by hour fraction
  const todayFull = avgEntryData[DAYS_OF_WEEK[dayIndex]] || 0;
  total += todayFull * (currentHour / 24);

  return total;
}

// --- This Year (keys "January"-"December") ---

export function averageYearOccupancy(yearData: Record<string, number>): number {
  return avgNonZero(yearData);
}

function bestMonth(
  yearData: Record<string, number>,
  mode: "max" | "min"
): { month: string; avg: number } {
  let bestMonthName = "";
  let bestVal = mode === "max" ? -Infinity : Infinity;

  for (const month of MONTHS) {
    const val = yearData[month] || 0;
    if (val === 0 && mode === "min") continue;
    if (mode === "max" ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestMonthName = month;
    }
  }

  return { month: bestMonthName || MONTHS[0], avg: bestVal === -Infinity || bestVal === Infinity ? 0 : bestVal };
}

export function busiestMonth(yearData: Record<string, number>) {
  return bestMonth(yearData, "max");
}

export function slowestMonth(yearData: Record<string, number>) {
  return bestMonth(yearData, "min");
}

export function totalYearEntries(entryData: Record<string, number>): number {
  return sumValues(entryData);
}

export function avgMonthlyEntries(entryData: Record<string, number>): number {
  return avgNonZero(entryData);
}

export function busiestEntryMonth(entryData: Record<string, number>) {
  return bestMonth(entryData, "max");
}

export function slowestEntryMonth(entryData: Record<string, number>) {
  return bestMonth(entryData, "min");
}

/** Pro-rate historical average yearly entries to current month+day.
 *  Uses UTC time because year data is bucketed by UTC month boundaries. */
export function proRatedYearEntries(avgEntryData: Record<string, number>): number {
  const now = new Date();
  const currentMonth = now.getUTCMonth(); // 0-indexed
  const currentDay = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), currentMonth + 1, 0)).getUTCDate();

  // Full months completed
  let total = 0;
  for (let i = 0; i < currentMonth; i++) {
    total += avgEntryData[MONTHS[i]] || 0;
  }

  // Pro-rate current month by day fraction
  const thisMonthFull = avgEntryData[MONTHS[currentMonth]] || 0;
  total += thisMonthFull * (currentDay / daysInMonth);

  return total;
}
