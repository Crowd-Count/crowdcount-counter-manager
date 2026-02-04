"use client";

import { useState } from "react";
import Link from "next/link";
import type { LocationState, DeviceState } from "@/lib/types";
import { LOCATION_COLORS } from "@/lib/types";
import { useDevices } from "@/contexts/DevicesContext";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Settings,
  BarChart3,
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
  const { refreshDevice } = useDevices();
  const [isModifying, setIsModifying] = useState(false);

  const handleIncrement = async () => {
    setIsModifying(true);
    try {
      await api.setCount(device.deviceId, device.password, device.currentCount + 1);
      await refreshDevice(device.id);
    } catch (error) {
      console.error("Failed to increment:", error);
    } finally {
      setIsModifying(false);
    }
  };

  const handleDecrement = async () => {
    setIsModifying(true);
    try {
      await api.setCount(device.deviceId, device.password, Math.max(0, device.currentCount - 1));
      await refreshDevice(device.id);
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
  const { devices } = useDevices();

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
                  {memberDevices.length} device{memberDevices.length !== 1 ? "s" : ""}
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
          <Button variant="outline" size="sm" className="mt-3" asChild>
            <Link href={`/location/${location.id}/history`}>
              <BarChart3 className="h-4 w-4 mr-1" />
              View History
            </Link>
          </Button>
        </div>

        {/* Compact device list */}
        {memberDevices.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              Devices
            </p>
            {memberDevices.map((device) => (
              <CompactDeviceRow key={device.id} device={device} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
