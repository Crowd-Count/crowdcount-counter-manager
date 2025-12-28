"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDevices } from "@/contexts/DevicesContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Plus,
  RefreshCw,
  Settings,
  BarChart3,
  AlertTriangle,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { devices, isLoading, addDevice, refreshAllDevices, totalCount } =
    useDevices();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      setAddError("Please enter both Device ID and Password");
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
        setAddError("Invalid credentials or device already added");
      }
    } catch {
      setAddError("Failed to add device");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAllDevices();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Calculate total overcrowding limit
  const totalOvercrowding = devices.reduce(
    (sum, d) => sum + (d.overcrowdingLimit || 0),
    0
  );
  const hasOvercrowding = devices.some((d) => d.overcrowdingLimit !== null);
  const isOverLimit =
    hasOvercrowding && totalOvercrowding > 0 && totalCount > totalOvercrowding;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">CrowdCount Counter Manager</h1>
            <div className="flex items-center gap-2">
              <ThemeToggle />
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
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Device</DialogTitle>
                    <DialogDescription>
                      Enter the credentials for your CrowdCount device
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddDevice} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="newDeviceId">Device ID</Label>
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
                        {isAdding ? "Adding..." : "Add Device"}
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
        {/* iOS app disclaimer */}
        <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
          <p className="text-xs text-muted-foreground text-center">
            Note: Most features are currently only available in the iOS app. Download it on the App Store{" "}
            <a href="https://crowdcount.tech/app" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
              here
            </a>.
          </p>
        </div>

        {/* Total count card (show when multiple devices) */}
        {devices.length > 1 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Total Count
                {isOverLimit && (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
              </CardTitle>
              <CardDescription>
                Combined count across all {devices.length} devices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p
                  className={`text-6xl font-bold ${
                    isOverLimit ? "text-destructive" : ""
                  }`}
                >
                  {totalCount}
                </p>
                {hasOvercrowding && totalOvercrowding > 0 && (
                  <p className="text-muted-foreground mt-2">
                    Limit: {totalOvercrowding}
                  </p>
                )}
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/history">
                    <BarChart3 className="h-4 w-4 mr-1" />
                    View Total History
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Device cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      </main>
    </div>
  );
}
