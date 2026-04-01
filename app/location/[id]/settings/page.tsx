"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { LOCATION_COLORS, getAppleColorHex, type LocationColorName, type ClosingTime, type ClosingTimeDay } from "@/lib/types";
import { useTheme } from "@/contexts/ThemeContext";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Save, Trash2, X, Clock, RotateCcw, CreditCard } from "lucide-react";
import { logError } from "@/lib/logger";
import { usePOS } from "@/contexts/POSContext";
import POSConnectDialog from "@/components/POSConnectDialog";
import { disconnectPOS, fetchPOSTransactions } from "@/lib/posApi";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Zurich",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Seoul",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

export default function LocationSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locationId = params.id as string;
  const { devices, isLoading: devicesLoading } = useDevices();
  const {
    getLocation,
    updateLocationName,
    updateLocationColor,
    removeDeviceFromLocation,
    setLocationOvercrowdingLimit,
    removeLocation,
    isLoading: locationsLoading,
  } = useLocations();
  const { theme } = useTheme();
  const { getStatus: getPOSStatus, statusVersion: posVersion } = usePOS();

  const location = getLocation(locationId);

  const [editName, setEditName] = useState(location?.name ?? "");
  const [overcrowdingInput, setOvercrowdingInput] = useState(
    location?.overcrowdingLimit?.toString() ?? ""
  );

  // Sync form fields when server data changes via polling
  useEffect(() => {
    if (location?.name) setEditName(location.name);
  }, [location?.name]);
  useEffect(() => {
    setOvercrowdingInput(location?.overcrowdingLimit?.toString() ?? "");
  }, [location?.overcrowdingLimit]);
  // Closing time state
  const [closingTime, setClosingTime] = useState<ClosingTime | null>(null);
  const [closeHour, setCloseHour] = useState(22);
  const [closeMinute, setCloseMinute] = useState(0);
  const [openHour, setOpenHour] = useState(6);
  const [openMinute, setOpenMinute] = useState(0);
  const [closingTimezone, setClosingTimezone] = useState(getBrowserTimezone());
  const [isLoadingClosing, setIsLoadingClosing] = useState(true);
  const [isSavingClosing, setIsSavingClosing] = useState(false);
  const [isEditingClosing, setIsEditingClosing] = useState(false);
  const [perDayMode, setPerDayMode] = useState(false);
  const [perDayTimes, setPerDayTimes] = useState<Record<number, { closeHour: number; closeMinute: number; openHour: number; openMinute: number; enabled: boolean }>>(() => {
    const init: Record<number, { closeHour: number; closeMinute: number; openHour: number; openMinute: number; enabled: boolean }> = {};
    for (let i = 0; i < 7; i++) {
      init[i] = { closeHour: 22, closeMinute: 0, openHour: 6, openMinute: 0, enabled: true };
    }
    return init;
  });

  // POS state
  const oauthPosAccountId = searchParams.get("pos_account_id") || undefined;
  const oauthPosError = searchParams.get("pos_error") || undefined;
  const [posDialogOpen, setPosDialogOpen] = useState(false);
  const [posDisconnecting, setPosDisconnecting] = useState(false);
  const [posSyncing, setPosSyncing] = useState(false);
  const [posSyncResult, setPosSyncResult] = useState<string | null>(null);

  // Auto-open POS dialog when returning from OAuth callback
  useEffect(() => {
    if (oauthPosAccountId) {
      setPosDialogOpen(true);
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete("pos_account_id");
      url.searchParams.delete("pos_merchant_id");
      window.history.replaceState({}, "", url.toString());
    }
    if (oauthPosError) {
      setPosSyncResult(`Square connection failed: ${oauthPosError}`);
      const url = new URL(window.location.href);
      url.searchParams.delete("pos_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [oauthPosAccountId, oauthPosError]);

  // Danger zone state — must be before early returns to satisfy Rules of Hooks
  const [isErasing, setIsErasing] = useState(false);
  const [eraseDialogOpen, setEraseDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fetch closing time on mount
  useEffect(() => {
    if (!location) return;
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) {
      setIsLoadingClosing(false);
      return;
    }

    api.getClosingTime(location.id, locCreds.credentials, locCreds.signingDevice)
      .then((ct) => {
        if (ct && ct.days && ct.days.length > 0) {
          setClosingTime(ct);
          if (ct.timezone) setClosingTimezone(ct.timezone);

          // Populate uniform fields from first day
          setCloseHour(ct.days[0].close_hour);
          setCloseMinute(ct.days[0].close_minute);
          setOpenHour(ct.days[0].open_hour);
          setOpenMinute(ct.days[0].open_minute);

          // Populate per-day times from server data
          const newPerDay: Record<number, { closeHour: number; closeMinute: number; openHour: number; openMinute: number; enabled: boolean }> = {};
          const serverDays = new Set(ct.days.map((d) => d.day_of_week));
          for (let i = 0; i < 7; i++) {
            const serverDay = ct.days.find((d) => d.day_of_week === i);
            if (serverDay) {
              newPerDay[i] = { closeHour: serverDay.close_hour, closeMinute: serverDay.close_minute, openHour: serverDay.open_hour, openMinute: serverDay.open_minute, enabled: true };
            } else {
              newPerDay[i] = { closeHour: ct.days[0].close_hour, closeMinute: ct.days[0].close_minute, openHour: ct.days[0].open_hour, openMinute: ct.days[0].open_minute, enabled: false };
            }
          }
          setPerDayTimes(newPerDay);

          // Detect if per-day mode is needed: any day has different times or not all 7 days present
          const allSame = ct.days.every((d) =>
            d.close_hour === ct.days[0].close_hour &&
            d.close_minute === ct.days[0].close_minute &&
            d.open_hour === ct.days[0].open_hour &&
            d.open_minute === ct.days[0].open_minute
          );
          const allSevenDays = ct.days.length === 7;
          setPerDayMode(!allSame || !allSevenDays);
        } else {
          setClosingTime(null);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingClosing(false));
  }, [location, devices]);

  if (devicesLoading || locationsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

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

  // Look up devices by server device ID
  const memberDevices = devices.filter((d) =>
    location.deviceIds.includes(d.deviceId)
  );

  // Use location.id (current server ID) for all operations, not locationId from URL params
  // (the server ID may have changed since the URL was loaded)
  const currentId = location.id;

  const handleSaveName = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== location.name) {
      updateLocationName(currentId, trimmed);
    }
  };

  const handleSaveOvercrowding = async () => {
    const limit = parseInt(overcrowdingInput, 10);
    if (!overcrowdingInput || isNaN(limit) || limit <= 0) {
      await setLocationOvercrowdingLimit(currentId, null);
      setOvercrowdingInput("");
    } else {
      await setLocationOvercrowdingLimit(currentId, limit);
    }
  };

  const handleEraseData = async () => {
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) return;

    setEraseDialogOpen(false);
    setIsErasing(true);
    try {
      await api.resetLocationData(currentId, locCreds.credentials, locCreds.signingDevice);
    } catch (err) {
      logError("Failed to erase location data:", err);
    } finally {
      setIsErasing(false);
    }
  };

  const handleDeleteLocation = async () => {
    setDeleteDialogOpen(false);
    await removeLocation(location.localId);
    router.push("/dashboard");
  };

  const handleSaveClosingTime = async () => {
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) return;

    let days: ClosingTimeDay[];
    if (perDayMode) {
      days = Object.entries(perDayTimes)
        .filter(([, v]) => v.enabled)
        .map(([k, v]) => ({
          day_of_week: parseInt(k, 10),
          close_hour: v.closeHour,
          close_minute: v.closeMinute,
          open_hour: v.openHour,
          open_minute: v.openMinute,
        }));
    } else {
      days = Array.from({ length: 7 }, (_, i) => ({
        day_of_week: i,
        close_hour: closeHour,
        close_minute: closeMinute,
        open_hour: openHour,
        open_minute: openMinute,
      }));
    }

    if (days.length === 0) return;

    setIsSavingClosing(true);
    try {
      const ct = await api.setClosingTime(
        currentId,
        locCreds.credentials,
        locCreds.signingDevice,
        closingTimezone,
        days
      );
      setClosingTime(ct);
    } catch (err) {
      logError("Failed to save closing time:", err);
    } finally {
      setIsSavingClosing(false);
    }
  };

  const handleDeleteClosingTime = async () => {
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) return;

    setIsSavingClosing(true);
    try {
      await api.deleteClosingTime(currentId, locCreds.credentials, locCreds.signingDevice);
      setClosingTime(null);
      setIsEditingClosing(false);
      setPerDayMode(false);
      setCloseHour(22);
      setCloseMinute(0);
      setOpenHour(6);
      setOpenMinute(0);
      setClosingTimezone(getBrowserTimezone());
      const init: Record<number, { closeHour: number; closeMinute: number; openHour: number; openMinute: number; enabled: boolean }> = {};
      for (let i = 0; i < 7; i++) {
        init[i] = { closeHour: 22, closeMinute: 0, openHour: 6, openMinute: 0, enabled: true };
      }
      setPerDayTimes(init);
    } catch (err) {
      logError("Failed to delete closing time:", err);
    } finally {
      setIsSavingClosing(false);
    }
  };

  const updatePerDayTime = (day: number, field: string, value: number | boolean) => {
    setPerDayTimes((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const colorValue =
    location.isOnMap
      ? (location.serverColor || getAppleColorHex(location.colorName, theme))
      : (LOCATION_COLORS.find((c) => c.name === location.colorName)?.value ?? "#3b82f6");

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
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: colorValue }}
                />
                <div>
                  <h1 className="text-xl font-bold">
                    {location.name} Settings
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {memberDevices.length} counter{memberDevices.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        {/* Location Name */}
        <Card>
          <CardHeader>
            <CardTitle>Location Name</CardTitle>
            <CardDescription>
              {location.isOnMap
                ? <>Name is synced from the public map. Email <a href="mailto:info@crowdcount.tech" className="underline hover:text-foreground">info@crowdcount.tech</a> to request changes.</>
                : "A friendly name for this group of counters"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Location name"
                disabled={!!location.isOnMap}
                className={location.isOnMap ? "opacity-50" : ""}
                maxLength={100}
              />
              {!location.isOnMap && (
                <Button
                  onClick={handleSaveName}
                  disabled={!editName.trim() || editName.trim() === location.name}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Color — hidden for on-map locations (color comes from server) */}
        {!location.isOnMap && (
          <Card>
            <CardHeader>
              <CardTitle>Color</CardTitle>
              <CardDescription>
                Choose a color to identify this location
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {LOCATION_COLORS.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    className={`h-10 w-10 rounded-full border-2 transition-all ${
                      location.colorName === color.name
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() =>
                      updateLocationColor(currentId, color.name as LocationColorName)
                    }
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Member Devices */}
        <Card>
          <CardHeader>
            <CardTitle>Counters</CardTitle>
            <CardDescription>
              Counters grouped in this location
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {memberDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No counters in this location</p>
            ) : (
              memberDevices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md border"
                >
                  <span className="text-sm font-medium">
                    {device.name || device.deviceId}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={async () => {
                      const newId = await removeDeviceFromLocation(currentId, device.deviceId);
                      if (newId && newId !== currentId) {
                        router.replace(`/location/${newId}/settings`);
                      } else if (!newId) {
                        router.push("/dashboard");
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}

          </CardContent>
        </Card>

        {/* Overcrowding Limit */}
        <Card>
          <CardHeader>
            <CardTitle>Overcrowding Limit</CardTitle>
            <CardDescription>
              Set a combined maximum count threshold for all counters in this
              location. Leave empty to disable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                placeholder="No limit"
                value={overcrowdingInput}
                onChange={(e) => setOvercrowdingInput(e.target.value)}
                maxLength={7}
              />
              <Button onClick={handleSaveOvercrowding}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Closing Time */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Operating Hours
            </CardTitle>
            <CardDescription>
              Set when this location opens and closes each day. Outside operating hours, counts are suppressed and reset to zero at transitions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingClosing ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !closingTime && !isEditingClosing ? (
              <Button
                variant="outline"
                onClick={() => setIsEditingClosing(true)}
              >
                <Clock className="h-4 w-4 mr-1" />
                Set Operating Hours
              </Button>
            ) : (
              <>
                {!perDayMode ? (
                  <>
                    {/* Uniform mode — single open/close time for all days */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Open Hour</Label>
                        <Select
                          value={openHour.toString()}
                          onValueChange={(v) => setOpenHour(parseInt(v, 10))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                              <SelectItem key={i} value={i.toString()}>
                                {i.toString().padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Open Minute</Label>
                        <Select
                          value={openMinute.toString()}
                          onValueChange={(v) => setOpenMinute(parseInt(v, 10))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[0, 15, 30, 45].map((m) => (
                              <SelectItem key={m} value={m.toString()}>
                                {m.toString().padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Close Hour</Label>
                        <Select
                          value={closeHour.toString()}
                          onValueChange={(v) => setCloseHour(parseInt(v, 10))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                              <SelectItem key={i} value={i.toString()}>
                                {i.toString().padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Close Minute</Label>
                        <Select
                          value={closeMinute.toString()}
                          onValueChange={(v) => setCloseMinute(parseInt(v, 10))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[0, 15, 30, 45].map((m) => (
                              <SelectItem key={m} value={m.toString()}>
                                {m.toString().padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                      onClick={() => {
                        // Sync uniform times into all per-day entries before switching
                        const synced: Record<number, { closeHour: number; closeMinute: number; openHour: number; openMinute: number; enabled: boolean }> = {};
                        for (let i = 0; i < 7; i++) {
                          synced[i] = { closeHour, closeMinute, openHour, openMinute, enabled: perDayTimes[i]?.enabled ?? true };
                        }
                        setPerDayTimes(synced);
                        setPerDayMode(true);
                      }}
                    >
                      Customize per day
                    </button>
                  </>
                ) : (
                  <>
                    {/* Per-day mode — each day has its own times */}
                    <div className="space-y-3">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => {
                        const day = perDayTimes[i];
                        return (
                          <div key={i} className={`flex items-center gap-3 ${!day.enabled ? "opacity-40" : ""}`}>
                            <Switch
                              checked={day.enabled}
                              onCheckedChange={(checked) => updatePerDayTime(i, "enabled", checked)}
                            />
                            <span className="text-sm font-medium w-8">{label}</span>
                            {day.enabled ? (
                              <div className="flex items-center gap-2 flex-1">
                                <Select value={day.openHour.toString()} onValueChange={(v) => updatePerDayTime(i, "openHour", parseInt(v, 10))}>
                                  <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 24 }, (_, h) => (
                                      <SelectItem key={h} value={h.toString()}>{h.toString().padStart(2, "0")}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="text-muted-foreground">:</span>
                                <Select value={day.openMinute.toString()} onValueChange={(v) => updatePerDayTime(i, "openMinute", parseInt(v, 10))}>
                                  <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {[0, 15, 30, 45].map((m) => (
                                      <SelectItem key={m} value={m.toString()}>{m.toString().padStart(2, "0")}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="text-xs text-muted-foreground">to</span>
                                <Select value={day.closeHour.toString()} onValueChange={(v) => updatePerDayTime(i, "closeHour", parseInt(v, 10))}>
                                  <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 24 }, (_, h) => (
                                      <SelectItem key={h} value={h.toString()}>{h.toString().padStart(2, "0")}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="text-muted-foreground">:</span>
                                <Select value={day.closeMinute.toString()} onValueChange={(v) => updatePerDayTime(i, "closeMinute", parseInt(v, 10))}>
                                  <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {[0, 15, 30, 45].map((m) => (
                                      <SelectItem key={m} value={m.toString()}>{m.toString().padStart(2, "0")}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">Off</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                      onClick={() => {
                        // Take times from first enabled day
                        const firstEnabled = Object.values(perDayTimes).find((d) => d.enabled);
                        if (firstEnabled) {
                          setCloseHour(firstEnabled.closeHour);
                          setCloseMinute(firstEnabled.closeMinute);
                          setOpenHour(firstEnabled.openHour);
                          setOpenMinute(firstEnabled.openMinute);
                        }
                        setPerDayMode(false);
                      }}
                    >
                      Same every day
                    </button>
                  </>
                )}

                {/* Timezone */}
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select
                    value={closingTimezone}
                    onValueChange={setClosingTimezone}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveClosingTime}
                    disabled={isSavingClosing || (perDayMode && !Object.values(perDayTimes).some((d) => d.enabled))}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {closingTime ? "Update" : "Save"}
                  </Button>
                  {closingTime ? (
                    <Button
                      variant="outline"
                      onClick={handleDeleteClosingTime}
                      disabled={isSavingClosing}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setIsEditingClosing(false)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>

                {/* Summary */}
                {closingTime && closingTime.days.length > 0 && (() => {
                  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                  const allSame = closingTime.days.every((d) =>
                    d.close_hour === closingTime.days[0].close_hour &&
                    d.close_minute === closingTime.days[0].close_minute &&
                    d.open_hour === closingTime.days[0].open_hour &&
                    d.open_minute === closingTime.days[0].open_minute
                  );
                  const tz = (closingTime.timezone ?? "").replace(/_/g, " ");

                  if (allSame && closingTime.days.length === 7) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        Opens at {closingTime.days[0].open_hour.toString().padStart(2, "0")}:{closingTime.days[0].open_minute.toString().padStart(2, "0")}, closes at {closingTime.days[0].close_hour.toString().padStart(2, "0")}:{closingTime.days[0].close_minute.toString().padStart(2, "0")} every day ({tz})
                      </p>
                    );
                  }

                  return (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {closingTime.days.map((d) => (
                        <p key={d.day_of_week}>
                          {dayNames[d.day_of_week]}: {d.open_hour.toString().padStart(2, "0")}:{d.open_minute.toString().padStart(2, "0")} – {d.close_hour.toString().padStart(2, "0")}:{d.close_minute.toString().padStart(2, "0")}
                        </p>
                      ))}
                      <p>({tz})</p>
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>

        {/* Point of Sale */}
        {(() => {
          const locCreds = api.getLocationCredentials(location, devices);
          const posStatus = getPOSStatus(currentId);

          const handleDisconnect = async () => {
            if (!locCreds) return;
            setPosDisconnecting(true);
            try {
              await disconnectPOS(currentId, locCreds.credentials, locCreds.signingDevice);
              window.location.reload();
            } catch {
              setPosDisconnecting(false);
            }
          };

          const handleSyncNow = async () => {
            if (!locCreds) return;
            setPosSyncing(true);
            setPosSyncResult(null);
            try {
              const today = new Date().toISOString().split("T")[0];
              const data = await fetchPOSTransactions(
                currentId,
                today,
                today,
                locCreds.credentials,
                locCreds.signingDevice
              );
              const revenue = (data.totalRevenue / 100).toFixed(2);
              setPosSyncResult(
                `${data.totalTransactions} transactions, $${revenue} ${data.currency}`
              );
            } catch (err) {
              setPosSyncResult(
                `Error: ${err instanceof Error ? err.message : "Sync failed"}`
              );
            } finally {
              setPosSyncing(false);
            }
          };

          return (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Point of Sale
                </CardTitle>
                <CardDescription>
                  {posStatus?.connected
                    ? "Connected POS system"
                    : (
                      <button
                        type="button"
                        onClick={() => setPosDialogOpen(true)}
                        className="hover:text-foreground transition-colors cursor-pointer"
                      >
                        Connect a POS to see sales data alongside foot traffic
                      </button>
                    )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {posStatus?.connected ? (
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium capitalize">
                        {posStatus.provider} — &quot;{posStatus.posLocationName}&quot;
                      </p>
                      {posStatus.connectedAt && (
                        <p className="text-sm text-muted-foreground">
                          Connected {new Date(posStatus.connectedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {posSyncResult && (
                      <p className={`text-sm ${posSyncResult.startsWith("Error") ? "text-destructive" : "text-muted-foreground"}`}>
                        {posSyncResult}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSyncNow}
                        disabled={posSyncing}
                      >
                        {posSyncing ? "Syncing..." : "Sync Now"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={handleDisconnect}
                        disabled={posDisconnecting}
                      >
                        {posDisconnecting ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setPosDialogOpen(true)}
                    disabled={!locCreds}
                  >
                    Connect POS
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {(() => {
          const locCreds = api.getLocationCredentials(location, devices);
          if (!locCreds) return null;
          return (
            <POSConnectDialog
              locationId={currentId}
              locationName={location.name}
              credentials={locCreds}
              open={posDialogOpen}
              onOpenChange={setPosDialogOpen}
              initialPosAccountId={oauthPosAccountId}
            />
          );
        })()}

        {/* Danger Zone */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Erase Location Data</p>
                <p className="text-sm text-muted-foreground">
                  Clears all location-level history data
                </p>
              </div>
              <Button
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setEraseDialogOpen(true)}
                disabled={isErasing}
              >
                <RotateCcw className={`h-4 w-4 mr-1 ${isErasing ? "animate-spin" : ""}`} />
                {isErasing ? "Erasing..." : "Erase Data"}
              </Button>
              <AlertDialog open={eraseDialogOpen} onOpenChange={setEraseDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Erase Location Data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will erase all location-level history data for &quot;{location.name}&quot;. Individual counter data will not be affected. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      onClick={handleEraseData}
                    >
                      Erase Data
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Location</p>
                <p className="text-sm text-muted-foreground">
                  Remove this location and all its counters from the app
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Location?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove &quot;{location.name}&quot; and all its counters from this app. Nothing is deleted on the server.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteLocation}
                    >
                      Delete Location
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
