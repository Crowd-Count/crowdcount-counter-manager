"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { LOCATION_COLORS } from "@/lib/types";
import { useInsightsData } from "@/hooks/useInsightsData";
import type { DeviceCredentials } from "@/hooks/useAggregatedHistory";
import { InsightsContent } from "@/components/InsightsContent";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft } from "lucide-react";

export default function LocationInsightsPage() {
  const params = useParams();
  const locationId = params.id as string;
  const { devices } = useDevices();
  const { getLocation } = useLocations();

  const location = getLocation(locationId);

  const credentials: DeviceCredentials[] = useMemo(() => {
    if (!location) return [];
    return devices
      .filter((d) => location.deviceIds.includes(d.id))
      .map((d) => ({ deviceId: d.deviceId, password: d.password }));
  }, [location, devices]);

  const data = useInsightsData(credentials);

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

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <InsightsContent data={data} />
      </main>
    </div>
  );
}
