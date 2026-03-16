"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { ArrowLeft, Trash2, RefreshCw } from "lucide-react";
import { logError } from "@/lib/logger";

export default function DeviceSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const deviceId = params.id as string;
  const {
    getDevice,
    refreshDevice,
  } = useDevices();
  const { getLocationForDevice, removeDeviceFromLocation } = useLocations();

  const device = getDevice(deviceId);

  // Direction flip state
  const [directionFlipped, setDirectionFlipped] = useState(false);
  const [isTogglingDirection, setIsTogglingDirection] = useState(false);
  const [isLoadingDirection, setIsLoadingDirection] = useState(true);

  // Reset state
  const [isResetting, setIsResetting] = useState(false);

  // Load direction flipped state
  const loadDirectionFlipped = useCallback(async () => {
    if (!device) return;
    setIsLoadingDirection(true);
    try {
      const flipped = await api.getDirectionFlipped(
        device.deviceId,
        device.password
      );
      setDirectionFlipped(flipped);
    } catch (error) {
      logError("Failed to load direction:", error);
    } finally {
      setIsLoadingDirection(false);
    }
  }, [device]);

  // Load initial data
  useEffect(() => {
    if (device) {
      loadDirectionFlipped();
    }
  }, [device, loadDirectionFlipped]);

  if (!device) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Counter not found</p>
          <Button asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleToggleDirection = async () => {
    setIsTogglingDirection(true);
    try {
      await api.setDirectionFlipped(
        device.deviceId,
        device.password,
        !directionFlipped
      );
      setDirectionFlipped(!directionFlipped);
    } catch (error) {
      logError("Failed to toggle direction:", error);
    } finally {
      setIsTogglingDirection(false);
    }
  };

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      await api.resetDeviceData(device.deviceId, device.password);
      await refreshDevice(device.id);
    } catch (error) {
      logError("Failed to reset data:", error);
    } finally {
      setIsResetting(false);
    }
  };

  const handleRemoveDevice = async () => {
    // Find the location containing this device and remove through location-aware flow
    const loc = getLocationForDevice(device.deviceId);
    if (loc) {
      await removeDeviceFromLocation(loc.id, device.deviceId);
    }
    router.push("/dashboard");
  };

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
              <div>
                <h1 className="text-xl font-bold">
                  {device.name || device.deviceId} Settings
                </h1>
                <p className="text-sm text-muted-foreground">{device.deviceId}</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        {/* Direction Flip */}
        <Card>
          <CardHeader>
            <CardTitle>Flip Counting Direction</CardTitle>
            <CardDescription>
              Swap entry and exit detection. Changes may take up to 1 minute to
              apply.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="direction-flip">Direction Flipped</Label>
              <Switch
                id="direction-flip"
                checked={directionFlipped}
                onCheckedChange={handleToggleDirection}
                disabled={isLoadingDirection || isTogglingDirection}
              />
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              These actions cannot be undone. Be careful.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reset Counter Data */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Reset Counter Data</p>
                <p className="text-sm text-muted-foreground">
                  Clear all historical data and reset the count to zero
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isResetting}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Counter Data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all historical data for{" "}
                      {device.name || device.deviceId} and reset the count to
                      zero. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleResetData}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Reset Data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Remove Counter */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Remove Counter</p>
                <p className="text-sm text-muted-foreground">
                  Remove this counter from the app (does not delete server data)
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Counter?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove {device.name || device.deviceId} from
                      this app. You can add it back later with your credentials.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemoveDevice}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Remove Counter
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
