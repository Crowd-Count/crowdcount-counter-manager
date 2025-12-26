"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDevices } from "@/contexts/DevicesContext";
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

export default function LoginPage() {
  const router = useRouter();
  const { devices, addDevice, isLoading } = useDevices();
  const [deviceId, setDeviceId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect to dashboard if already has devices
  useEffect(() => {
    if (!isLoading && devices.length > 0) {
      router.push("/dashboard");
    }
  }, [devices, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const trimmedDeviceId = deviceId.trim().toUpperCase();
    const trimmedPassword = password.trim();

    if (!trimmedDeviceId || !trimmedPassword) {
      setError("Please enter both Device ID and Password");
      setIsSubmitting(false);
      return;
    }

    try {
      const success = await addDevice(trimmedDeviceId, trimmedPassword);
      if (success) {
        router.push("/dashboard");
      } else {
        setError("Invalid Device ID or Password");
      }
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">CrowdCount</CardTitle>
          <CardDescription>
            Enter your device credentials to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deviceId">Device ID</Label>
              <Input
                id="deviceId"
                type="text"
                placeholder="e.g., T1234"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                disabled={isSubmitting}
                autoCapitalize="characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Connecting..." : "Add Device"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
