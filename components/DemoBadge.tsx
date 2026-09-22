"use client";

import { useSyncExternalStore } from "react";
import { disableDemoMode, isDemoMode } from "@/lib/demo";

// Demo mode only flips on /demo (full navigation) and off via this badge, so
// there is nothing to subscribe to; the store read runs after hydration.
const emptySubscribe = () => () => {};

/** Slim fixed pill shown only in demo mode, with an exit control. */
export function DemoBadge() {
  const active = useSyncExternalStore(emptySubscribe, isDemoMode, () => false);
  if (!active) return null;

  const exitDemo = () => {
    disableDemoMode();
    window.location.replace("/");
  };

  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-2 rounded-full border bg-card/90 px-3 py-1.5 text-xs shadow-md backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      <span className="font-medium">Demo</span>
      <span className="text-muted-foreground hidden sm:inline">Sample data</span>
      <button
        type="button"
        onClick={exitDemo}
        className="ml-1 text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
      >
        Exit demo
      </button>
    </div>
  );
}
