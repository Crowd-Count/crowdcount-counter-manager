"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LocationCard } from "@/components/LocationCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlertBanner } from "@/components/AlertBanner";
import Image from "next/image";
import {
  RefreshCw,
  MapPin,
  ExternalLink,
  FlaskConical,
} from "lucide-react";

// Migration screen for existing users who have devices but no locations
function MigrationScreen({
  ungroupedDevices,
  onComplete,
}: {
  ungroupedDevices: Array<{ deviceId: string; password: string; name?: string }>;
  onComplete: () => void;
}) {
  const { adoptAutoLocation } = useLocations();
  const [locationNames, setLocationNames] = useState<Record<string, string>>(() => {
    const names: Record<string, string> = {};
    for (const d of ungroupedDevices) {
      names[d.deviceId] = d.name || d.deviceId;
    }
    return names;
  });
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState("");

  const handleMigrate = async () => {
    setIsMigrating(true);
    setError("");

    try {
      for (const device of ungroupedDevices) {
        const name = locationNames[device.deviceId]?.trim() || device.name || device.deviceId;
        await adoptAutoLocation(device.deviceId, device.password, name);
      }
      onComplete();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsMigrating(false);
    }
  };

  const allNamed = ungroupedDevices.every(
    (d) => locationNames[d.deviceId]?.trim()
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Set Up Your Locations</CardTitle>
          <CardDescription>
            Counters now belong to locations. Give each counter a location name to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ungroupedDevices.map((device) => (
            <div key={device.deviceId} className="space-y-1.5">
              <Label htmlFor={`migrate-${device.deviceId}`} className="text-xs text-muted-foreground">
                {device.deviceId}
              </Label>
              <Input
                id={`migrate-${device.deviceId}`}
                type="text"
                placeholder="e.g., Main Entrance"
                value={locationNames[device.deviceId] ?? ""}
                onChange={(e) =>
                  setLocationNames((prev) => ({
                    ...prev,
                    [device.deviceId]: e.target.value,
                  }))
                }
                disabled={isMigrating}
              />
            </div>
          ))}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            className="w-full"
            onClick={handleMigrate}
            disabled={!allNamed || isMigrating}
          >
            {isMigrating ? "Setting up..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { devices, isLoading, addDevice, refreshAllDevices } =
    useDevices();
  const { locations, getUngroupedDeviceIds, addLocation } = useLocations();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  // Create location dialog state
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationColor, setNewLocationColor] = useState<LocationColorName>("blue");
  const [newLocDeviceId, setNewLocDeviceId] = useState("");
  const [newLocPassword, setNewLocPassword] = useState("");
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [createLocationError, setCreateLocationError] = useState("");

  // Testing toggle — auto-detect from hostname or localStorage
  const [isTesting, setIsTesting] = useState(false);
  useEffect(() => {
    setIsTesting(
      window.location.hostname.includes("staging") ||
      localStorage.getItem("crowdcount_testing") === "true"
    );
  }, []);

  const handleToggleTesting = () => {
    const newValue = !isTesting;
    if (newValue) {
      localStorage.setItem("crowdcount_testing", "true");
    } else {
      localStorage.removeItem("crowdcount_testing");
    }
    // Reload to re-fetch all data from new API
    window.location.reload();
  };

  // Redirect to login if no devices
  useEffect(() => {
    if (!isLoading && devices.length === 0) {
      router.push("/");
    }
  }, [devices, isLoading, router]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAllDevices();
    setIsRefreshing(false);
  };

  const handleCreateLocation = async () => {
    if (!newLocationName.trim()) return;

    const trimmedDeviceId = newLocDeviceId.trim();
    const trimmedPassword = newLocPassword.trim();

    if (!trimmedDeviceId || !trimmedPassword) {
      setCreateLocationError("Please enter counter credentials");
      return;
    }

    setIsCreatingLocation(true);
    setCreateLocationError("");

    try {
      // Check if device already exists in the app
      const existing = devices.find((d) => d.deviceId === trimmedDeviceId);
      if (!existing) {
        // Add the device first
        const success = await addDevice(trimmedDeviceId, trimmedPassword);
        if (!success) {
          setCreateLocationError("Invalid counter credentials");
          setIsCreatingLocation(false);
          return;
        }
      }

      // Create a new location with this device
      const result = await addLocation(
        newLocationName.trim(),
        newLocationColor,
        [trimmedDeviceId]
      );
      if (result) {
        setIsLocationDialogOpen(false);
        setNewLocationName("");
        setNewLocationColor("blue");
        setNewLocDeviceId("");
        setNewLocPassword("");
      } else {
        setCreateLocationError("Failed to create location on server");
      }
    } catch {
      setCreateLocationError("Failed to create location");
    } finally {
      setIsCreatingLocation(false);
    }
  };

  const handleMigrationComplete = useCallback(() => {
    setMigrationDone(true);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Migration: existing users with devices but no locations
  const ungroupedIds = getUngroupedDeviceIds();
  const ungroupedDevices = devices.filter((d) => ungroupedIds.includes(d.id));

  if (ungroupedDevices.length > 0 && locations.length === 0 && !migrationDone) {
    return (
      <MigrationScreen
        ungroupedDevices={ungroupedDevices}
        onComplete={handleMigrationComplete}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Staging banner */}
      {isTesting && (
        <div className="bg-yellow-500 text-black text-center py-2 px-4 font-bold text-sm sticky top-0 z-50">
          STAGING MODE — Connected to api-staging.crowdcount.tech
        </div>
      )}

      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="CrowdCount"
                width={32}
                height={32}
                className="shrink-0"
              />
              <h1 className="text-2xl font-bold">Counter Manager</h1>
            </div>
            <div className="flex items-center gap-2">
              <AlertBanner />
              <ThemeToggle />
              <Button variant="outline" size="icon" asChild>
                <a href="https://crowdcount.tech" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>

              {/* Create Location Dialog */}
              <Dialog
                open={isLocationDialogOpen}
                onOpenChange={(open) => {
                  setIsLocationDialogOpen(open);
                  if (!open) {
                    setNewLocationName("");
                    setNewLocationColor("blue");
                    setNewLocDeviceId("");
                    setNewLocPassword("");
                    setCreateLocationError("");
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="sm:w-auto sm:px-4 sm:h-10">
                    <MapPin className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Create Location</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Location</DialogTitle>
                    <DialogDescription>
                      Create a new location with a counter
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="newLocName">Location Name</Label>
                      <Input
                        id="newLocName"
                        type="text"
                        placeholder="e.g., Main Entrance"
                        value={newLocationName}
                        onChange={(e) => setNewLocationName(e.target.value)}
                        disabled={isCreatingLocation}
                      />
                    </div>

                    {/* Color picker */}
                    <div className="space-y-2">
                      <Label>Color</Label>
                      <div className="flex gap-2">
                        {LOCATION_COLORS.map((color) => (
                          <button
                            key={color.name}
                            type="button"
                            className={`h-8 w-8 rounded-full border-2 transition-all ${
                              newLocationColor === color.name
                                ? "border-foreground scale-110"
                                : "border-transparent"
                            }`}
                            style={{ backgroundColor: color.value }}
                            onClick={() => setNewLocationColor(color.name as LocationColorName)}
                            disabled={isCreatingLocation}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Counter credentials */}
                    <div className="space-y-2">
                      <Label htmlFor="newLocDeviceId">Counter ID</Label>
                      <Input
                        id="newLocDeviceId"
                        type="text"
                        placeholder="e.g., T1234"
                        value={newLocDeviceId}
                        onChange={(e) => setNewLocDeviceId(e.target.value)}
                        disabled={isCreatingLocation}
                        autoCapitalize="characters"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newLocPassword">Password</Label>
                      <Input
                        id="newLocPassword"
                        type="password"
                        placeholder="Enter password"
                        value={newLocPassword}
                        onChange={(e) => setNewLocPassword(e.target.value)}
                        disabled={isCreatingLocation}
                      />
                    </div>

                    {createLocationError && (
                      <p className="text-sm text-destructive">{createLocationError}</p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleCreateLocation}
                      disabled={!newLocationName.trim() || !newLocDeviceId.trim() || !newLocPassword.trim() || isCreatingLocation}
                    >
                      {isCreatingLocation ? "Creating..." : "Create Location"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Location cards */}
        {locations.map((location) => (
          <LocationCard key={location.id} location={location} />
        ))}
      </main>

      {/* Footer with testing toggle */}
      <footer className="border-t mt-8">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-center">
            <button
              onClick={handleToggleTesting}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <FlaskConical className="h-3 w-3" />
              {isTesting ? "Switch to Production" : "Switch to Staging"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
