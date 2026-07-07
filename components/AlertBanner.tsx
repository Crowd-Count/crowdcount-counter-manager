"use client";

import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";
import type { AlertInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bell,
  Info,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  BookOpen,
  Leaf,
  X,
} from "lucide-react";

const SEEN_KEY_PREFIX = "crowdcount_alert_seen_";

function hasSeenAlert(alertId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(`${SEEN_KEY_PREFIX}${alertId}`) === "true";
}

function markAlertSeen(alertId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${SEEN_KEY_PREFIX}${alertId}`, "true");
}

function AlertIcon({ type }: { type: string }) {
  switch (type) {
    case "warning":
      return <AlertTriangle className="h-8 w-8 text-yellow-500" />;
    case "celebration":
      return <Sparkles className="h-8 w-8 text-yellow-500" />;
    case "privacy":
      return <ShieldCheck className="h-8 w-8 text-blue-500" />;
    case "terms-of-use":
      return <BookOpen className="h-8 w-8 text-orange-500" />;
    case "leaf":
      return <Leaf className="h-8 w-8 text-green-500" />;
    default:
      return <Info className="h-8 w-8 text-blue-500" />;
  }
}

export function AlertBanner() {
  const [alertInfo, setAlertInfo] = useState<AlertInfo | null>(null);
  const [alertExists, setAlertExists] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .checkIfAlert()
      .then(async (exists) => {
        if (cancelled) return;
        if (!exists) {
          setAlertExists(false);
          setAlertInfo(null);
          return;
        }
        setAlertExists(true);
        const info = await api.getActiveAlert();
        if (cancelled || !info) return;
        setAlertInfo(info);

        // Auto-show if user hasn't seen this alert
        if (!hasSeenAlert(info.alertId)) {
          setShowDialog(true);
        }
      })
      .catch(() => {
        // Alert check is best-effort; banner simply stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = () => {
    if (alertInfo) {
      markAlertSeen(alertInfo.alertId);
    }
    setShowDialog(false);
  };

  if (!alertExists) return null;

  return (
    <>
      {/* Bell icon button — shown in the header area */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setShowDialog(true)}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
      </Button>

      {/* Alert dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex flex-col items-center gap-3 pt-2">
              {alertInfo && <AlertIcon type={alertInfo.type} />}
              <DialogTitle className="text-center text-lg">
                {alertInfo?.title ?? "Alert"}
              </DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground text-center whitespace-pre-line px-2">
            {alertInfo?.body}
          </p>
          <DialogFooter className="sm:justify-center">
            <Button onClick={handleDismiss}>
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
