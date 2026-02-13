"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import { LOCATION_COLORS, type LocationColorName } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DeviceCard } from "@/components/DeviceCard";
import { LocationCard } from "@/components/LocationCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlertBanner } from "@/components/AlertBanner";
import Image from "next/image";
import {
  Plus,
  RefreshCw,
  MapPin,
  ExternalLink,
  FlaskConical,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { devices, isLoading, addDevice, refreshAllDevices } =
    useDevices();
  const { locations, getUngroupedDeviceIds, addLocation } = useLocations();

  // Add device dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Create location dialog state
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationColor, setNewLocationColor] = useState<LocationColorName>("blue");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
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

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    setIsAdding(true);

    const trimmedDeviceId = newDeviceId.trim();
    const trimmedPassword = newPassword.trim();

    if (!trimmedDeviceId || !trimmedPassword) {
      setAddError("Please enter both Counter ID and Password");
      setIsAdding(false);
      return;
    }

    try {
      const success = await addDevice(trimmedDeviceId, trimmedPassword);
      if (success) {
        setIsAddDialogOpen(false);
        setNewDeviceId("");
        setNewPassword("");
      } else {
        setAddError("Invalid credentials or counter already added");
      }
    } catch {
      setAddError("Failed to add counter");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAllDevices();
    setIsRefreshing(false);
  };

  const handleCreateLocation = async () => {
    if (!newLocationName.trim()) return;
    if (selectedDeviceIds.length === 0) {
      setCreateLocationError("Select at least one counter");
      return;
    }

    setIsCreatingLocation(true);
    setCreateLocationError("");

    // selectedDeviceIds are server device IDs (d.deviceId)
    const result = await addLocation(newLocationName.trim(), newLocationColor, selectedDeviceIds);
    if (result) {
      setIsLocationDialogOpen(false);
      setNewLocationName("");
      setNewLocationColor("blue");
      setSelectedDeviceIds([]);
    } else {
      setCreateLocationError("Failed to create location on server");
    }
    setIsCreatingLocation(false);
  };

  const toggleDeviceSelection = (serverDeviceId: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(serverDeviceId)
        ? prev.filter((id) => id !== serverDeviceId)
        : [...prev, serverDeviceId]
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const ungroupedDeviceIds = getUngroupedDeviceIds();
  const ungroupedDevices = devices.filter((d) =>
    ungroupedDeviceIds.includes(d.id)
  );

  // Available counters for the create-location dialog (currently ungrouped, use server device IDs)
  const availableForLocation = ungroupedDevices;

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
                    setSelectedDeviceIds([]);
                    setNewLocationName("");
                    setNewLocationColor("blue");
                    setCreateLocationError("");
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="sm:w-auto sm:px-4 sm:h-10">
                    <MapPin className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Group Counters</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Location</DialogTitle>
                    <DialogDescription>
                      Group counters into a named location
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="locationName">Name</Label>
                      <Input
                        id="locationName"
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

                    {/* Device selection — uses server device IDs */}
                    {availableForLocation.length > 0 && (
                      <div className="space-y-2">
                        <Label>Counters</Label>
                        <div className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
                          {availableForLocation.map((device) => (
                            <button
                              key={device.id}
                              type="button"
                              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                selectedDeviceIds.includes(device.deviceId)
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-accent"
                              }`}
                              onClick={() => toggleDeviceSelection(device.deviceId)}
                              disabled={isCreatingLocation}
                            >
                              {device.name || device.deviceId}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {createLocationError && (
                      <p className="text-sm text-destructive">{createLocationError}</p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleCreateLocation}
                      disabled={!newLocationName.trim() || selectedDeviceIds.length === 0 || isCreatingLocation}
                    >
                      {isCreatingLocation ? "Creating..." : "Create Location"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Add Device Dialog */}
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Counter</DialogTitle>
                    <DialogDescription>
                      Enter the credentials for your CrowdCount counter
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddDevice} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="newDeviceId">Counter ID</Label>
                      <Input
                        id="newDeviceId"
                        type="text"
                        placeholder="e.g., T1234"
                        value={newDeviceId}
                        onChange={(e) => setNewDeviceId(e.target.value)}
                        disabled={isAdding}
                        autoCapitalize="characters"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        placeholder="Enter password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={isAdding}
                      />
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
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Web disclaimer */}
        <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
          <p className="text-xs text-muted-foreground text-center">
            Note: Promotions and counter setup are not available on web. Download the iOS app on the App Store{" "}
            <a href="https://crowdcount.tech/app" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
              here
            </a>.
          </p>
        </div>

        {/* Location cards */}
        {locations.map((location) => (
          <LocationCard key={location.id} location={location} />
        ))}

        {/* Ungrouped device cards */}
        {ungroupedDevices.length > 0 && (
          <>
            {locations.length > 0 && (
              <h2 className="text-lg font-semibold text-muted-foreground mb-4">
                Ungrouped Counters
              </h2>
            )}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ungroupedDevices.map((device) => (
                <DeviceCard key={device.id} device={device} />
              ))}
            </div>
          </>
        )}
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
