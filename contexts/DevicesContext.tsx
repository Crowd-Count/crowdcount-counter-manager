"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import type { StoredDevice, DeviceState, PollInterval } from "@/lib/types";
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
  updatePollInterval: (id: string, interval: PollInterval) => void;
  refreshDevice: (id: string) => Promise<void>;
  refreshAllDevices: () => Promise<void>;
  getDevice: (id: string) => DeviceState | undefined;
  updateDevicePassword: (id: string, newPassword: string) => void;
  totalCount: number;
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
  const pollIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Load devices from storage on mount
  useEffect(() => {
    const stored = loadDevicesFromStorage();
    const initialDevices: DeviceState[] = stored.map((d) => ({
      ...d,
      currentCount: 0,
      overcrowdingLimit: null,
      isOnline: false,
      directionFlipped: false,
      lastUpdated: null,
    }));
    setDevices(initialDevices);
    setIsLoading(false);

    // Refresh all devices after loading
    if (stored.length > 0) {
      Promise.all(stored.map((d) => fetchDeviceData(d)));
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

  // Compute a stable key for polling intervals
  const pollingKey = devices.map((d) => `${d.id}-${d.pollInterval}`).join(",");

  // Set up polling for each device
  useEffect(() => {
    // Clear all existing intervals
    pollIntervals.current.forEach((interval) => clearInterval(interval));
    pollIntervals.current.clear();

    // Set up new intervals for each device
    devices.forEach((device) => {
      const interval = setInterval(() => {
        fetchDeviceData(device);
      }, device.pollInterval * 1000);
      pollIntervals.current.set(device.id, interval);
    });

    return () => {
      pollIntervals.current.forEach((interval) => clearInterval(interval));
      pollIntervals.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingKey]);

  const fetchDeviceData = async (device: StoredDevice): Promise<void> => {
    try {
      const [count, status, overcrowdingExists] = await Promise.all([
        api.getCurrentCount(device.deviceId),
        api.getConnectionStatus(device.deviceId),
        api.checkOvercrowdingExists(device.deviceId),
      ]);

      let overcrowdingLimit: number | null = null;
      if (overcrowdingExists) {
        overcrowdingLimit = await api.getOvercrowding(device.deviceId);
      }

      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id
            ? {
                ...d,
                currentCount: count,
                isOnline: status === "online",
                overcrowdingLimit,
                lastUpdated: new Date(),
              }
            : d
        )
      );
    } catch (error) {
      console.error(`Failed to fetch data for device ${device.deviceId}:`, error);
    }
  };

  const addDevice = useCallback(
    async (
      deviceId: string,
      password: string,
      name?: string
    ): Promise<boolean> => {
      // Check if device already exists
      if (devices.some((d) => d.deviceId === deviceId)) {
        return false;
      }

      // Verify credentials
      try {
        const isValid = await api.checkPassword(deviceId, password);
        if (!isValid) {
          return false;
        }
      } catch {
        return false;
      }

      const newDevice: DeviceState = {
        id: generateId(),
        deviceId,
        password,
        name: name || deviceId,
        pollInterval: 5,
        currentCount: 0,
        overcrowdingLimit: null,
        isOnline: false,
        directionFlipped: false,
        lastUpdated: null,
      };

      setDevices((prev) => [...prev, newDevice]);

      // Fetch initial data
      fetchDeviceData(newDevice);

      return true;
    },
    [devices]
  );

  const removeDevice = useCallback((id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    // Clear polling interval for this device
    const interval = pollIntervals.current.get(id);
    if (interval) {
      clearInterval(interval);
      pollIntervals.current.delete(id);
    }
  }, []);

  const updateDeviceName = useCallback((id: string, name: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, name } : d))
    );
  }, []);

  const updatePollInterval = useCallback((id: string, interval: PollInterval) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, pollInterval: interval } : d))
    );
  }, []);

  const updateDevicePassword = useCallback((id: string, newPassword: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, password: newPassword } : d))
    );
  }, []);

  const refreshDevice = useCallback(
    async (id: string) => {
      const device = devices.find((d) => d.id === id);
      if (device) {
        await fetchDeviceData(device);
      }
    },
    [devices]
  );

  const refreshAllDevices = useCallback(async () => {
    await Promise.all(devices.map((d) => fetchDeviceData(d)));
  }, [devices]);

  const getDevice = useCallback(
    (id: string) => devices.find((d) => d.id === id),
    [devices]
  );

  const totalCount = devices.reduce((sum, d) => sum + d.currentCount, 0);

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
        refreshAllDevices,
        getDevice,
        updateDevicePassword,
        totalCount,
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
