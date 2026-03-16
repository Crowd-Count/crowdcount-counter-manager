"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  LocationCredentials,
  POSStoreLocation,
  SigningCredentials,
} from "@/lib/types";
import {
  checkExistingPOSAccount,
  connectPOS,
  listPOSLocations,
  sandboxConnect,
  startPOSOAuth,
} from "@/lib/posApi";
import { usePOS } from "@/contexts/POSContext";

type Step = "provider" | "method" | "sandbox" | "locations";

interface POSConnectDialogProps {
  locationId: string;
  locationName: string;
  credentials: LocationCredentials;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPosAccountId?: string;
}

export default function POSConnectDialog({
  locationId,
  locationName,
  credentials,
  open,
  onOpenChange,
  initialPosAccountId,
}: POSConnectDialogProps) {
  const { refreshStatus } = usePOS();
  const sign = credentials.signingDevice;

  const [step, setStep] = useState<Step>("provider");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Sandbox token input
  const [sandboxToken, setSandboxToken] = useState("");

  // POS account (from OAuth or sandbox or existing)
  const [posAccountId, setPosAccountId] = useState("");

  // POS location picker
  const [posLocations, setPosLocations] = useState<POSStoreLocation[]>([]);
  const [selectedPosLocationId, setSelectedPosLocationId] = useState("");

  // Reset state when dialog closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setStep("provider");
        setError("");
        setSandboxToken("");
        setPosAccountId("");
        setPosLocations([]);
        setSelectedPosLocationId("");
        setIsLoading(false);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  // Handle OAuth callback: if initialPosAccountId is provided, skip to location picker
  useEffect(() => {
    if (open && initialPosAccountId) {
      setPosAccountId(initialPosAccountId);
      setStep("locations");
      loadPosLocations(initialPosAccountId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPosAccountId]);

  // Load POS locations for the account
  const loadPosLocations = async (accountId: string) => {
    setIsLoading(true);
    setError("");
    try {
      const locations = await listPOSLocations(accountId, sign);
      setPosLocations(locations);
      if (locations.length === 1) {
        setSelectedPosLocationId(locations[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load POS locations");
    } finally {
      setIsLoading(false);
    }
  };

  // Step: Provider selection → check for existing account
  const handleSelectSquare = async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await checkExistingPOSAccount(sign);
      if (result.has_account && result.pos_account_id) {
        // Already have an account — skip OAuth, go to location picker
        setPosAccountId(result.pos_account_id);
        setStep("locations");
        await loadPosLocations(result.pos_account_id);
      } else {
        setStep("method");
      }
    } catch {
      // If check fails, just show method selection
      setStep("method");
    } finally {
      setIsLoading(false);
    }
  };

  // Step: Start OAuth flow
  const handleOAuth = async () => {
    setIsLoading(true);
    setError("");
    try {
      const { oauth_url } = await startPOSOAuth(
        "square",
        locationId,
        credentials.credentials,
        sign
      );
      window.location.href = oauth_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start OAuth");
      setIsLoading(false);
    }
  };

  // Step: Sandbox token submission
  const handleSandboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxToken.trim()) return;

    setIsLoading(true);
    setError("");
    try {
      const result = await sandboxConnect(
        sandboxToken.trim(),
        locationId,
        credentials.credentials,
        sign
      );
      setPosAccountId(result.pos_account_id);
      setStep("locations");
      await loadPosLocations(result.pos_account_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid token");
      setIsLoading(false);
    }
  };

  // Step: Connect POS location
  const handleConnectLocation = async () => {
    if (!selectedPosLocationId || !posAccountId) return;

    const selectedLoc = posLocations.find((l) => l.id === selectedPosLocationId);
    if (!selectedLoc) return;

    setIsLoading(true);
    setError("");
    try {
      await connectPOS(
        locationId,
        posAccountId,
        selectedPosLocationId,
        selectedLoc.name,
        credentials.credentials,
        sign
      );
      // Refresh POS status in context
      await refreshStatus(locationId, credentials.credentials, sign);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Step 1: Provider Selection */}
        {step === "provider" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect Point of Sale</DialogTitle>
              <DialogDescription>
                Choose your POS system to connect to {locationName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Button
                variant="outline"
                className="w-full justify-start h-14 text-base"
                onClick={handleSelectSquare}
                disabled={isLoading}
              >
                <span className="font-semibold">Square</span>
                {isLoading && (
                  <span className="ml-auto text-sm text-muted-foreground">
                    Checking...
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-14 text-base opacity-50 cursor-not-allowed"
                disabled
              >
                <span className="font-semibold">Toast</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Coming soon
                </span>
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Connection Method */}
        {step === "method" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect Square</DialogTitle>
              <DialogDescription>
                Choose how to connect your Square account
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Button
                className="w-full h-12"
                onClick={handleOAuth}
                disabled={isLoading}
              >
                {isLoading ? "Redirecting..." : "Sign in with Square"}
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    or for testing
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setStep("sandbox")}
              >
                Use Sandbox Token
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}

        {/* Step 3: Sandbox Token */}
        {step === "sandbox" && (
          <>
            <DialogHeader>
              <DialogTitle>Sandbox Token</DialogTitle>
              <DialogDescription>
                Paste your Square sandbox access token from the{" "}
                <a
                  href="https://developer.squareup.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  developer console
                </a>
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSandboxSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sandbox-token">Access Token</Label>
                <Input
                  id="sandbox-token"
                  type="password"
                  placeholder="EAAAl..."
                  value={sandboxToken}
                  onChange={(e) => setSandboxToken(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStep("method");
                    setError("");
                  }}
                >
                  Back
                </Button>
                <Button type="submit" disabled={isLoading || !sandboxToken.trim()}>
                  {isLoading ? "Verifying..." : "Connect"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {/* Step 4: POS Location Picker */}
        {step === "locations" && (
          <>
            <DialogHeader>
              <DialogTitle>Select Square Location</DialogTitle>
              <DialogDescription>
                Choose which Square store to link to {locationName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading Square locations...
                </p>
              ) : posLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No locations found in your Square account.
                </p>
              ) : (
                <div className="space-y-2">
                  <Label>Square Store</Label>
                  <Select
                    value={selectedPosLocationId}
                    onValueChange={setSelectedPosLocationId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a location" />
                    </SelectTrigger>
                    <SelectContent>
                      {posLocations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                          {loc.address ? ` — ${loc.address}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                onClick={handleConnectLocation}
                disabled={isLoading || !selectedPosLocationId}
              >
                {isLoading ? "Connecting..." : "Connect"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
