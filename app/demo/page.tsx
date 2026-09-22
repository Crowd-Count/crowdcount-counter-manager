"use client";

import { useEffect } from "react";
import { enableDemoMode, seedDemoState } from "@/lib/demo";

/**
 * /demo — turn on demo mode, seed the sample fleet and land on the dashboard.
 * A full navigation (not router.push) remounts the providers so they load the
 * demo store instead of encrypted localStorage.
 */
export default function DemoEntryPage() {
  useEffect(() => {
    enableDemoMode();
    seedDemoState();
    window.location.replace("/dashboard");
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-muted-foreground">Loading demo...</div>
    </div>
  );
}
