"use client";

import { useState } from "react";
import Link from "next/link";
import type { DeviceState } from "@/lib/types";
import { useDevices } from "@/contexts/DevicesContext";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Minus,
  Plus,
  Settings,
  BarChart3,
  AlertTriangle,
  Wifi,
  WifiOff,
  Edit2,
} from "lucide-react";

interface DeviceCardProps {
  device: DeviceState;
  showHistory?: boolean;
}

export function DeviceCard({ device, showHistory = true }: DeviceCardProps) {
  const { refreshDevice, updateDeviceName } = useDevices();
  const [isModifying, setIsModifying] = useState(false);
  const [isSetDialogOpen, setIsSetDialogOpen] = useState(false);
  const [newCount, setNewCount] = useState("");
  const [isSettingCount, setIsSettingCount] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(device.name || device.deviceId);

  const isOverLimit =
    device.overcrowdingLimit !== null &&
    device.currentCount > device.overcrowdingLimit;

  const handleIncrement = async () => {
    setIsModifying(true);
    try {
      await api.setCount(
        device.deviceId,
        device.password,
        device.currentCount + 1
      );
      await refreshDevice(device.id);
    } catch (error) {
      console.error("Failed to increment count:", error);
    } finally {
      setIsModifying(false);
    }
  };

  const handleDecrement = async () => {
    setIsModifying(true);
    try {
      const newVal = Math.max(0, device.currentCount - 1);
      await api.setCount(device.deviceId, device.password, newVal);
      await refreshDevice(device.id);
    } catch (error) {
      console.error("Failed to decrement count:", error);
    } finally {
      setIsModifying(false);
    }
  };

  const handleSetCount = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseInt(newCount, 10);
    if (isNaN(value) || value < 0) return;

    setIsSettingCount(true);
    try {
      await api.setCount(device.deviceId, device.password, value);
      await refreshDevice(device.id);
      setIsSetDialogOpen(false);
      setNewCount("");
    } catch (error) {
      console.error("Failed to set count:", error);
    } finally {
      setIsSettingCount(false);
    }
  };

  const handleSaveName = () => {
    updateDeviceName(device.id, editName.trim() || device.deviceId);
    setIsEditingName(false);
  };

  return (
    <Card className={isOverLimit ? "border-destructive" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 w-32"
                  onBlur={handleSaveName}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  autoFocus
                />
              </div>
            ) : (
              <CardTitle
                className="text-lg cursor-pointer flex items-center gap-1 hover:text-primary"
                onClick={() => setIsEditingName(true)}
              >
                {device.name || device.deviceId}
                <Edit2 className="h-3 w-3 opacity-50" />
              </CardTitle>
            )}
            {isOverLimit && (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {device.isOnline ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </div>
        </div>
        <CardDescription>
          {device.deviceId}
          {device.lastUpdated && (
            <span className="ml-2 text-xs">
              Updated {new Date(device.lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Count display and controls */}
        <div className="flex items-center justify-center gap-4 py-4">
          <Button
            variant="outline"
            size="icon"
            onClick={handleDecrement}
            disabled={isModifying || device.currentCount === 0}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Dialog open={isSetDialogOpen} onOpenChange={setIsSetDialogOpen}>
            <DialogTrigger asChild>
              <button
                className={`text-5xl font-bold min-w-[120px] hover:text-primary transition-colors ${
                  isOverLimit ? "text-destructive" : ""
                }`}
              >
                {device.currentCount}
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set Count</DialogTitle>
                <DialogDescription>
                  Enter a new count value for {device.name || device.deviceId}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSetCount} className="space-y-4">
                <Input
                  type="number"
                  min="0"
                  placeholder="Enter new count"
                  value={newCount}
                  onChange={(e) => setNewCount(e.target.value)}
                  disabled={isSettingCount}
                  autoFocus
                />
                <DialogFooter>
                  <Button type="submit" disabled={isSettingCount || !newCount}>
                    {isSettingCount ? "Setting..." : "Set Count"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="icon"
            onClick={handleIncrement}
            disabled={isModifying}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Overcrowding indicator */}
        {device.overcrowdingLimit !== null && (
          <p
            className={`text-center text-sm ${
              isOverLimit ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            Limit: {device.overcrowdingLimit}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex justify-center gap-2 mt-4">
          {showHistory && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/device/${device.id}/history`}>
                <BarChart3 className="h-4 w-4 mr-1" />
                History
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/device/${device.id}/settings`}>
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
