"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { StoredLocation, LocationState, LocationColorName } from "@/lib/types";
import { LOCATION_COLORS } from "@/lib/types";
import { useDevices } from "@/contexts/DevicesContext";
import * as api from "@/lib/api";

interface LocationsContextType {
  locations: LocationState[];
  isLoading: boolean;
  addLocation: (name: string, colorName: LocationColorName, serverDeviceIds?: string[]) => Promise<string | null>;
  removeLocation: (id: string) => Promise<void>;
  updateLocationName: (id: string, name: string) => void;
  updateLocationColor: (id: string, colorName: LocationColorName) => void;
  addDeviceToLocation: (locationId: string, serverDeviceId: string) => void;
  removeDeviceFromLocation: (locationId: string, serverDeviceId: string) => void;
  setLocationOvercrowdingLimit: (id: string, limit: number | null) => Promise<void>;
  getLocation: (id: string) => LocationState | undefined;
  getLocationForDevice: (serverDeviceId: string) => LocationState | undefined;
  getUngroupedDeviceIds: () => string[];
}

const LocationsContext = createContext<LocationsContextType | undefined>(undefined);

const STORAGE_KEY = "crowdcount_locations";

function loadLocationsFromStorage(): StoredLocation[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as StoredLocation[];
    // Migration check: if any location lacks isAuto field, it's old format — discard
    if (parsed.length > 0 && parsed[0].isAuto === undefined) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return parsed;
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

  // Watch for new devices and auto-fetch their server locations
  const prevDeviceIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isLoading) return;
    const currentDeviceIds = new Set(devices.map((d) => d.deviceId));
    const prevIds = prevDeviceIdsRef.current;

    // Find newly added devices
    const newDevices = devices.filter((d) => !prevIds.has(d.deviceId));
    prevDeviceIdsRef.current = currentDeviceIds;

    if (newDevices.length === 0) return;

    // Fetch server locations for each new device
    for (const device of newDevices) {
      api.getLocationsForDevice(device.deviceId, device.password)
        .then((serverLocations) => {
          setStoredLocations((prev) => {
            let updated = [...prev];
            for (const serverLoc of serverLocations) {
              // Skip auto locations — show those as ungrouped DeviceCards
              if (serverLoc.is_auto) continue;

              const existingIdx = updated.findIndex((l) => l.id === serverLoc.id);
              const serverDeviceIds = serverLoc.devices.map((d) => d.device_id);

              if (existingIdx >= 0) {
                // Update existing location with server data
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  name: serverLoc.name,
                  deviceIds: serverDeviceIds,
                  overcrowdingLimit: serverLoc.overcrowding_limit,
                  isOnMap: serverLoc.on_map,
                  isAuto: serverLoc.is_auto ?? false,
                };
              } else {
                // Add new location from server
                updated.push({
                  id: serverLoc.id,
                  name: serverLoc.name,
                  deviceIds: serverDeviceIds,
                  overcrowdingLimit: serverLoc.overcrowding_limit,
                  colorName: "blue",
                  isAuto: serverLoc.is_auto ?? false,
                  isOnMap: serverLoc.on_map,
                });
              }
            }
            return updated;
          });
        })
        .catch(() => {
          // Silently fail — device may not have any server locations
        });
    }
  }, [devices, isLoading]);

  // Auto-prune: remove device IDs from locations when a device is removed from the app
  useEffect(() => {
    if (isLoading) return;
    const currentServerDeviceIds = new Set(devices.map((d) => d.deviceId));
    setStoredLocations((prev) => {
      let changed = false;
      const updated = prev.map((loc) => {
        const filtered = loc.deviceIds.filter((id) => currentServerDeviceIds.has(id));
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
    // Filter out auto locations from the UI list
    return storedLocations
      .filter((loc) => !loc.isAuto)
      .map((loc) => {
        const memberDevices = devices.filter((d) => loc.deviceIds.includes(d.deviceId));
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
    async (name: string, colorName: LocationColorName, serverDeviceIds: string[] = []): Promise<string | null> => {
      // Build credentials from the devices matching these server device IDs
      const creds: Array<{ device_id: string; password: string }> = [];
      for (const sid of serverDeviceIds) {
        const device = devices.find((d) => d.deviceId === sid);
        if (device) {
          creds.push({ device_id: device.deviceId, password: device.password });
        }
      }

      if (creds.length === 0) {
        // Need at least one device credential to create a server location
        // If no devices selected, we can't create on server
        return null;
      }

      const signingDevice = { deviceId: creds[0].device_id, password: creds[0].password };

      try {
        const locationId = await api.createLocation(creds, signingDevice, name);
        const newLocation: StoredLocation = {
          id: locationId,
          name,
          deviceIds: serverDeviceIds,
          overcrowdingLimit: null,
          colorName,
          isAuto: false,
          isOnMap: false,
        };
        setStoredLocations((prev) => [...prev, newLocation]);
        return locationId;
      } catch (error) {
        console.error("Failed to create location on server:", error);
        return null;
      }
    },
    [devices]
  );

  const removeLocation = useCallback(
    async (id: string) => {
      const loc = storedLocations.find((l) => l.id === id);
      if (loc) {
        const locCreds = api.getLocationCredentials(loc, devices);
        if (locCreds) {
          try {
            await api.deleteLocation(id, locCreds.credentials, locCreds.signingDevice);
          } catch {
            // Still remove locally even if server fails
          }
        }
      }
      setStoredLocations((prev) => prev.filter((l) => l.id !== id));
    },
    [storedLocations, devices]
  );

  const updateLocationName = useCallback((id: string, name: string) => {
    // Optimistic local update
    setStoredLocations((prev) =>
      prev.map((l) => (l.id === id ? { ...l, name } : l))
    );
    // Sync to server in background
    const loc = storedLocations.find((l) => l.id === id);
    if (loc) {
      const locCreds = api.getLocationCredentials(loc, devices);
      if (locCreds) {
        api.updateLocation(id, locCreds.credentials, locCreds.signingDevice, { name })
          .catch((err) => console.error("Failed to update location name on server:", err));
      }
    }
  }, [storedLocations, devices]);

  const updateLocationColor = useCallback((id: string, colorName: LocationColorName) => {
    // Color is client-only, no server sync needed
    setStoredLocations((prev) =>
      prev.map((l) => (l.id === id ? { ...l, colorName } : l))
    );
  }, []);

  const addDeviceToLocation = useCallback((locationId: string, serverDeviceId: string) => {
    // Optimistic local update
    setStoredLocations((prev) =>
      prev.map((l) => {
        if (l.id === locationId && !l.deviceIds.includes(serverDeviceId)) {
          return { ...l, deviceIds: [...l.deviceIds, serverDeviceId] };
        }
        return l;
      })
    );

    // Call replaceLocation with new full device set
    setStoredLocations((current) => {
      const loc = current.find((l) => l.id === locationId);
      if (loc) {
        const locCreds = api.getLocationCredentials(loc, devices);
        if (locCreds) {
          api.replaceLocation(locationId, locCreds.credentials, locCreds.signingDevice)
            .then((newId) => {
              if (newId !== locationId) {
                // location_id changed — update local state
                setStoredLocations((p) =>
                  p.map((l) => (l.id === locationId ? { ...l, id: newId } : l))
                );
              }
            })
            .catch((err) => console.error("Failed to replace location on server:", err));
        }
      }
      return current; // Don't mutate here, just read
    });
  }, [devices]);

  const removeDeviceFromLocation = useCallback((locationId: string, serverDeviceId: string) => {
    // Optimistic local update
    setStoredLocations((prev) =>
      prev.map((l) => {
        if (l.id === locationId) {
          return { ...l, deviceIds: l.deviceIds.filter((id) => id !== serverDeviceId) };
        }
        return l;
      })
    );

    // Call replaceLocation with reduced device set
    // Use setTimeout to let the state update settle first
    setTimeout(() => {
      setStoredLocations((current) => {
        const loc = current.find((l) => l.id === locationId);
        if (loc && loc.deviceIds.length > 0) {
          const locCreds = api.getLocationCredentials(loc, devices);
          if (locCreds) {
            api.replaceLocation(locationId, locCreds.credentials, locCreds.signingDevice)
              .then((newId) => {
                if (newId !== locationId) {
                  setStoredLocations((p) =>
                    p.map((l) => (l.id === locationId ? { ...l, id: newId } : l))
                  );
                }
              })
              .catch((err) => console.error("Failed to replace location on server:", err));
          }
        }
        return current;
      });
    }, 0);
  }, [devices]);

  const setLocationOvercrowdingLimit = useCallback(
    async (id: string, limit: number | null) => {
      const normalizedLimit = limit === null || limit <= 0 ? null : limit;
      // Optimistic local update
      setStoredLocations((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, overcrowdingLimit: normalizedLimit } : l
        )
      );
      // Sync to server
      const loc = storedLocations.find((l) => l.id === id);
      if (loc) {
        const locCreds = api.getLocationCredentials(loc, devices);
        if (locCreds) {
          api.updateLocation(id, locCreds.credentials, locCreds.signingDevice, { overcrowdingLimit: normalizedLimit })
            .catch((err) => console.error("Failed to update overcrowding limit on server:", err));
        }
      }
    },
    [storedLocations, devices]
  );

  const getLocation = useCallback(
    (id: string) => locations.find((l) => l.id === id),
    [locations]
  );

  const getLocationForDevice = useCallback(
    (serverDeviceId: string) => locations.find((l) => l.deviceIds.includes(serverDeviceId)),
    [locations]
  );

  const getUngroupedDeviceIds = useCallback(() => {
    // Get all server device IDs in non-auto locations
    const groupedServerIds = new Set(
      storedLocations.filter((l) => !l.isAuto).flatMap((l) => l.deviceIds)
    );
    return devices
      .filter((d) => !groupedServerIds.has(d.deviceId))
      .map((d) => d.id); // Return local UUIDs for backward compat with DeviceCard
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
