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
} from "recharts";

interface ChartData {
  label: string;
  value: number;
  average?: number;
}

interface HistoryChartProps {
  data: ChartData[];
  dataType?: "population" | "entries";
}

export function HistoryChart({ data, dataType }: HistoryChartProps) {
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
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value: number) => Math.round(value)}
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
            name={dataType === "entries" ? "Entries" : "Count"}
            fill="#3b82f6"
            fillOpacity={0.9}
            radius={[4, 4, 0, 0]}
          />
          {hasAverage && (
            <Bar
              dataKey="average"
              name="Average"
              fill="#f97316"
              fillOpacity={0.8}
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
