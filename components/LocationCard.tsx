"use client";

import { useState } from "react";
import Link from "next/link";
import type { LocationState } from "@/lib/types";
import { LOCATION_COLORS } from "@/lib/types";
import { useDevices } from "@/contexts/DevicesContext";
import { DeviceCard } from "@/components/DeviceCard";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Settings,
  BarChart3,
  AlertTriangle,
  Wifi,
  WifiOff,
} from "lucide-react";

interface LocationCardProps {
  location: LocationState;
}

export function LocationCard({ location }: LocationCardProps) {
  const { devices } = useDevices();
  const [isOpen, setIsOpen] = useState(true);

  const memberDevices = devices.filter((d) =>
    location.deviceIds.includes(d.id)
  );

  const colorValue =
    LOCATION_COLORS.find((c) => c.name === location.colorName)?.value ??
    "#3b82f6";

  return (
    <div className="mb-6">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {/* Color dot */}
        <div
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: colorValue }}
        />

        {/* Name + device count */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{location.name}</h3>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {memberDevices.length} device{memberDevices.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Summed count */}
        <div className="flex items-center gap-2">
          <span
            className={`text-2xl font-bold tabular-nums ${
              location.isOverLimit ? "text-destructive" : ""
            }`}
          >
            {location.totalCount}
          </span>
          {location.overcrowdingLimit !== null && location.overcrowdingLimit > 0 && (
            <span className="text-sm text-muted-foreground">
              / {location.overcrowdingLimit}
            </span>
          )}
        </div>

        {/* Over limit warning */}
        {location.isOverLimit && (
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        )}

        {/* Online status */}
        <div className="shrink-0">
          {memberDevices.length === 0 ? (
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          ) : location.allDevicesOnline ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : location.someDevicesOnline ? (
            <Wifi className="h-4 w-4 text-yellow-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/location/${location.id}/history`}>
              <BarChart3 className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/location/${location.id}/settings`}>
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Collapse chevron */}
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Body - collapsible device grid */}
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: isOpen ? `${memberDevices.length * 500}px` : "0px" }}
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-4">
          {memberDevices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      </div>
    </div>
  );
}
