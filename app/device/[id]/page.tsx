"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useDevices } from "@/contexts/DevicesContext";

// Redirect to dashboard - device details are shown on the main dashboard
export default function DevicePage() {
  const router = useRouter();
  const params = useParams();
  const { getDevice, isLoading } = useDevices();

  useEffect(() => {
    if (!isLoading) {
      const device = getDevice(params.id as string);
      if (device) {
        // Could redirect to history or settings, for now go to dashboard
        router.push("/dashboard");
      } else {
        router.push("/");
      }
    }
  }, [isLoading, params.id, router, getDevice]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}
