"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import type { StoredDevice, DeviceState } from "@/lib/types";
import * as api from "@/lib/api";
import { encrypt, decrypt, isEncrypted } from "@/lib/secureStorage";
import { clearSigningKey } from "@/lib/crypto";
import { logWarn } from "@/lib/logger";
import { logSecurityEvent } from "@/lib/securityAudit";

interface DevicesContextType {
  devices: DeviceState[];
  isLoading: boolean;
  addDevice: (
    deviceId: string,
    password: string,
    name?: string
  ) => Promise<boolean>;
  removeDevice: (id: string) => void;
  updateDeviceName: (id: string, name: string) => void;
  refreshDevice: (id: string) => Promise<void>;
  getDevice: (id: string) => DeviceState | undefined;
  updateDevicePassword: (id: string, newPassword: string) => void;
  updateDeviceOnlineStatus: (id: string, isOnline: boolean) => void;
  storageError: boolean;
}

const DevicesContext = createContext<DevicesContextType | undefined>(undefined);

const STORAGE_KEY = "crowdcount_devices";

function generateId(): string {
  return crypto.randomUUID();
}

async function loadDevicesFromStorage(): Promise<StoredDevice[]> {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    let json: string;
    if (isEncrypted(stored)) {
      json = await decrypt(stored);
    } else {
      // Migration: plain JSON from before encryption was added
      json = stored;
    }
    return JSON.parse(json);
  } catch {
    return [];
  }
}

async function saveDevicesToStorage(devices: StoredDevice[]): Promise<boolean> {
  if (typeof window === "undefined") return true;
  try {
    const encrypted = await encrypt(JSON.stringify(devices));
    localStorage.setItem(STORAGE_KEY, encrypted);
    return true;
  } catch {
    logWarn("Failed to encrypt device data — keeping in memory only");
    return false;
  }
}

export function DevicesProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [storageError, setStorageError] = useState(false);

  // Load devices from storage on mount
  useEffect(() => {
    loadDevicesFromStorage().then((stored) => {
      const initialDevices: DeviceState[] = stored.map((d) => ({
        ...d,
        isOnline: false,
        lastUpdated: null,
      }));
      setDevices(initialDevices);
      setIsLoading(false);

      // Bootstrap signing keys on the server for all existing devices
      if (stored.length > 0) {
        stored.forEach((d) => {
          api.checkPassword(d.deviceId, d.password).catch(() => {});
        });
      }
    });
  }, []);

  // Save devices to storage when they change
  useEffect(() => {
    if (!isLoading && devices.length > 0) {
      const stored: StoredDevice[] = devices.map((d) => ({
        id: d.id,
        deviceId: d.deviceId,
        password: d.password,
        name: d.name,
      }));
      saveDevicesToStorage(stored).then((ok) => {
        if (!ok) setStorageError(true);
      });
    } else if (!isLoading && devices.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    }
    // saveDevicesToStorage is async but we don't need to await here —
    // it's a fire-and-forget background save
  }, [devices, isLoading]);

  const devicesRef = useRef<DeviceState[]>([]);
  devicesRef.current = devices;

  const addDevice = useCallback(
    async (
      deviceId: string,
      password: string,
      name?: string
    ): Promise<boolean> => {
      if (devicesRef.current.some((d) => d.deviceId === deviceId)) {
        return false;
      }

      const isValid = await api.checkPassword(deviceId, password);
      if (!isValid) {
        logSecurityEvent("AUTH_FAILURE", { deviceId });
        return false;
      }

      logSecurityEvent("AUTH_SUCCESS", { deviceId });

      const newDevice: DeviceState = {
        id: generateId(),
        deviceId,
        password,
        name: name || deviceId,
        isOnline: false,
        lastUpdated: null,
      };

      setDevices((prev) => [...prev, newDevice]);
      logSecurityEvent("DEVICE_ADDED", { deviceId });
      return true;
    },
    []
  );

  const removeDevice = useCallback((id: string) => {
    const device = devicesRef.current.find((d) => d.id === id);
    if (device) {
      clearSigningKey(device.deviceId);
      logSecurityEvent("DEVICE_REMOVED", { deviceId: device.deviceId });
      logSecurityEvent("SIGNING_KEY_CLEARED", { deviceId: device.deviceId });
    }
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const updateDeviceName = useCallback((id: string, name: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, name } : d))
    );
  }, []);

  const updateDevicePassword = useCallback((id: string, newPassword: string) => {
    const device = devicesRef.current.find((d) => d.id === id);
    if (device) clearSigningKey(device.deviceId);
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, password: newPassword } : d))
    );
  }, []);

  const updateDeviceOnlineStatus = useCallback((id: string, isOnline: boolean) => {
    setDevices((prev) => {
      const device = prev.find((d) => d.id === id);
      if (!device) return prev;
      // Skip re-render only if value unchanged AND we've already polled at least once
      if (device.isOnline === isOnline && device.lastUpdated !== null) return prev;
      return prev.map((d) =>
        d.id === id ? { ...d, isOnline, lastUpdated: new Date() } : d
      );
    });
  }, []);

  // Simplified refreshDevice — just fetches connection status for device settings page
  const refreshDevice = useCallback(
    async (id: string) => {
      const device = devicesRef.current.find((d) => d.id === id);
      if (!device) return;
      try {
        const status = await api.getConnectionStatus(device.deviceId, device.password);
        setDevices((prev) =>
          prev.map((d) =>
            d.id === id
              ? { ...d, isOnline: status === "online", lastUpdated: new Date() }
              : d
          )
        );
      } catch {
        // silently fail
      }
    },
    []
  );

  const getDevice = useCallback(
    (id: string) => devices.find((d) => d.id === id),
    [devices]
  );

  return (
    <DevicesContext.Provider
      value={{
        devices,
        isLoading,
        addDevice,
        removeDevice,
        updateDeviceName,
        refreshDevice,
        getDevice,
        updateDevicePassword,
        updateDeviceOnlineStatus,
        storageError,
      }}
    >
      {children}
    </DevicesContext.Provider>
  );
}

export function useDevices() {
  const context = useContext(DevicesContext);
  if (context === undefined) {
    throw new Error("useDevices must be used within a DevicesProvider");
  }
  return context;
}
