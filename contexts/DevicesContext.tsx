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
  updatePollInterval: (id: string, interval: number) => void;
  refreshDevice: (id: string) => Promise<void>;
  getDevice: (id: string) => DeviceState | undefined;
  updateDevicePassword: (id: string, newPassword: string) => void;
  updateDeviceOnlineStatus: (id: string, isOnline: boolean) => void;
}

const DevicesContext = createContext<DevicesContextType | undefined>(undefined);

const STORAGE_KEY = "crowdcount_devices";

function generateId(): string {
  return crypto.randomUUID();
}

function loadDevicesFromStorage(): StoredDevice[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveDevicesToStorage(devices: StoredDevice[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

export function DevicesProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load devices from storage on mount
  useEffect(() => {
    const stored = loadDevicesFromStorage();
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
  }, []);

  // Save devices to storage when they change
  useEffect(() => {
    if (!isLoading && devices.length > 0) {
      const stored: StoredDevice[] = devices.map((d) => ({
        id: d.id,
        deviceId: d.deviceId,
        password: d.password,
        name: d.name,
        pollInterval: d.pollInterval,
      }));
      saveDevicesToStorage(stored);
    } else if (!isLoading && devices.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    }
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
        return false;
      }

      const newDevice: DeviceState = {
        id: generateId(),
        deviceId,
        password,
        name: name || deviceId,
        pollInterval: 5,
        isOnline: false,
        lastUpdated: null,
      };

      setDevices((prev) => [...prev, newDevice]);
      return true;
    },
    []
  );

  const removeDevice = useCallback((id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const updateDeviceName = useCallback((id: string, name: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, name } : d))
    );
  }, []);

  const updatePollInterval = useCallback((id: string, interval: number) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, pollInterval: interval } : d))
    );
  }, []);

  const updateDevicePassword = useCallback((id: string, newPassword: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, password: newPassword } : d))
    );
  }, []);

  const updateDeviceOnlineStatus = useCallback((id: string, isOnline: boolean) => {
    setDevices((prev) => {
      const device = prev.find((d) => d.id === id);
      if (!device || device.isOnline === isOnline) return prev; // no change → skip re-render
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
        updatePollInterval,
        refreshDevice,
        getDevice,
        updateDevicePassword,
        updateDeviceOnlineStatus,
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
