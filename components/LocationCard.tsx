"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { LocationState, DeviceState } from "@/lib/types";
import { LOCATION_COLORS } from "@/lib/types";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
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
} from "lucide-react";

interface LocationCardProps {
  location: LocationState;
}

function CompactDeviceRow({ device }: { device: DeviceState }) {
  const { updateDeviceCount } = useDevices();
  const [isModifying, setIsModifying] = useState(false);

  const handleIncrement = async () => {
    setIsModifying(true);
    try {
      const newCount = await api.addToCount(device.deviceId, device.password, 1);
      updateDeviceCount(device.id, newCount);
    } catch (error) {
      console.error("Failed to increment:", error);
    } finally {
      setIsModifying(false);
    }
  };

  const handleDecrement = async () => {
    setIsModifying(true);
    try {
      const newCount = await api.subFromCount(device.deviceId, device.password, 1);
      updateDeviceCount(device.id, newCount);
    } catch (error) {
      console.error("Failed to decrement:", error);
    } finally {
      setIsModifying(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50">
      {/* Status dot */}
      <div
        className={`h-2 w-2 rounded-full shrink-0 ${
          device.isOnline ? "bg-green-500" : "bg-red-500"
        }`}
      />

      {/* Name */}
      <span className="text-sm font-medium truncate flex-1 min-w-0">
        {device.name || device.deviceId}
      </span>

      {/* +/- count controls */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleDecrement}
          disabled={isModifying || device.currentCount === 0}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="text-sm font-semibold tabular-nums w-8 text-center">
          {device.currentCount}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleIncrement}
          disabled={isModifying}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

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
  const { devices, addDevice } = useDevices();
  const { locations, addLocation, addDeviceToLocation, removeLocation } = useLocations();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Track a pending device ID that needs to be added to a location once it appears in state
  const pendingDeviceRef = useRef<string | null>(null);
  const pendingTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingDeviceRef.current) return;
    const added = devices.find((d) => d.deviceId === pendingDeviceRef.current);
    if (added) {
      const targetId = pendingTargetRef.current || location.id;
      addDeviceToLocation(targetId, added.id);
      pendingDeviceRef.current = null;
      pendingTargetRef.current = null;
    }
  }, [devices, location.id, addDeviceToLocation]);

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
      // Check if device belongs to a different location on the public map
      const mapLocationName = await api.getMapLocationForDevice(trimmedId);
      const belongsElsewhere = mapLocationName !== null && mapLocationName !== location.name;

      // Determine target location
      let targetLocationId = location.id;
      if (belongsElsewhere) {
        const existingLoc = locations.find((l) => l.name === mapLocationName);
        if (existingLoc) {
          targetLocationId = existingLoc.id;
        } else {
          targetLocationId = addLocation(mapLocationName, "blue");
        }
      }

      // Check if device already exists in the app
      const existing = devices.find((d) => d.deviceId === trimmedId);
      if (existing) {
        addDeviceToLocation(targetLocationId, existing.id);
      } else {
        // Set pending so the useEffect adds it to the target location once state updates
        pendingDeviceRef.current = trimmedId;
        pendingTargetRef.current = targetLocationId !== location.id ? targetLocationId : null;
        const success = await addDevice(trimmedId, trimmedPw);
        if (!success) {
          pendingDeviceRef.current = null;
          pendingTargetRef.current = null;
          setAddError("Invalid credentials or counter already added");
          setIsAdding(false);
          return;
        }
      }

      if (belongsElsewhere) {
        setNewDeviceId("");
        setNewPassword("");
        // If current location is now empty, clean it up
        if (location.deviceIds.length === 0) {
          await removeLocation(location.id);
        } else {
          setAddError(
            `This counter belongs to "${mapLocationName}" on the public map and was added there instead.`
          );
        }
        setIsAdding(false);
        return;
      }

      // Normal flow — device added to current location
      setIsAddOpen(false);
      setNewDeviceId("");
      setNewPassword("");
    } catch {
      pendingDeviceRef.current = null;
      pendingTargetRef.current = null;
      setAddError("Failed to add counter");
    } finally {
      setIsAdding(false);
    }
  };

  const memberDevices = devices.filter((d) =>
    location.deviceIds.includes(d.id)
  );

  const colorValue =
    LOCATION_COLORS.find((c) => c.name === location.colorName)?.value ??
    "#3b82f6";

  return (
    <Card className={`mb-6 ${location.isOverLimit ? "border-destructive" : ""}`}>
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
        {/* Main count display */}
        <div className="text-center py-2">
          <p
            className={`text-6xl font-bold tabular-nums ${
              location.isOverLimit ? "text-destructive" : ""
            }`}
          >
            {location.totalCount}
          </p>
          {location.overcrowdingLimit !== null && location.overcrowdingLimit > 0 && (
            <p
              className={`text-sm mt-1 ${
                location.isOverLimit ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              Limit: {location.overcrowdingLimit}
            </p>
          )}
          <div className="flex gap-2 mt-3 justify-center">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/location/${location.id}/history`}>
                <BarChart3 className="h-4 w-4 mr-1" />
                View History
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
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
            <CompactDeviceRow key={device.id} device={device} />
          ))}

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
              <button className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors w-full text-sm text-muted-foreground">
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
                  />
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
      </CardContent>
    </Card>
  );
}
