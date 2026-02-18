"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDevices } from "@/contexts/DevicesContext";
import { useLocations } from "@/contexts/LocationsContext";
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
  const { adoptAutoLocation } = useLocations();
  const [locationName, setLocationName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect to dashboard if already has devices (but not during form submission)
  useEffect(() => {
    if (!isLoading && devices.length > 0 && !isSubmitting) {
      router.push("/dashboard");
    }
  }, [devices, isLoading, router, isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const trimmedLocationName = locationName.trim();
    const trimmedDeviceId = deviceId.trim();
    const trimmedPassword = password.trim();

    if (!trimmedLocationName || !trimmedDeviceId || !trimmedPassword) {
      setError("Please fill in all fields");
      setIsSubmitting(false);
      return;
    }

    try {
      const success = await addDevice(trimmedDeviceId, trimmedPassword);
      if (success) {
        // Adopt/create a location for this device with the user's chosen name
        await adoptAutoLocation(trimmedDeviceId, trimmedPassword, trimmedLocationName);
        router.push("/dashboard");
      } else {
        setError("Invalid Counter ID or Password");
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
          <CardTitle className="text-3xl font-bold">CrowdCount Counter Manager</CardTitle>
          <CardDescription>
            Enter your counter credentials to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="locationName">Location Name</Label>
              <Input
                id="locationName"
                type="text"
                placeholder="e.g., Main Entrance"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deviceId">Counter ID</Label>
              <Input
                id="deviceId"
                type="text"
                placeholder="e.g., T1234"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                disabled={isSubmitting}
                autoCapitalize="characters"
              />
              <p className="text-xs text-muted-foreground">Case sensitive</p>
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
              <p className="text-xs text-muted-foreground">Case sensitive</p>
            </div>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Connecting..." : "Get Started"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4 px-2">
            Note: Most features are currently only available in the iOS app. Download it on the App Store{" "}
            <a href="https://crowdcount.tech/app" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
              here
            </a>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
