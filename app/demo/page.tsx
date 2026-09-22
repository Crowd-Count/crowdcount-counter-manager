"use client";

import { useEffect, useState } from "react";
import { enableDemoMode, seedDemoState } from "@/lib/demo";

/**
 * /demo — turn on demo mode, seed the sample fleet and land on the dashboard.
 * A full navigation (not router.push) remounts the providers so they load the
 * demo store instead of encrypted localStorage.
 *
 * Seeding must never be able to strand a visitor on this screen: if anything
 * throws (storage disabled inside an embedded frame, a bad Intl timezone, a
 * stale persisted blob) the navigation still happens, and the dashboard seeds
 * lazily through getDemoState(). The manual link is the last resort, for the
 * case where the navigation itself never takes.
 */
export default function DemoEntryPage() {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    try {
      enableDemoMode();
      seedDemoState();
    } catch {
      // Fall through — the dashboard seeds on first read.
    } finally {
      window.location.replace("/dashboard");
    }
    const timer = setTimeout(() => setStalled(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <p>Loading demo...</p>
        {stalled && (
          <a href="/dashboard" className="text-sm underline">
            Continue to the dashboard
          </a>
        )}
      </div>
    </div>
  );
}
