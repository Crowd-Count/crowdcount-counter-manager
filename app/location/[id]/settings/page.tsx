"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { LOCATION_COLORS, getAppleColorHex, type LocationColorName, type ResetSchedule } from "@/lib/types";
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
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Save, Trash2, X, Clock, RotateCcw } from "lucide-react";

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
  // Reset schedule state
  const [resetSchedule, setResetSchedule] = useState<ResetSchedule | null>(null);
  const [resetHour, setResetHour] = useState(0);
  const [resetMinute, setResetMinute] = useState(0);
  const [resetTimezone, setResetTimezone] = useState(getBrowserTimezone());
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);

  // Fetch reset schedule on mount
  useEffect(() => {
    if (!location) return;
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) {
      setIsLoadingSchedule(false);
      return;
    }

    api.getResetSchedule(location.id, locCreds.credentials, locCreds.signingDevice)
      .then((schedule) => {
        // Treat as no schedule if reset_hour is missing/invalid
        if (schedule && typeof schedule.reset_hour === "number") {
          setResetSchedule(schedule);
          setResetHour(schedule.reset_hour);
          if (typeof schedule.reset_minute === "number") setResetMinute(schedule.reset_minute);
          if (schedule.timezone) setResetTimezone(schedule.timezone);
        } else {
          setResetSchedule(null);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingSchedule(false));
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

  const [isErasing, setIsErasing] = useState(false);
  const [eraseDialogOpen, setEraseDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleEraseData = async () => {
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) return;

    setEraseDialogOpen(false);
    setIsErasing(true);
    try {
      await api.resetLocationData(currentId, locCreds.credentials, locCreds.signingDevice);
    } catch (err) {
      console.error("Failed to erase location data:", err);
    } finally {
      setIsErasing(false);
    }
  };

  const handleDeleteLocation = async () => {
    setDeleteDialogOpen(false);
    await removeLocation(location.localId);
    router.push("/dashboard");
  };

  const handleSaveSchedule = async () => {
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) return;

    setIsSavingSchedule(true);
    try {
      const schedule = await api.setResetSchedule(
        currentId,
        locCreds.credentials,
        locCreds.signingDevice,
        resetHour,
        resetMinute,
        resetTimezone
      );
      setResetSchedule(schedule);
    } catch (err) {
      console.error("Failed to save reset schedule:", err);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async () => {
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) return;

    setIsSavingSchedule(true);
    try {
      await api.deleteResetSchedule(currentId, locCreds.credentials, locCreds.signingDevice);
      setResetSchedule(null);
      setIsEditingSchedule(false);
      setResetHour(0);
      setResetMinute(0);
      setResetTimezone(getBrowserTimezone());
    } catch (err) {
      console.error("Failed to delete reset schedule:", err);
    } finally {
      setIsSavingSchedule(false);
    }
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
              />
              <Button onClick={handleSaveOvercrowding}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Daily Reset */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Daily Reset
            </CardTitle>
            <CardDescription>
              All counter counts will reset to 0 at this time every day. We recommend setting this during a time your location is closed or usually empty so that your total count doesn&apos;t shift over time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingSchedule ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !resetSchedule && !isEditingSchedule ? (
              <Button
                variant="outline"
                onClick={() => setIsEditingSchedule(true)}
              >
                <Clock className="h-4 w-4 mr-1" />
                Set Daily Reset
              </Button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Hour</Label>
                    <Select
                      value={(resetHour ?? 0).toString()}
                      onValueChange={(v) => setResetHour(parseInt(v, 10))}
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
                    <Label>Minute</Label>
                    <Select
                      value={(resetMinute ?? 0).toString()}
                      onValueChange={(v) => setResetMinute(parseInt(v, 10))}
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
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select
                    value={resetTimezone}
                    onValueChange={setResetTimezone}
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
                <div className="flex gap-2">
                  <Button onClick={handleSaveSchedule} disabled={isSavingSchedule}>
                    <Save className="h-4 w-4 mr-1" />
                    {resetSchedule ? "Update" : "Save"}
                  </Button>
                  {resetSchedule ? (
                    <Button
                      variant="outline"
                      onClick={handleDeleteSchedule}
                      disabled={isSavingSchedule}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setIsEditingSchedule(false)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
                {resetSchedule && typeof resetSchedule.reset_hour === "number" && (
                  <p className="text-xs text-muted-foreground">
                    Currently resets daily at{" "}
                    {resetSchedule.reset_hour.toString().padStart(2, "0")}:
                    {(resetSchedule.reset_minute ?? 0).toString().padStart(2, "0")}{" "}
                    ({(resetSchedule.timezone ?? "").replace(/_/g, " ")})
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

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
