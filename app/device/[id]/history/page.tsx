"use client";

import { useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import * as api from "@/lib/api";
import {
  useAggregatedHistory,
  type DeviceCredentials,
} from "@/hooks/useAggregatedHistory";
import { HistoryContent } from "@/components/HistoryContent";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";

export default function HistoryPage() {
  const params = useParams();
  const deviceId = params.id as string;
  const { getDevice } = useDevices();
  const device = getDevice(deviceId);

  // Store stable credentials to prevent re-fetching when device state updates from polling
  const credentialsRef = useRef<{ deviceId: string; password: string } | null>(null);
  if (device && !credentialsRef.current) {
    credentialsRef.current = { deviceId: device.deviceId, password: device.password };
  }
  const stableCredentials = credentialsRef.current;

  const credentials: DeviceCredentials[] = useMemo(() => {
    if (!stableCredentials) return [];
    return [stableCredentials];
  }, [stableCredentials]);

  const history = useAggregatedHistory(credentials);

  // Handle CSV export
  const handleExport = async () => {
    if (!stableCredentials) return;
    try {
      const blob = await api.exportCsv(stableCredentials.deviceId, stableCredentials.password);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stableCredentials.deviceId}-all.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export:", error);
    }
  };

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
                <h1 className="text-xl font-bold">
                  {device.name || device.deviceId} History
                </h1>
                <p className="text-sm text-muted-foreground">{device.deviceId}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handleExport}>
                <Download className="h-4 w-4" />
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <HistoryContent history={history} />
      </main>
    </div>
  );
}
