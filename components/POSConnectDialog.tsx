"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
} from "@/lib/types";
import {
  checkExistingPOSAccount,
  connectPOS,
  listPOSLocations,
  startPOSOAuth,
} from "@/lib/posApi";
import { usePOS } from "@/contexts/POSContext";

type Step = "provider" | "oauth" | "locations";

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

  // POS account (from OAuth or existing)
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

  // Step: Provider selection → check for existing account, then OAuth
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
        return;
      }
    } catch {
      // If check fails, proceed to OAuth
    }
    // Start OAuth flow directly
    setStep("oauth");
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
                className="w-full justify-start h-14 text-base gap-3"
                onClick={handleSelectSquare}
                disabled={isLoading}
              >
                <Image src="/square-logo.svg" alt="Square" width={28} height={28} className="rounded" />
                <span className="font-semibold">Square</span>
                {isLoading && (
                  <span className="ml-auto text-sm text-muted-foreground">
                    Checking...
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-14 text-base gap-3 opacity-50 cursor-not-allowed"
                disabled
              >
                <Image src="/toast-logo.svg" alt="Toast" width={28} height={28} className="rounded" />
                <span className="font-semibold">Toast</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Coming soon
                </span>
              </Button>
            </div>
          </>
        )}

        {/* Step 2: OAuth redirect in progress */}
        {step === "oauth" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect Square</DialogTitle>
              <DialogDescription>
                Redirecting to Square...
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You&apos;ll be redirected to Square to sign in.
                </p>
              )}
            </div>
          </>
        )}

        {/* Step 3: POS Location Picker */}
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
