"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { usePOS } from "@/contexts/POSContext";
import { LOCATION_COLORS, type POSTransactionData } from "@/lib/types";
import * as api from "@/lib/api";
import { fetchPOSTransactions } from "@/lib/posApi";
import {
  useAggregatedHistory,
  type DeviceCredentials,
  type LocationFetchParams,
} from "@/hooks/useAggregatedHistory";
import { HistoryContent } from "@/components/HistoryContent";
import POSConnectDialog from "@/components/POSConnectDialog";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft } from "lucide-react";

export default function LocationHistoryPage() {
  const params = useParams();
  const locationId = params.id as string;
  const { devices, isLoading: devicesLoading } = useDevices();
  const { getLocation, isLoading: locationsLoading } = useLocations();

  const location = getLocation(locationId);

  // Build credentials for fallback + location params for server-side aggregation
  const credentials: DeviceCredentials[] = useMemo(() => {
    if (!location) return [];
    return devices
      .filter((d) => location.deviceIds.includes(d.deviceId))
      .map((d) => ({ deviceId: d.deviceId, password: d.password }));
  }, [location, devices]);

  const locationParams: LocationFetchParams | undefined = useMemo(() => {
    if (!location) return undefined;
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) return undefined;
    return {
      locationId: location.id,
      credentials: locCreds.credentials,
      signingDevice: locCreds.signingDevice,
    };
  }, [location, devices]);

  const history = useAggregatedHistory(credentials, locationParams);
  const { getStatus: getPOSStatus, statusVersion } = usePOS();

  // POS sales data
  const [posSalesData, setPosSalesData] = useState<Record<string, POSTransactionData>>({});
  const [posWeekSales, setPosWeekSales] = useState<Record<string, number>>({});
  const [posYearSales, setPosYearSales] = useState<Record<string, number>>({});
  const posStatus = location ? getPOSStatus(location.id) : undefined;
  const hasPOS = !!posStatus?.connected;
  const [posDialogOpen, setPosDialogOpen] = useState(false);

  // Fetch POS daily sales data
  useEffect(() => {
    if (!hasPOS || !locationParams || !history.selectedDate) return;
    const date = history.selectedDate;
    if (posSalesData[date]) return;

    fetchPOSTransactions(
      locationParams.locationId, date, date,
      locationParams.credentials, locationParams.signingDevice
    )
      .then((data) => setPosSalesData((prev) => ({ ...prev, [date]: data })))
      .catch(() => {});
  }, [hasPOS, locationParams, history.selectedDate, posSalesData]);

  // Fetch POS weekly sales data (7 days from selectedWeekDate)
  useEffect(() => {
    if (!hasPOS || !locationParams || !history.selectedWeekDate) return;
    const startDate = history.selectedWeekDate;

    // Calculate end date (6 days after start)
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const endDate = end.toISOString().split("T")[0];

    fetchPOSTransactions(
      locationParams.locationId, startDate, endDate,
      locationParams.credentials, locationParams.signingDevice
    )
      .then((data) => {
        // We need per-day revenue, but the API returns hourly breakdown for the whole range.
        // Fetch each day individually to get per-day totals.
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const promises = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split("T")[0];
          const label = dayNames[d.getDay()];
          return fetchPOSTransactions(
            locationParams.locationId, dateStr, dateStr,
            locationParams.credentials, locationParams.signingDevice
          )
            .then((dayData) => ({ label, count: dayData.totalTransactions }))
            .catch(() => ({ label, count: 0 }));
        });
        Promise.all(promises).then((results) => {
          const weekSales: Record<string, number> = {};
          for (const r of results) weekSales[r.label] = r.count;
          setPosWeekSales(weekSales);
        });
      })
      .catch(() => {});
  }, [hasPOS, locationParams, history.selectedWeekDate]);

  // Fetch POS yearly sales data (per month)
  useEffect(() => {
    if (!hasPOS || !locationParams || !history.selectedYear) return;
    const year = parseInt(history.selectedYear, 10);
    if (isNaN(year)) return;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const promises = monthNames.map((label, i) => {
      const startDate = `${year}-${String(i + 1).padStart(2, "0")}-01`;
      // Last day of month
      const lastDay = new Date(year, i + 1, 0).getDate();
      const endDate = `${year}-${String(i + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return fetchPOSTransactions(
        locationParams.locationId, startDate, endDate,
        locationParams.credentials, locationParams.signingDevice
      )
        .then((data) => ({ label, count: data.totalTransactions }))
        .catch(() => ({ label, count: 0 }));
    });

    Promise.all(promises).then((results) => {
      const yearSales: Record<string, number> = {};
      for (const r of results) yearSales[r.label] = r.count;
      setPosYearSales(yearSales);
    });
  }, [hasPOS, locationParams, history.selectedYear]);

  const handleDownloadDay = useCallback(async (date: string, dataType: string, filename: string) => {
    if (!locationParams) return;
    const response = await api.getLocationDayDataDetailed(
      locationParams.locationId,
      locationParams.credentials,
      locationParams.signingDevice,
      date,
      dataType === "entries" ? "entries" : "count"
    );
    // Build ChartData[] sorted by time label for CSV
    const allSlots: { label: string; sortKey: number; value: number; average?: number }[] = [];
    for (let slot = 0; slot < 96; slot++) {
      const hour = Math.floor(slot / 4);
      const minute = (slot % 4) * 15;
      const label = `${hour}:${minute.toString().padStart(2, "0")}`;
      const value = response.data[label] ?? 0;
      const average = response.average[label];
      allSlots.push({ label, sortKey: slot, value, average });
    }
    allSlots.sort((a, b) => a.sortKey - b.sortKey);
    // Filter to only slots where data exists (or include all if data exists)
    const hasData = allSlots.some((s) => s.value > 0);
    const chartData = hasData
      ? allSlots.map((s) => ({ label: s.label, value: s.value, average: s.average }))
      : [];
    // Download CSV
    const header = `Label,${dataType === "entries" ? "Entries" : "Count"},Average`;
    const rows = chartData.map((d) => `${d.label},${d.value},${d.average ?? ""}`);
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
  }, [locationParams]);

  if (devicesLoading || locationsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Location not found</p>
          <Button asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const colorValue =
    LOCATION_COLORS.find((c) => c.name === location.colorName)?.value ??
    "#3b82f6";

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
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: colorValue }}
                />
                <div>
                  <h1 className="text-xl font-bold">
                    {location.name} History
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Aggregated data from {location.deviceIds.length} counter
                    {location.deviceIds.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <HistoryContent
          history={history}
          filenamePrefix={(location.name || "location").replace(/\s+/g, "-").toLowerCase()}
          dayDescription="Combined hourly count from location counters"
          weekDescription="Combined daily count from location counters"
          yearDescription="Combined monthly count from location counters"
          onDownloadDay={handleDownloadDay}
          posSalesData={posSalesData}
          posWeekSales={posWeekSales}
          posYearSales={posYearSales}
          hasPOS={hasPOS}
          onConnectPOS={() => setPosDialogOpen(true)}
        />
        {(() => {
          const locCreds = locationParams
            ? { credentials: locationParams.credentials, signingDevice: locationParams.signingDevice }
            : null;
          if (!locCreds) return null;
          return (
            <POSConnectDialog
              locationId={location.id}
              locationName={location.name}
              credentials={locCreds}
              open={posDialogOpen}
              onOpenChange={setPosDialogOpen}
            />
          );
        })()}
      </main>
    </div>
  );
}
