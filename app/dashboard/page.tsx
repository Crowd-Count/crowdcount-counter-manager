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
} from "@/components/ui/dialog";
import { LocationCard } from "@/components/LocationCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlertBanner } from "@/components/AlertBanner";
import Image from "next/image";
import {
  RefreshCw,
  MapPin,
  ExternalLink,
  WifiOff,
  Plus,
  X,
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
  const { devices, isLoading, addDevice } =
    useDevices();
  const { locations, getUngroupedDeviceIds, addLocation, refreshAllLocations, hasConnectionError } = useLocations();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  // Create location dialog state
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationColor, setNewLocationColor] = useState<LocationColorName>("blue");
  const [newLocCounters, setNewLocCounters] = useState<Array<{ deviceId: string; password: string }>>([{ deviceId: "", password: "" }]);
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [createLocationError, setCreateLocationError] = useState("");

  // Redirect to login if no devices
  useEffect(() => {
    if (!isLoading && devices.length === 0) {
      router.push("/");
    }
  }, [devices, isLoading, router]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAllLocations();
    setIsRefreshing(false);
  };

  const handleCreateLocation = async () => {
    if (!newLocationName.trim()) return;

    // Filter to entries with both fields filled, dedup by device ID
    const seen = new Set<string>();
    const validCounters = newLocCounters
      .map((c) => ({ deviceId: c.deviceId.trim(), password: c.password.trim() }))
      .filter((c) => {
        if (!c.deviceId || !c.password || seen.has(c.deviceId)) return false;
        seen.add(c.deviceId);
        return true;
      });

    if (validCounters.length === 0) {
      setCreateLocationError("Please enter at least one counter's credentials");
      return;
    }

    setIsCreatingLocation(true);
    setCreateLocationError("");

    try {
      // Validate all credentials upfront before modifying any state
      const needsRegistration: Array<{ deviceId: string; password: string }> = [];
      for (const counter of validCounters) {
        const existing = devices.find((d) => d.deviceId === counter.deviceId);
        if (!existing) {
          needsRegistration.push(counter);
        }
      }

      // Register new counters — addDevice validates password with server
      for (const counter of needsRegistration) {
        const success = await addDevice(counter.deviceId, counter.password);
        if (!success) {
          setCreateLocationError(`Invalid credentials for ${counter.deviceId}`);
          return;
        }
      }

      // Build password overrides so addLocation can build credentials
      // even if devicesRef hasn't flushed yet
      const passwordOverrides: Record<string, string> = {};
      for (const counter of validCounters) {
        passwordOverrides[counter.deviceId] = counter.password;
      }

      const allDeviceIds = validCounters.map((c) => c.deviceId);

      const result = await addLocation(
        newLocationName.trim(),
        newLocationColor,
        allDeviceIds,
        passwordOverrides
      );
      if (result) {
        setIsLocationDialogOpen(false);
        setNewLocationName("");
        setNewLocationColor("blue");
        setNewLocCounters([{ deviceId: "", password: "" }]);
      } else {
        setCreateLocationError("Failed to create location on server");
      }
    } catch {
      setCreateLocationError("Failed to connect. Please try again.");
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

              <Button
                variant="outline"
                size="icon"
                className="sm:w-auto sm:px-4 sm:h-10"
                onClick={() => setIsLocationDialogOpen(true)}
              >
                <MapPin className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Create Location</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <p className="text-xs text-muted-foreground text-center mb-4 px-2">
          Note: Promotions and counter setup are not available on web. Download the iOS app on the App Store{" "}
          <a href="https://crowdcount.tech/app" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
            here
          </a>.
        </p>

        {hasConnectionError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl px-4 py-4 mb-4 text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <WifiOff className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium">We&apos;re having trouble connecting you.</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This could be due to low connection strength, a network issue on our end, or server maintenance.
            </p>
            <p className="text-xs text-muted-foreground">
              Please be patient and try again later.{" "}
              <a href="https://crowdcount.tech/status" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
                Visit our status page
              </a>{" "}
              if the issue persists.
            </p>
          </div>
        )}

        <div className="bg-muted/60 border border-border rounded-2xl px-4 py-3 mb-4 text-center text-sm">
          <span className="font-medium">Counter offline?</span>{" "}
          <span className="text-muted-foreground">Try unplugging it from power and plugging it back in.</span>
        </div>

        {/* Location cards */}
        {locations.map((location) => (
          <LocationCard key={location.localId} location={location} />
        ))}

        {/* Bottom create location button */}
        <button
          onClick={() => setIsLocationDialogOpen(true)}
          className="w-full py-4 rounded-2xl border-2 border-dashed border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm font-medium">Create Location</span>
        </button>
      </main>

      {/* Create Location Dialog */}
      <Dialog
        open={isLocationDialogOpen}
        onOpenChange={(open) => {
          setIsLocationDialogOpen(open);
          if (!open) {
            setNewLocationName("");
            setNewLocationColor("blue");
            setNewLocCounters([{ deviceId: "", password: "" }]);
            setCreateLocationError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Location</DialogTitle>
            <DialogDescription>
              Create a new location with one or more counters
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
            <div className="space-y-3">
              <Label>Counters</Label>
              {newLocCounters.map((counter, idx) => (
                <div key={idx} className="space-y-2 relative">
                  {newLocCounters.length > 1 && (
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setNewLocCounters((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={isCreatingLocation}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <div className="space-y-2">
                    <Input
                      type="text"
                      placeholder="e.g., T1234"
                      value={counter.deviceId}
                      onChange={(e) =>
                        setNewLocCounters((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, deviceId: e.target.value } : c))
                        )
                      }
                      disabled={isCreatingLocation}
                      autoCapitalize="characters"
                    />
                    <p className="text-xs text-muted-foreground">Case sensitive</p>
                  </div>
                  <div className="space-y-2">
                    <Input
                      type="password"
                      placeholder="Enter password"
                      value={counter.password}
                      onChange={(e) =>
                        setNewLocCounters((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, password: e.target.value } : c))
                        )
                      }
                      disabled={isCreatingLocation}
                    />
                    <p className="text-xs text-muted-foreground">Case sensitive</p>
                  </div>
                  {idx < newLocCounters.length - 1 && (
                    <div className="border-b border-border" />
                  )}
                </div>
              ))}
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setNewLocCounters((prev) => [...prev, { deviceId: "", password: "" }])}
                disabled={isCreatingLocation}
              >
                + Add another counter
              </button>
            </div>

            {createLocationError && (
              <p className="text-sm text-destructive">{createLocationError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateLocation}
              disabled={
                !newLocationName.trim() ||
                !newLocCounters.some((c) => c.deviceId.trim() && c.password.trim()) ||
                isCreatingLocation
              }
            >
              {isCreatingLocation ? "Creating..." : "Create Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
