"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Plus, X } from "lucide-react";

interface CounterEntry {
  id: string;
  deviceId: string;
  password: string;
}

function createCounterEntry(): CounterEntry {
  return { id: crypto.randomUUID(), deviceId: "", password: "" };
}

export default function LoginPage() {
  const router = useRouter();
  const { devices, addDevice, isLoading } = useDevices();
  const { adoptAutoLocation, addCounterToLocation } = useLocations();
  const [locationName, setLocationName] = useState("");
  const [counters, setCounters] = useState<CounterEntry[]>(() => [createCounterEntry()]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Redirect to dashboard if already has devices (but not during form submission)
  useEffect(() => {
    if (!isLoading && devices.length > 0 && !isSubmitting) {
      router.push("/dashboard");
    }
  }, [devices, isLoading, router, isSubmitting]);

  const updateCounter = useCallback((id: string, field: "deviceId" | "password", value: string) => {
    setCounters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  }, []);

  const addCounter = useCallback(() => {
    setCounters((prev) => [...prev, createCounterEntry()]);
  }, []);

  const removeCounter = useCallback((id: string) => {
    setCounters((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const trimmedLocationName = locationName.trim();
    if (!trimmedLocationName) {
      setError("Please enter a location name");
      setIsSubmitting(false);
      return;
    }

    const trimmedCounters = counters.map((c) => ({
      ...c,
      deviceId: c.deviceId.trim(),
      password: c.password.trim(),
    }));

    const emptyCounter = trimmedCounters.find((c) => !c.deviceId || !c.password);
    if (emptyCounter) {
      setError("Please fill in all counter fields");
      setIsSubmitting(false);
      return;
    }

    try {
      // Step 1: Add first device and create the location
      const first = trimmedCounters[0];
      const success = await addDevice(first.deviceId, first.password);
      if (!success) {
        setError(`Invalid credentials for Counter ${first.deviceId}`);
        setIsSubmitting(false);
        return;
      }

      const locationId = await adoptAutoLocation(first.deviceId, first.password, trimmedLocationName);
      if (!locationId) {
        setError("Failed to create location. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // Step 2: Add remaining counters to the location
      const additionalCounters = trimmedCounters.slice(1);
      for (const counter of additionalCounters) {
        const result = await addCounterToLocation(locationId, counter.deviceId, counter.password);
        if (!result.success) {
          // First counter succeeded, so navigate to dashboard but show which counter failed
          setError(`Counter ${counter.deviceId}: ${result.error || "Failed to add"}`);
          break;
        }
      }

      router.push("/dashboard");
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

  const showCounterLabels = counters.length > 1;

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
                maxLength={100}
              />
            </div>

            <div className="space-y-3">
              {counters.map((counter, index) => (
                <div
                  key={counter.id}
                  className={`space-y-2 ${showCounterLabels ? "rounded-lg border p-3" : ""}`}
                >
                  {showCounterLabels && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Counter {index + 1}</span>
                      {index > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeCounter(counter.id)}
                          disabled={isSubmitting}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor={`deviceId-${counter.id}`}>Counter ID</Label>
                    <Input
                      id={`deviceId-${counter.id}`}
                      type="text"
                      placeholder="e.g., T1234"
                      value={counter.deviceId}
                      onChange={(e) => updateCounter(counter.id, "deviceId", e.target.value)}
                      disabled={isSubmitting}
                      autoCapitalize="characters"
                      maxLength={20}
                    />
                    <p className="text-xs text-muted-foreground">Case sensitive</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`password-${counter.id}`}>Password</Label>
                    <Input
                      id={`password-${counter.id}`}
                      type="password"
                      placeholder="Enter password"
                      value={counter.password}
                      onChange={(e) => updateCounter(counter.id, "password", e.target.value)}
                      disabled={isSubmitting}
                      maxLength={128}
                    />
                    <p className="text-xs text-muted-foreground">Case sensitive</p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={addCounter}
              disabled={isSubmitting}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Counter
            </Button>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                disabled={isSubmitting}
                className="mt-1 accent-blue-500"
              />
              <span className="text-xs text-muted-foreground">
                I agree to the{" "}
                <a
                  href="https://crowdcount.tech/legal/terms-of-use.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Terms of Use
                </a>{" "}
                and{" "}
                <a
                  href="https://crowdcount.tech/legal/privacy-policy.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Privacy Policy
                </a>
              </span>
            </label>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !agreedToTerms}
            >
              {isSubmitting ? "Connecting..." : "Get Started"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4 px-2">
            Note: Some features are currently only available in the iOS app. Download it on the App Store{" "}
            <a href="https://crowdcount.tech/app" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
              here
            </a>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
