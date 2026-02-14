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
  adoptAutoLocation: (serverDeviceId: string, password: string, locationName: string, colorName?: LocationColorName) => Promise<string | null>;
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
              const existingIdx = updated.findIndex((l) => l.id === serverLoc.id);
              const serverDeviceIds = serverLoc.devices.map((d) => d.device_id);

              if (existingIdx >= 0) {
                // Update existing location with server data
                // Don't revert isAuto to true once it's been adopted (set to false)
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  name: updated[existingIdx].isAuto === false ? updated[existingIdx].name : serverLoc.name,
                  deviceIds: serverDeviceIds,
                  overcrowdingLimit: serverLoc.overcrowding_limit,
                  isOnMap: serverLoc.on_map,
                  isAuto: updated[existingIdx].isAuto === false ? false : (serverLoc.is_auto ?? false),
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
    const result: LocationState[] = [];
    for (const loc of storedLocations) {
      if (loc.isAuto) continue;
      const memberDevices = devices.filter((d) => loc.deviceIds.includes(d.deviceId));
      // Skip locations with no matching devices in the app (ghost locations from server)
      if (memberDevices.length === 0) continue;
      const totalCount = memberDevices.reduce((sum, d) => sum + d.currentCount, 0);
      const isOverLimit =
        loc.overcrowdingLimit !== null &&
        loc.overcrowdingLimit > 0 &&
        totalCount > loc.overcrowdingLimit;
      const allDevicesOnline = memberDevices.every((d) => d.isOnline);
      const someDevicesOnline = memberDevices.some((d) => d.isOnline);
      result.push({
        ...loc,
        totalCount,
        isOverLimit,
        allDevicesOnline,
        someDevicesOnline,
      });
    }
    return result;
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

  // After replaceLocation returns a new ID, fetch full server data and merge
  // Preserves local-only fields (name, colorName) since the server may not have them
  const syncAfterReplace = useCallback(
    async (oldId: string, newId: string, locCreds: { credentials: Array<{ device_id: string; password: string }>; signingDevice: api.SigningCredentials }) => {
      try {
        const serverLoc = await api.getLocation(newId, locCreds.credentials, locCreds.signingDevice);
        const serverDeviceIds = serverLoc.devices.map((d) => d.device_id);
        setStoredLocations((p) => {
          // Remove any duplicate entry that already had the new ID (e.g. an auto-location from watch effect)
          const withoutDupe = p.filter((l) => l.id !== newId || l.id === oldId);
          return withoutDupe.map((l) => {
            if (l.id === oldId) {
              return {
                ...l,
                id: newId,
                // Preserve local name and color; sync server-managed fields
                deviceIds: serverDeviceIds,
                overcrowdingLimit: serverLoc.overcrowding_limit ?? l.overcrowdingLimit,
                isOnMap: serverLoc.on_map,
                isAuto: false,
              };
            }
            return l;
          });
        });
      } catch {
        // Fallback: just update the ID
        setStoredLocations((p) =>
          p.map((l) => (l.id === oldId ? { ...l, id: newId } : l))
        );
      }
    },
    []
  );

  const addDeviceToLocation = useCallback((locationId: string, serverDeviceId: string) => {
    // Find the location and build credentials BEFORE updating state
    const loc = storedLocations.find((l) => l.id === locationId);
    if (!loc) return;

    const newDeviceIds = loc.deviceIds.includes(serverDeviceId)
      ? loc.deviceIds
      : [...loc.deviceIds, serverDeviceId];

    // Build credentials for the full new device set
    const creds: Array<{ device_id: string; password: string }> = [];
    for (const sid of newDeviceIds) {
      const device = devices.find((d) => d.deviceId === sid);
      if (device) {
        creds.push({ device_id: device.deviceId, password: device.password });
      }
    }

    if (creds.length === 0) return;
    const signingDevice = { deviceId: creds[0].device_id, password: creds[0].password };

    // Optimistic local update
    setStoredLocations((prev) =>
      prev.map((l) => {
        if (l.id === locationId) {
          return { ...l, deviceIds: newDeviceIds };
        }
        return l;
      })
    );

    // Sync to server
    api.replaceLocation(locationId, creds, signingDevice)
      .then((newId) => {
        if (newId !== locationId) {
          syncAfterReplace(locationId, newId, { credentials: creds, signingDevice });
        }
      })
      .catch((err) => {
        console.error("Failed to replace location on server:", err);
        // Revert optimistic update on failure
        setStoredLocations((prev) =>
          prev.map((l) => {
            if (l.id === locationId) {
              return { ...l, deviceIds: loc.deviceIds };
            }
            return l;
          })
        );
      });
  }, [storedLocations, devices, syncAfterReplace]);

  const removeDeviceFromLocation = useCallback((locationId: string, serverDeviceId: string) => {
    // Find the location and build credentials BEFORE updating state
    const loc = storedLocations.find((l) => l.id === locationId);
    if (!loc) return;

    const newDeviceIds = loc.deviceIds.filter((id) => id !== serverDeviceId);

    // Build credentials for the remaining device set
    const creds: Array<{ device_id: string; password: string }> = [];
    for (const sid of newDeviceIds) {
      const device = devices.find((d) => d.deviceId === sid);
      if (device) {
        creds.push({ device_id: device.deviceId, password: device.password });
      }
    }

    // Optimistic local update
    setStoredLocations((prev) =>
      prev.map((l) => {
        if (l.id === locationId) {
          return { ...l, deviceIds: newDeviceIds };
        }
        return l;
      })
    );

    // Sync to server (only if there are remaining devices)
    if (creds.length > 0) {
      const signingDevice = { deviceId: creds[0].device_id, password: creds[0].password };
      api.replaceLocation(locationId, creds, signingDevice)
        .then((newId) => {
          if (newId !== locationId) {
            syncAfterReplace(locationId, newId, { credentials: creds, signingDevice });
          }
        })
        .catch((err) => {
          console.error("Failed to replace location on server:", err);
          // Revert optimistic update on failure
          setStoredLocations((prev) =>
            prev.map((l) => {
              if (l.id === locationId) {
                return { ...l, deviceIds: loc.deviceIds };
              }
              return l;
            })
          );
        });
    }
  }, [storedLocations, devices, syncAfterReplace]);

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

  // Adopt an auto-location for a device: rename it, mark isAuto: false
  const adoptAutoLocation = useCallback(
    async (serverDeviceId: string, password: string, locationName: string, colorName: LocationColorName = "blue"): Promise<string | null> => {
      // First, try to find an existing isAuto location for this device in stored locations
      const autoLoc = storedLocations.find(
        (l) => l.isAuto && l.deviceIds.includes(serverDeviceId)
      );

      if (autoLoc) {
        // Adopt: rename + mark isAuto: false locally
        setStoredLocations((prev) =>
          prev.map((l) =>
            l.id === autoLoc.id
              ? { ...l, name: locationName, isAuto: false, colorName }
              : l
          )
        );
        // Sync rename to server in background
        const signingDevice = { deviceId: serverDeviceId, password };
        const creds = [{ device_id: serverDeviceId, password }];
        api.updateLocation(autoLoc.id, creds, signingDevice, { name: locationName })
          .catch((err) => console.error("Failed to rename adopted location:", err));
        return autoLoc.id;
      }

      // No auto-location found yet — fetch from server
      try {
        const serverLocations = await api.getLocationsForDevice(serverDeviceId, password);
        const serverAutoLoc = serverLocations.find(
          (sl) => sl.is_auto && sl.devices.some((d) => d.device_id === serverDeviceId)
        );

        if (serverAutoLoc) {
          const serverDeviceIds = serverAutoLoc.devices.map((d) => d.device_id);
          // Store and adopt in one step
          setStoredLocations((prev) => {
            const existingIdx = prev.findIndex((l) => l.id === serverAutoLoc.id);
            if (existingIdx >= 0) {
              return prev.map((l) =>
                l.id === serverAutoLoc.id
                  ? { ...l, name: locationName, isAuto: false, colorName, deviceIds: serverDeviceIds }
                  : l
              );
            }
            return [
              ...prev,
              {
                id: serverAutoLoc.id,
                name: locationName,
                deviceIds: serverDeviceIds,
                overcrowdingLimit: serverAutoLoc.overcrowding_limit,
                colorName,
                isAuto: false,
                isOnMap: serverAutoLoc.on_map,
              },
            ];
          });
          // Sync rename to server
          const signingDevice = { deviceId: serverDeviceId, password };
          const creds = [{ device_id: serverDeviceId, password }];
          api.updateLocation(serverAutoLoc.id, creds, signingDevice, { name: locationName })
            .catch((err) => console.error("Failed to rename adopted location:", err));
          return serverAutoLoc.id;
        }

        // No auto-location exists — create a new location
        const creds = [{ device_id: serverDeviceId, password }];
        const signingDevice = { deviceId: serverDeviceId, password };
        const locationId = await api.createLocation(creds, signingDevice, locationName);
        setStoredLocations((prev) => [
          ...prev,
          {
            id: locationId,
            name: locationName,
            deviceIds: [serverDeviceId],
            overcrowdingLimit: null,
            colorName,
            isAuto: false,
            isOnMap: false,
          },
        ]);
        return locationId;
      } catch (err) {
        console.error("Failed to adopt/create location:", err);
        return null;
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
        adoptAutoLocation,
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
