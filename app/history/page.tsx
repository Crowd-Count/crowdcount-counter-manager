"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import {
  useAggregatedHistory,
  type DeviceCredentials,
} from "@/hooks/useAggregatedHistory";
import { HistoryContent } from "@/components/HistoryContent";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, RefreshCw } from "lucide-react";

export default function AggregateHistoryPage() {
  const { devices, isLoading } = useDevices();

  const credentials: DeviceCredentials[] = useMemo(() => {
    if (devices.length < 2) return [];
    return devices.map((d) => ({
      deviceId: d.deviceId,
      password: d.password,
    }));
  }, [devices]);

  const history = useAggregatedHistory(credentials);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (devices.length < 2) {
    return null;
  }

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
              <div>
                <h1 className="text-xl font-bold">Total History</h1>
                <p className="text-sm text-muted-foreground">
                  Aggregated data from {devices.length} counters
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <HistoryContent
          history={history}
          dayDescription="Combined hourly count from all counters"
          weekDescription="Combined daily count from all counters"
          yearDescription="Combined monthly count from all counters"
        />
      </main>
    </div>
  );
}
