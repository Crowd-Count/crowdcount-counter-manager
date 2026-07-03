"use client";

import { useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { resolveLocationTimezone } from "@/lib/locationTimezone";
import { useInsightsData } from "@/hooks/useInsightsData";
import type { DeviceCredentials } from "@/hooks/useAggregatedHistory";
import { InsightsContent } from "@/components/InsightsContent";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft } from "lucide-react";

export default function DeviceInsightsPage() {
  const params = useParams();
  const deviceId = params.id as string;
  const { getDevice } = useDevices();
  const { getLocationForDevice } = useLocations();
  const device = getDevice(deviceId);

  // Pin insights to the timezone of the location containing this counter (if any)
  const timeZone = resolveLocationTimezone(
    device ? getLocationForDevice(device.deviceId) : undefined
  );

  const credentialsRef = useRef<{ deviceId: string; password: string } | null>(null);
  if (device && !credentialsRef.current) {
    credentialsRef.current = { deviceId: device.deviceId, password: device.password };
  }
  const stableCredentials = credentialsRef.current;

  const credentials: DeviceCredentials[] = useMemo(() => {
    if (!stableCredentials) return [];
    return [stableCredentials];
  }, [stableCredentials]);

  const data = useInsightsData(credentials, undefined, timeZone);

  if (!device) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Counter not found</p>
          <Button asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

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
              <div>
                <h1 className="text-xl font-bold">
                  {device.name || device.deviceId} Insights
                </h1>
                <p className="text-sm text-muted-foreground">{device.deviceId}</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <InsightsContent data={data} timeZone={timeZone} />
      </main>
    </div>
  );
}
