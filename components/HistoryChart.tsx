"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface ChartData {
  label: string;
  value: number;
  average?: number;
}

interface HistoryChartProps {
  data: ChartData[];
}

export function HistoryChart({ data }: HistoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No data available
      </div>
    );
  }

  const hasAverage = data.some((d) => d.average !== undefined && d.average > 0);
  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.value, d.average || 0))
  );

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            domain={[0, Math.ceil(maxValue * 1.1)]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          {hasAverage && (
            <Legend
              wrapperStyle={{ paddingTop: 10 }}
              formatter={(value) => (
                <span className="text-sm text-foreground">{value}</span>
              )}
            />
          )}
          <Bar
            dataKey="value"
            name="Count"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
          />
          {hasAverage && (
            <Bar
              dataKey="average"
              name="Average"
              fill="hsl(var(--muted-foreground))"
              opacity={0.5}
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
