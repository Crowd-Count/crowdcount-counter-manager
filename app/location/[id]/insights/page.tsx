"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { usePOS } from "@/contexts/POSContext";
import { LOCATION_COLORS, type POSTransactionData } from "@/lib/types";
import * as api from "@/lib/api";
import { fetchPOSTransactions } from "@/lib/posApi";
import { useInsightsData } from "@/hooks/useInsightsData";
import type { DeviceCredentials } from "@/hooks/useAggregatedHistory";
import type { LocationFetchParams } from "@/lib/dataFetchers";
import { InsightsContent } from "@/components/InsightsContent";
import POSConnectDialog from "@/components/POSConnectDialog";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft } from "lucide-react";

export default function LocationInsightsPage() {
  const params = useParams();
  const locationId = params.id as string;
  const { devices, isLoading: devicesLoading } = useDevices();
  const { getLocation, isLoading: locationsLoading } = useLocations();

  const location = getLocation(locationId);

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

  const data = useInsightsData(credentials, locationParams);
  const { getStatus: getPOSStatus } = usePOS();

  // POS data
  const posStatus = location ? getPOSStatus(location.id) : undefined;
  const hasPOS = !!posStatus?.connected;
  const [posDialogOpen, setPosDialogOpen] = useState(false);
  const [posToday, setPosToday] = useState<POSTransactionData | undefined>();
  const [posWeek, setPosWeek] = useState<POSTransactionData | undefined>();
  const [posYear, setPosYear] = useState<POSTransactionData | undefined>();

  useEffect(() => {
    if (!hasPOS || !locationParams) return;

    const today = new Date().toISOString().split("T")[0];

    // Today
    fetchPOSTransactions(
      locationParams.locationId, today, today,
      locationParams.credentials, locationParams.signingDevice
    ).then(setPosToday).catch(() => {});

    // This week (last 7 days)
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    const weekStartStr = weekStart.toISOString().split("T")[0];
    fetchPOSTransactions(
      locationParams.locationId, weekStartStr, today,
      locationParams.credentials, locationParams.signingDevice
    ).then(setPosWeek).catch(() => {});

    // This year
    const year = new Date().getFullYear();
    fetchPOSTransactions(
      locationParams.locationId, `${year}-01-01`, today,
      locationParams.credentials, locationParams.signingDevice
    ).then(setPosYear).catch(() => {});
  }, [hasPOS, locationParams]);

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
                    {location.name} Insights
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

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <InsightsContent
          data={data}
          posData={{ today: posToday, week: posWeek, year: posYear }}
          hasPOS={hasPOS}
          onConnectPOS={() => setPosDialogOpen(true)}
        />
        {(() => {
          if (!location) return null;
          const locCreds = api.getLocationCredentials(location, devices);
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
