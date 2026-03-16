"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  POSConnectionInfo,
  POSTransactionData,
  SigningCredentials,
} from "@/lib/types";
import { getPOSStatus, fetchPOSTransactions } from "@/lib/posApi";
import { useLocations } from "@/contexts/LocationsContext";
import { useDevices } from "@/contexts/DevicesContext";
import { getLocationCredentials } from "@/lib/api";

// ───────────────────────── Context Type ──────────────────────────────────

interface POSContextType {
  /** Get cached POS status for a location (by server location ID). */
  getStatus: (locationId: string) => POSConnectionInfo | undefined;
  /** Refresh POS status from backend for a specific location. */
  refreshStatus: (
    locationId: string,
    credentials: Array<{ device_id: string; password: string }>,
    sign: SigningCredentials
  ) => Promise<POSConnectionInfo>;
  /** Version counter — increments when any status changes. */
  statusVersion: number;
  /** Whether initial status fetch is in progress. */
  isLoading: boolean;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

// ───────────────────────── Provider ──────────────────────────────────────

export function POSProvider({ children }: { children: React.ReactNode }) {
  const [statusVersion, setStatusVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const statusMap = useRef<Map<string, POSConnectionInfo>>(new Map());
  const { locations } = useLocations();
  const { devices } = useDevices();
  const hasInitialized = useRef(false);

  // Fetch POS status for all locations on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    if (!locations || locations.length === 0 || !devices || devices.length === 0) return;

    hasInitialized.current = true;

    const fetchAll = async () => {
      for (const loc of locations) {
        if (loc.isAuto || !loc.id) continue;

        const creds = getLocationCredentials(loc, devices);
        if (!creds) continue;

        try {
          const status = await getPOSStatus(
            loc.id,
            creds.credentials,
            creds.signingDevice
          );
          statusMap.current.set(loc.id, status);
        } catch {
          // Silently skip — POS status is optional
        }
      }
      setStatusVersion((v) => v + 1);
      setIsLoading(false);
    };

    fetchAll();
  }, [locations, devices]);

  const getStatus = useCallback(
    (locationId: string): POSConnectionInfo | undefined => {
      return statusMap.current.get(locationId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusVersion]
  );

  const refreshStatus = useCallback(
    async (
      locationId: string,
      credentials: Array<{ device_id: string; password: string }>,
      sign: SigningCredentials
    ): Promise<POSConnectionInfo> => {
      const status = await getPOSStatus(locationId, credentials, sign);
      statusMap.current.set(locationId, status);
      setStatusVersion((v) => v + 1);
      return status;
    },
    []
  );

  return (
    <POSContext.Provider
      value={{
        getStatus,
        refreshStatus,
        statusVersion,
        isLoading,
      }}
    >
      {children}
    </POSContext.Provider>
  );
}

export function usePOS() {
  const context = useContext(POSContext);
  if (context === undefined) {
    throw new Error("usePOS must be used within a POSProvider");
  }
  return context;
}
