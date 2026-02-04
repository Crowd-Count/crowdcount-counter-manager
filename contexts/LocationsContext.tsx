"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { StoredLocation, LocationState, LocationColorName } from "@/lib/types";
import { LOCATION_COLORS } from "@/lib/types";
import { useDevices } from "@/contexts/DevicesContext";
import * as api from "@/lib/api";

interface LocationsContextType {
  locations: LocationState[];
  isLoading: boolean;
  addLocation: (name: string, colorName: LocationColorName, deviceIds?: string[]) => string;
  removeLocation: (id: string) => Promise<void>;
  updateLocationName: (id: string, name: string) => void;
  updateLocationColor: (id: string, colorName: LocationColorName) => void;
  addDeviceToLocation: (locationId: string, deviceId: string) => void;
  removeDeviceFromLocation: (locationId: string, deviceId: string) => void;
  setLocationOvercrowdingLimit: (id: string, limit: number | null) => Promise<void>;
  getLocation: (id: string) => LocationState | undefined;
  getLocationForDevice: (deviceId: string) => LocationState | undefined;
  getUngroupedDeviceIds: () => string[];
}

const LocationsContext = createContext<LocationsContextType | undefined>(undefined);

const STORAGE_KEY = "crowdcount_locations";

function loadLocationsFromStorage(): StoredLocation[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveLocationsToStorage(locations: StoredLocation[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
}

export function LocationsProvider({ children }: { children: React.ReactNode }) {
  const { devices } = useDevices();
  const [storedLocations, setStoredLocations] = useState<StoredLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load locations from storage on mount
  useEffect(() => {
    const stored = loadLocationsFromStorage();
    setStoredLocations(stored);
    setIsLoading(false);
  }, []);

  // Save locations to storage when they change
  useEffect(() => {
    if (!isLoading) {
      if (storedLocations.length > 0) {
        saveLocationsToStorage(storedLocations);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [storedLocations, isLoading]);

  // Auto-prune: remove stale device IDs when a device is removed
  useEffect(() => {
    if (isLoading) return;
    const currentDeviceIds = new Set(devices.map((d) => d.id));
    setStoredLocations((prev) => {
      let changed = false;
      const updated = prev.map((loc) => {
        const filtered = loc.deviceIds.filter((id) => currentDeviceIds.has(id));
        if (filtered.length !== loc.deviceIds.length) {
          changed = true;
          return { ...loc, deviceIds: filtered };
        }
        return loc;
      });
      return changed ? updated : prev;
    });
  }, [devices, isLoading]);

  // Compute LocationState[] from StoredLocation[] + live device data
  const locations: LocationState[] = useMemo(() => {
    return storedLocations.map((loc) => {
      const memberDevices = devices.filter((d) => loc.deviceIds.includes(d.id));
      const totalCount = memberDevices.reduce((sum, d) => sum + d.currentCount, 0);
      const isOverLimit =
        loc.overcrowdingLimit !== null &&
        loc.overcrowdingLimit > 0 &&
        totalCount > loc.overcrowdingLimit;
      const allDevicesOnline =
        memberDevices.length > 0 && memberDevices.every((d) => d.isOnline);
      const someDevicesOnline = memberDevices.some((d) => d.isOnline);

      return {
        ...loc,
        totalCount,
        isOverLimit,
        allDevicesOnline,
        someDevicesOnline,
      };
    });
  }, [storedLocations, devices]);

  const addLocation = useCallback(
    (name: string, colorName: LocationColorName, deviceIds: string[] = []): string => {
      const id = crypto.randomUUID();
      const newLocation: StoredLocation = {
        id,
        name,
        deviceIds,
        overcrowdingLimit: null,
        colorName,
        overcrowdingGroupId: null,
      };
      setStoredLocations((prev) => [...prev, newLocation]);
      return id;
    },
    []
  );

  const removeLocation = useCallback(
    async (id: string) => {
      const loc = storedLocations.find((l) => l.id === id);
      if (loc?.overcrowdingGroupId) {
        try {
          await api.deleteOvercrowdingGroup(loc.overcrowdingGroupId);
        } catch (error) {
          console.error("Failed to delete overcrowding group:", error);
        }
      }
      setStoredLocations((prev) => prev.filter((l) => l.id !== id));
    },
    [storedLocations]
  );

  const updateLocationName = useCallback((id: string, name: string) => {
    setStoredLocations((prev) =>
      prev.map((l) => (l.id === id ? { ...l, name } : l))
    );
  }, []);

  const updateLocationColor = useCallback((id: string, colorName: LocationColorName) => {
    setStoredLocations((prev) =>
      prev.map((l) => (l.id === id ? { ...l, colorName } : l))
    );
  }, []);

  const addDeviceToLocation = useCallback((locationId: string, deviceId: string) => {
    setStoredLocations((prev) =>
      prev.map((l) => {
        if (l.id === locationId && !l.deviceIds.includes(deviceId)) {
          return { ...l, deviceIds: [...l.deviceIds, deviceId] };
        }
        return l;
      })
    );
  }, []);

  const removeDeviceFromLocation = useCallback((locationId: string, deviceId: string) => {
    setStoredLocations((prev) =>
      prev.map((l) => {
        if (l.id === locationId) {
          return { ...l, deviceIds: l.deviceIds.filter((id) => id !== deviceId) };
        }
        return l;
      })
    );
  }, []);

  const setLocationOvercrowdingLimit = useCallback(
    async (id: string, limit: number | null) => {
      const loc = storedLocations.find((l) => l.id === id);
      if (!loc) return;

      // Resolve server device IDs for the location's member devices
      const serverDeviceIds = devices
        .filter((d) => loc.deviceIds.includes(d.id))
        .map((d) => d.deviceId);

      try {
        if (limit === null || limit <= 0) {
          // Remove overcrowding group
          if (loc.overcrowdingGroupId) {
            await api.deleteOvercrowdingGroup(loc.overcrowdingGroupId);
          }
          setStoredLocations((prev) =>
            prev.map((l) =>
              l.id === id
                ? { ...l, overcrowdingLimit: null, overcrowdingGroupId: null }
                : l
            )
          );
        } else if (loc.overcrowdingGroupId) {
          // Update existing group
          await api.updateOvercrowdingGroup(
            loc.overcrowdingGroupId,
            serverDeviceIds,
            limit
          );
          setStoredLocations((prev) =>
            prev.map((l) =>
              l.id === id ? { ...l, overcrowdingLimit: limit } : l
            )
          );
        } else {
          // Create new group
          const groupId = await api.createOvercrowdingGroup(
            serverDeviceIds,
            limit,
            loc.name
          );
          setStoredLocations((prev) =>
            prev.map((l) =>
              l.id === id
                ? { ...l, overcrowdingLimit: limit, overcrowdingGroupId: groupId }
                : l
            )
          );
        }
      } catch (error) {
        console.error("Failed to set location overcrowding limit:", error);
        throw error;
      }
    },
    [storedLocations, devices]
  );

  const getLocation = useCallback(
    (id: string) => locations.find((l) => l.id === id),
    [locations]
  );

  const getLocationForDevice = useCallback(
    (deviceId: string) => locations.find((l) => l.deviceIds.includes(deviceId)),
    [locations]
  );

  const getUngroupedDeviceIds = useCallback(() => {
    const groupedIds = new Set(storedLocations.flatMap((l) => l.deviceIds));
    return devices.filter((d) => !groupedIds.has(d.id)).map((d) => d.id);
  }, [storedLocations, devices]);

  return (
    <LocationsContext.Provider
      value={{
        locations,
        isLoading,
        addLocation,
        removeLocation,
        updateLocationName,
        updateLocationColor,
        addDeviceToLocation,
        removeDeviceFromLocation,
        setLocationOvercrowdingLimit,
        getLocation,
        getLocationForDevice,
        getUngroupedDeviceIds,
      }}
    >
      {children}
    </LocationsContext.Provider>
  );
}

export function useLocations() {
  const context = useContext(LocationsContext);
  if (context === undefined) {
    throw new Error("useLocations must be used within a LocationsProvider");
  }
  return context;
}
