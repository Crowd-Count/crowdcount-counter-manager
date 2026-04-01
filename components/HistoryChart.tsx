"use client";

import {
  ComposedChart,
  Bar,
  Line,
  Cell,
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
  salesCount?: number;
}

interface HistoryChartProps {
  data: ChartData[];
  dataType?: "population" | "entries";
  showSales?: boolean;
}

export function HistoryChart({ data, dataType, showSales }: HistoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No data available
      </div>
    );
  }

  const hasAverage = data.some((d) => d.average !== undefined && d.average > 0);
  const hasSales = showSales && data.some((d) => d.salesCount !== undefined && d.salesCount > 0);
  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.value, d.average || 0))
  );
  const maxSales = hasSales
    ? Math.max(...data.map((d) => d.salesCount || 0))
    : 0;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 5, left: -10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            domain={[0, Math.ceil(maxValue * 1.1)]}
            allowDecimals={false}
          />
          {hasSales && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: "#22c55e" }}
              domain={[0, Math.ceil(maxSales * 1.1) || 1]}
              allowDecimals={false}
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value: number) => Math.round(value)}
          />
          {(hasAverage || hasSales) && (
            <Legend
              wrapperStyle={{ paddingTop: 10 }}
              formatter={(value) => (
                <span className="text-sm text-foreground">{value}</span>
              )}
            />
          )}
          <Bar
            yAxisId="left"
            dataKey="value"
            name={dataType === "entries" ? "Entries" : "Count"}
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
          >
            {data.map((_, i) => (
              <Cell key={i} fillOpacity={i % 2 === 0 ? 1.0 : 0.85} />
            ))}
          </Bar>
          {hasAverage && (
            <Bar
              yAxisId="left"
              dataKey="average"
              name="Average"
              fill="#f97316"
              radius={[4, 4, 0, 0]}
            >
              {data.map((_, i) => (
                <Cell key={i} fillOpacity={i % 2 === 0 ? 0.85 : 0.70} />
              ))}
            </Bar>
          )}
          {hasSales && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="salesCount"
              name="Transactions"
              stroke="#22c55e"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: "#22c55e" }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
