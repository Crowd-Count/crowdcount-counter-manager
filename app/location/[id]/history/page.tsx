"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { LOCATION_COLORS } from "@/lib/types";
import * as api from "@/lib/api";
import {
  useAggregatedHistory,
  type DeviceCredentials,
  type LocationFetchParams,
} from "@/hooks/useAggregatedHistory";
import { HistoryContent } from "@/components/HistoryContent";
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
        />
      </main>
    </div>
  );
}
