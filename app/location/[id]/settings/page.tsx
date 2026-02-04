"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { LOCATION_COLORS, type LocationColorName } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, Save, Trash2, Plus, X } from "lucide-react";

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
  const [isSavingOvercrowding, setIsSavingOvercrowding] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);

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

  const memberDevices = devices.filter((d) =>
    location.deviceIds.includes(d.id)
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
    setIsSavingOvercrowding(true);
    try {
      const limit = parseInt(overcrowdingInput, 10);
      if (!overcrowdingInput || isNaN(limit) || limit <= 0) {
        await setLocationOvercrowdingLimit(locationId, null);
        setOvercrowdingInput("");
      } else {
        await setLocationOvercrowdingLimit(locationId, limit);
      }
    } catch (error) {
      console.error("Failed to save overcrowding limit:", error);
    } finally {
      setIsSavingOvercrowding(false);
    }
  };

  const handleDeleteLocation = async () => {
    await removeLocation(locationId);
    router.push("/dashboard");
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
                    {memberDevices.length} device{memberDevices.length !== 1 ? "s" : ""}
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
              A friendly name for this group of devices
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
            <CardTitle>Devices</CardTitle>
            <CardDescription>
              Devices grouped in this location
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {memberDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No devices in this location</p>
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
                      removeDeviceFromLocation(locationId, device.id)
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
                      Select a device to add:
                    </p>
                    {ungroupedDevices.map((device) => (
                      <button
                        key={device.id}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
                        onClick={() => {
                          addDeviceToLocation(locationId, device.id);
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
                    Add Device
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
              Set a combined maximum count threshold for all devices in this
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
              <Button
                onClick={handleSaveOvercrowding}
                disabled={isSavingOvercrowding}
              >
                <Save className="h-4 w-4 mr-1" />
                {isSavingOvercrowding ? "Saving..." : "Save"}
              </Button>
            </div>
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
                  Ungroups all devices and deletes the server overcrowding group
                  if one exists
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
                      devices will be ungrouped. This action cannot be undone.
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
