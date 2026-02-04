"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import * as api from "@/lib/api";
import { POLL_INTERVALS, type PollInterval } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ArrowLeft, Save, Trash2, RefreshCw } from "lucide-react";

export default function DeviceSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const deviceId = params.id as string;
  const {
    getDevice,
    updatePollInterval,
    removeDevice,
    refreshDevice,
    updateDevicePassword,
  } = useDevices();

  const device = getDevice(deviceId);

  // Overcrowding state
  const [overcrowdingLimit, setOvercrowdingLimit] = useState("");
  const [isSavingOvercrowding, setIsSavingOvercrowding] = useState(false);

  // Direction flip state
  const [directionFlipped, setDirectionFlipped] = useState(false);
  const [isTogglingDirection, setIsTogglingDirection] = useState(false);
  const [isLoadingDirection, setIsLoadingDirection] = useState(true);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

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
      console.error("Failed to load direction:", error);
    } finally {
      setIsLoadingDirection(false);
    }
  }, [device]);

  // Load initial data
  useEffect(() => {
    if (device) {
      setOvercrowdingLimit(
        device.overcrowdingLimit?.toString() || ""
      );
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

  const handleSaveOvercrowding = async () => {
    setIsSavingOvercrowding(true);
    try {
      const limit = parseInt(overcrowdingLimit, 10);
      if (!overcrowdingLimit || isNaN(limit) || limit <= 0) {
        // Remove overcrowding
        await api.removeOvercrowding(device.deviceId, device.password);
      } else {
        // Set overcrowding
        await api.addOvercrowding(device.deviceId, device.password, limit);
      }
      await refreshDevice(device.id);
    } catch (error) {
      console.error("Failed to save overcrowding:", error);
    } finally {
      setIsSavingOvercrowding(false);
    }
  };

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
      console.error("Failed to toggle direction:", error);
    } finally {
      setIsTogglingDirection(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (newPassword.length < 4) {
      setPasswordError("Password must be at least 4 characters");
      return;
    }

    setIsChangingPassword(true);
    try {
      await api.setPassword(device.deviceId, currentPassword, newPassword);
      updateDevicePassword(device.id, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
    } catch (error) {
      setPasswordError("Failed to change password. Check current password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      await api.resetDeviceData(device.deviceId, device.password);
      await refreshDevice(device.id);
    } catch (error) {
      console.error("Failed to reset data:", error);
    } finally {
      setIsResetting(false);
    }
  };

  const handleRemoveDevice = () => {
    removeDevice(device.id);
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
        {/* Update Frequency */}
        <Card>
          <CardHeader>
            <CardTitle>Update Frequency</CardTitle>
            <CardDescription>
              How often to refresh the count from the server
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={device.pollInterval.toString()}
              onValueChange={(value) =>
                updatePollInterval(device.id, parseInt(value) as PollInterval)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLL_INTERVALS.map((interval) => (
                  <SelectItem key={interval} value={interval.toString()}>
                    {interval} second{interval !== 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Overcrowding Limit */}
        <Card>
          <CardHeader>
            <CardTitle>Overcrowding Limit</CardTitle>
            <CardDescription>
              Set a maximum count threshold. Leave empty to disable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                placeholder="No limit"
                value={overcrowdingLimit}
                onChange={(e) => setOvercrowdingLimit(e.target.value)}
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

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your counter password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={isChangingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isChangingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isChangingPassword}
                />
              </div>
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-green-600">
                  Password changed successfully
                </p>
              )}
              <Button type="submit" disabled={isChangingPassword}>
                {isChangingPassword ? "Changing..." : "Change Password"}
              </Button>
            </form>
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
