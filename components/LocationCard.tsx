"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import type { LocationState, DeviceState, ClosingTime } from "@/lib/types";
import { LOCATION_COLORS, getAppleColorHex } from "@/lib/types";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { useTheme } from "@/contexts/ThemeContext";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Settings,
  BarChart3,
  Lightbulb,
  AlertTriangle,
  Wifi,
  WifiOff,
  Minus,
  Plus,
  Loader2,
  DoorClosed,
} from "lucide-react";
import { MapBackground } from "@/components/MapBackground";
import { logError } from "@/lib/logger";

interface LocationCardProps {
  location: LocationState;
}

function CompactDeviceRow({ device, hasMap }: { device: DeviceState; hasMap?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md ${hasMap ? "bg-muted" : "bg-muted/50"}`}>
      {/* Status dot */}
      <div
        className={`h-2 w-2 rounded-full shrink-0 ${
          device.lastUpdated === null
            ? "bg-gray-400"
            : device.isOnline
              ? "bg-green-500"
              : "bg-red-500"
        }`}
      />

      {/* Name */}
      <span className="text-sm font-medium truncate flex-1 min-w-0">
        {device.name || device.deviceId}
        {device.lastUpdated !== null && !device.isOnline && (
          <span className="text-destructive"> - offline</span>
        )}
      </span>

      {/* Settings gear */}
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" asChild>
        <Link href={`/device/${device.id}/settings`}>
          <Settings className="h-3 w-3" />
        </Link>
      </Button>
    </div>
  );
}

export function LocationCard({ location }: LocationCardProps) {
  const { devices } = useDevices();
  const { addCounterToLocation, refreshLocation } = useLocations();
  const { theme } = useTheme();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isModifyingCount, setIsModifyingCount] = useState(false);

  const handleAddToLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    setIsAdding(true);

    const trimmedId = newDeviceId.trim();
    const trimmedPw = newPassword.trim();
    if (!trimmedId || !trimmedPw) {
      setAddError("Please enter both Counter ID and Password");
      setIsAdding(false);
      return;
    }

    try {
      const result = await addCounterToLocation(location.id, trimmedId, trimmedPw);
      if (result.success) {
        setIsAddOpen(false);
        setNewDeviceId("");
        setNewPassword("");
      } else {
        setAddError(result.error || "Failed to add counter");
      }
    } catch {
      setAddError("Failed to add counter");
    } finally {
      setIsAdding(false);
    }
  };

  // Look up devices by server device ID (d.deviceId), not local UUID
  const memberDevices = devices.filter((d) =>
    location.deviceIds.includes(d.deviceId)
  );

  const locCreds = api.getLocationCredentials(location, devices);

  // Closing time: fetch once on mount, then compute if currently closed
  const [closingTime, setClosingTime] = useState<ClosingTime | null>(null);
  const [now, setNow] = useState(() => new Date());
  const closingTimeFetchedRef = useRef(false);

  useEffect(() => {
    if (closingTimeFetchedRef.current) return;
    const creds = api.getLocationCredentials(location, devices);
    if (!creds) return;
    closingTimeFetchedRef.current = true;
    api.getClosingTime(location.id, creds.credentials, creds.signingDevice)
      .then((ct) => { if (ct) setClosingTime(ct); })
      .catch(() => {});
  }, [location, devices]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const isClosed = useMemo(() => {
    // Operating-hours model: open_hour/open_minute = when business opens,
    // close_hour/close_minute = when business closes.
    if (!closingTime?.days?.length) return false;
    const tz = closingTime.timezone;

    // Get current day-of-week and time in the location's timezone
    const dayStr = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
    const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const todayIndex = dayMap[dayStr];
    if (todayIndex === undefined) return false;

    const timeStr = now.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    const [h, m] = timeStr.split(":").map(Number);
    const currentMin = h * 60 + m;

    const yesterdayIndex = (todayIndex + 6) % 7;

    // Check today's schedule
    const today = closingTime.days.find((d) => d.day_of_week === todayIndex);
    if (today) {
      const openMin = today.open_hour * 60 + today.open_minute;
      const closeMin = today.close_hour * 60 + today.close_minute;
      if (openMin < closeMin) {
        // Same-day hours (e.g., open 9am–5pm)
        if (currentMin >= openMin && currentMin < closeMin) return false;
      } else if (openMin > closeMin) {
        // Overnight hours (e.g., open 8pm–2am)
        if (currentMin >= openMin) return false;
      }
    }

    // Check yesterday's schedule for overnight carry-over
    const yesterday = closingTime.days.find((d) => d.day_of_week === yesterdayIndex);
    if (yesterday) {
      const openMin = yesterday.open_hour * 60 + yesterday.open_minute;
      const closeMin = yesterday.close_hour * 60 + yesterday.close_minute;
      if (openMin > closeMin && currentMin < closeMin) return false;
    }

    // Has schedule for today but not in operating window → closed
    if (today) return true;

    // No schedule for today → open 24h
    return false;
  }, [closingTime, now]);

  const handleLocationIncrement = async () => {
    if (!locCreds) return;
    setIsModifyingCount(true);
    try {
      await api.locationAddToCount(location.id, locCreds.credentials, locCreds.signingDevice, 1);
      await refreshLocation(location.id);
    } catch (error) {
      logError("Failed to increment:", error);
    } finally {
      setIsModifyingCount(false);
    }
  };

  const handleLocationDecrement = async () => {
    if (!locCreds) return;
    setIsModifyingCount(true);
    try {
      await api.locationSubFromCount(location.id, locCreds.credentials, locCreds.signingDevice, 1);
      await refreshLocation(location.id);
    } catch (error) {
      logError("Failed to decrement:", error);
    } finally {
      setIsModifyingCount(false);
    }
  };

  const colorValue =
    location.isOnMap
      ? (location.serverColor || getAppleColorHex(location.colorName, theme))
      : (LOCATION_COLORS.find((c) => c.name === location.colorName)?.value ?? "#3b82f6");

  const showMapBackground =
    location.isOnMap &&
    location.latitude != null &&
    location.longitude != null;

  const cardContent = (
    <>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Color dot */}
            <div
              className="h-3.5 w-3.5 rounded-full shrink-0"
              style={{ backgroundColor: colorValue }}
            />
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {location.name}
                {location.isOverLimit && (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
              </CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {memberDevices.length} counter{memberDevices.length !== 1 ? "s" : ""}
                </span>
                <span className="text-xs">
                  {memberDevices.length === 0 ? (
                    <WifiOff className="h-3 w-3 text-muted-foreground inline" />
                  ) : memberDevices.every((d) => d.lastUpdated === null) ? (
                    <Wifi className="h-3 w-3 text-gray-400 inline" />
                  ) : location.allDevicesOnline ? (
                    <Wifi className="h-3 w-3 text-green-500 inline" />
                  ) : location.someDevicesOnline ? (
                    <Wifi className="h-3 w-3 text-yellow-500 inline" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-red-500 inline" />
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Settings gear */}
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
            <Link href={`/location/${location.id}/settings`}>
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Main count display with +/- */}
        <div className="text-center py-2">
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className={`h-12 w-12 rounded-full ${isClosed ? "opacity-40" : ""}`}
              onClick={handleLocationDecrement}
              disabled={isClosed || isModifyingCount || !locCreds || location.totalCount === null || location.totalCount === 0}
            >
              <Minus className="h-5 w-5" />
            </Button>
            {isClosed ? (
              <p className="text-5xl font-bold text-muted-foreground">Closed</p>
            ) : location.totalCount === null ? (
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            ) : (
              <p
                className={`text-6xl font-bold tabular-nums ${
                  location.isOverLimit ? "text-destructive" : ""
                }`}
              >
                {location.totalCount}
              </p>
            )}
            <Button
              variant="outline"
              size="icon"
              className={`h-12 w-12 rounded-full ${isClosed ? "opacity-40" : ""}`}
              onClick={handleLocationIncrement}
              disabled={isClosed || isModifyingCount || !locCreds || location.totalCount === null}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          {isClosed && (
            <Button variant="link" size="sm" className="mt-1 text-muted-foreground" asChild>
              <Link href={`/location/${location.id}/settings`}>
                <DoorClosed className="h-3.5 w-3.5 mr-1" />
                Edit Operating Hours
              </Link>
            </Button>
          )}
          {!isClosed && location.overcrowdingLimit !== null && location.overcrowdingLimit > 0 && (
            <p
              className={`text-sm mt-1 ${
                location.isOverLimit ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              Limit: {location.overcrowdingLimit}
            </p>
          )}
          <div className="flex gap-2 mt-3 justify-center">
            <Button variant="outline" asChild>
              <Link href={`/location/${location.id}/history`}>
                <BarChart3 className="h-4 w-4 mr-1" />
                View History
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/location/${location.id}/insights`}>
                <Lightbulb className="h-4 w-4 mr-1" />
                View Insights
              </Link>
            </Button>
          </div>
        </div>

        {/* Compact device list */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            Counters
          </p>
          {memberDevices.map((device) => (
            <CompactDeviceRow key={device.id} device={device} hasMap={showMapBackground} />
          ))}

          {/* Incomplete on-map location warning */}
          {location.serverDeviceCount != null &&
            location.serverDeviceCount > location.deviceIds.length ? (() => {
              const missing = location.serverDeviceCount - location.deviceIds.length;
              return (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">
                    This location has <span className="font-semibold">{location.serverDeviceCount}</span> counter{location.serverDeviceCount !== 1 ? "s" : ""} on the map. Add the remaining{" "}
                    <span className="font-semibold">{missing}</span> counter{missing !== 1 ? "s" : ""} for complete data.
                  </p>
                </div>
              );
            })() : null}

          {/* Add counter to location */}
          <Dialog
            open={isAddOpen}
            onOpenChange={(open) => {
              setIsAddOpen(open);
              if (!open) {
                setNewDeviceId("");
                setNewPassword("");
                setAddError("");
              }
            }}
          >
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 rounded-md w-full text-sm text-foreground bg-muted opacity-50 hover:opacity-100 transition-opacity duration-200 ease-in-out">
                <Plus className="h-3.5 w-3.5" />
                Add Counter
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Counter to {location.name}</DialogTitle>
                <DialogDescription>
                  Enter the credentials for your CrowdCount counter
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddToLocation} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`loc-device-${location.id}`}>Counter ID</Label>
                  <Input
                    id={`loc-device-${location.id}`}
                    type="text"
                    placeholder="e.g., T1234"
                    value={newDeviceId}
                    onChange={(e) => setNewDeviceId(e.target.value)}
                    disabled={isAdding}
                    autoCapitalize="characters"
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">Case sensitive</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`loc-pw-${location.id}`}>Password</Label>
                  <Input
                    id={`loc-pw-${location.id}`}
                    type="password"
                    placeholder="Enter password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isAdding}
                    maxLength={128}
                  />
                  <p className="text-xs text-muted-foreground">Case sensitive</p>
                </div>
                {addError && (
                  <p className="text-sm text-destructive">{addError}</p>
                )}
                <DialogFooter>
                  <Button type="submit" disabled={isAdding}>
                    {isAdding ? "Adding..." : "Add Counter"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </>
  );

  return (
    <Card className={`mb-6 rounded-3xl ${showMapBackground ? "relative overflow-hidden" : ""} ${location.isOverLimit ? "border-destructive" : ""}`}>
      {showMapBackground ? (
        <>
          <MapBackground latitude={location.latitude!} longitude={location.longitude!} />
          <div className="absolute inset-0 z-[1] bg-card/15 dark:bg-card/55" />
          <div className="relative z-[2]">{cardContent}</div>
        </>
      ) : (
        cardContent
      )}
    </Card>
  );
}
