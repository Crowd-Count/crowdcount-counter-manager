"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { LOCATION_COLORS, type LocationColorName, type ResetSchedule } from "@/lib/types";
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
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Save, Trash2, Plus, X, Clock } from "lucide-react";

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
  const { devices } = useDevices();
  const {
    getLocation,
    updateLocationName,
    updateLocationColor,
    addDeviceToLocation,
    removeDeviceFromLocation,
    setLocationOvercrowdingLimit,
    removeLocation,
    getUngroupedDeviceIds,
  } = useLocations();

  const location = getLocation(locationId);

  const [editName, setEditName] = useState(location?.name ?? "");
  const [overcrowdingInput, setOvercrowdingInput] = useState(
    location?.overcrowdingLimit?.toString() ?? ""
  );
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);

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

    api.getResetSchedule(locationId, locCreds.credentials, locCreds.signingDevice)
      .then((schedule) => {
        setResetSchedule(schedule);
        if (schedule) {
          if (typeof schedule.reset_hour === "number") setResetHour(schedule.reset_hour);
          if (typeof schedule.reset_minute === "number") setResetMinute(schedule.reset_minute);
          if (schedule.timezone) setResetTimezone(schedule.timezone);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingSchedule(false));
  }, [locationId, location, devices]);

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
  const ungroupedIds = getUngroupedDeviceIds();
  const ungroupedDevices = devices.filter((d) => ungroupedIds.includes(d.id));

  const handleSaveName = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== location.name) {
      updateLocationName(locationId, trimmed);
    }
  };

  const handleSaveOvercrowding = async () => {
    const limit = parseInt(overcrowdingInput, 10);
    if (!overcrowdingInput || isNaN(limit) || limit <= 0) {
      await setLocationOvercrowdingLimit(locationId, null);
      setOvercrowdingInput("");
    } else {
      await setLocationOvercrowdingLimit(locationId, limit);
    }
  };

  const handleDeleteLocation = async () => {
    await removeLocation(locationId);
    router.push("/dashboard");
  };

  const handleSaveSchedule = async () => {
    const locCreds = api.getLocationCredentials(location, devices);
    if (!locCreds) return;

    setIsSavingSchedule(true);
    try {
      const schedule = await api.setResetSchedule(
        locationId,
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
      await api.deleteResetSchedule(locationId, locCreds.credentials, locCreds.signingDevice);
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
    LOCATION_COLORS.find((c) => c.name === location.colorName)?.value ??
    "#3b82f6";

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
              A friendly name for this group of counters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Location name"
              />
              <Button
                onClick={handleSaveName}
                disabled={!editName.trim() || editName.trim() === location.name}
              >
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Color */}
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
                    updateLocationColor(locationId, color.name as LocationColorName)
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>

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
                    onClick={() =>
                      removeDeviceFromLocation(locationId, device.deviceId)
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}

            {/* Add device section */}
            {ungroupedDevices.length > 0 && (
              <>
                {isAddDeviceOpen ? (
                  <div className="border rounded-md p-2 space-y-1">
                    <p className="text-xs text-muted-foreground px-2 pb-1">
                      Select a counter to add:
                    </p>
                    {ungroupedDevices.map((device) => (
                      <button
                        key={device.id}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                        onClick={() => {
                          addDeviceToLocation(locationId, device.deviceId);
                          if (ungroupedDevices.length <= 1) {
                            setIsAddDeviceOpen(false);
                          }
                        }}
                      >
                        {device.name || device.deviceId}
                      </button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setIsAddDeviceOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setIsAddDeviceOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Counter
                  </Button>
                )}
              </>
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
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Location</p>
                <p className="text-sm text-muted-foreground">
                  Ungroups all counters from this location
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Location?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete the location &quot;{location.name}&quot;. All
                      counters will be ungrouped. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteLocation}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete Location
                    </AlertDialogAction>
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
