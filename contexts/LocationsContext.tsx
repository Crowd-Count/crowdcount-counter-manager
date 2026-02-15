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
  addCounterToLocation: (locationId: string, newDeviceId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  removeDeviceFromLocation: (locationId: string, serverDeviceId: string) => void;
  setLocationOvercrowdingLimit: (id: string, limit: number | null) => Promise<void>;
  getLocation: (id: string) => LocationState | undefined;
  getLocationForDevice: (serverDeviceId: string) => LocationState | undefined;
  getUngroupedDeviceIds: () => string[];
  adoptAutoLocation: (serverDeviceId: string, password: string, locationName: string, colorName?: LocationColorName) => Promise<string | null>;
  refreshAllLocations: () => Promise<void>;
  refreshLocation: (id: string) => Promise<void>;
}

const LocationsContext = createContext<LocationsContextType | undefined>(undefined);

const STORAGE_KEY = "crowdcount_locations";

function generateLocalId(): string {
  return crypto.randomUUID();
}

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
    // Backfill localId for locations that don't have one yet
    let needsSave = false;
    for (const loc of parsed) {
      if (!loc.localId) {
        loc.localId = generateLocalId();
        needsSave = true;
      }
    }
    if (needsSave) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
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
  const { devices, addDevice, removeDevice, updateDeviceOnlineStatus } = useDevices();
  const [storedLocations, setStoredLocations] = useState<StoredLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Location counts from server polling: locationServerId → current_count
  const [locationCounts, setLocationCounts] = useState<Record<string, number>>({});

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

  // Device IDs currently being processed by addCounterToLocation —
  // the watch effect must skip these to avoid race conditions
  const pendingCounterAddRef = useRef<Set<string>>(new Set());

  // Watch for new devices and auto-fetch their server locations
  const prevDeviceIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isLoading) return;
    const currentDeviceIds = new Set(devices.map((d) => d.deviceId));
    const prevIds = prevDeviceIdsRef.current;

    // Find newly added devices (skip those being handled by addCounterToLocation)
    const newDevices = devices.filter(
      (d) => !prevIds.has(d.deviceId) && !pendingCounterAddRef.current.has(d.deviceId)
    );
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
                  localId: generateLocalId(),
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

  // ── Location Polling ──

  // Refs for polling to access latest state without re-triggering effects
  const storedLocationsRef = useRef<StoredLocation[]>([]);
  storedLocationsRef.current = storedLocations;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // Fetch data for a single location (count + per-device connection status)
  const fetchLocationData = useCallback(async (loc: StoredLocation) => {
    const currentDevices = devicesRef.current;
    const locCreds = api.getLocationCredentials(loc, currentDevices);
    if (!locCreds) return;

    // Fetch location count + per-device connection status in parallel
    const connectionPromises = loc.deviceIds.map((serverDeviceId) => {
      const device = currentDevices.find((d) => d.deviceId === serverDeviceId);
      if (!device) return Promise.resolve();
      return api.getConnectionStatus(device.deviceId, device.password)
        .then((status) => {
          updateDeviceOnlineStatus(device.id, status === "online");
        })
        .catch(() => {});
    });

    const locationPromise = api.getLocation(loc.id, locCreds.credentials, locCreds.signingDevice)
      .then((serverLoc) => {
        // Update count (only if changed to avoid re-renders)
        setLocationCounts((prev) => {
          if (prev[loc.id] === serverLoc.current_count) return prev;
          return { ...prev, [loc.id]: serverLoc.current_count };
        });
        // Sync metadata from server (only if changed)
        setStoredLocations((prev) => {
          const existing = prev.find((l) => l.id === loc.id);
          if (!existing) return prev;
          if (
            existing.name === serverLoc.name &&
            existing.overcrowdingLimit === serverLoc.overcrowding_limit &&
            existing.isOnMap === serverLoc.on_map
          ) {
            return prev; // no change
          }
          return prev.map((l) =>
            l.id === loc.id
              ? {
                  ...l,
                  name: serverLoc.name,
                  overcrowdingLimit: serverLoc.overcrowding_limit,
                  isOnMap: serverLoc.on_map,
                }
              : l
          );
        });
      })
      .catch(() => {});

    await Promise.all([locationPromise, ...connectionPromises]);
  }, [updateDeviceOnlineStatus]);

  // Poll all non-auto locations
  const pollAllLocations = useCallback(async () => {
    const locs = storedLocationsRef.current.filter(
      (l) => !l.isAuto && l.deviceIds.length > 0
    );
    await Promise.all(locs.map((loc) => fetchLocationData(loc)));
  }, [fetchLocationData]);

  // Polling interval
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isLoading) return;

    // Initial fetch
    pollAllLocations();

    // Set up interval
    pollIntervalRef.current = setInterval(() => {
      if (document.hidden) return;
      pollAllLocations();
    }, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isLoading, pollAllLocations]);

  // Refresh all locations immediately when tab becomes visible
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        pollAllLocations();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [pollAllLocations]);

  // Exposed refresh functions
  const refreshAllLocations = useCallback(async () => {
    await pollAllLocations();
  }, [pollAllLocations]);

  const refreshLocation = useCallback(async (id: string) => {
    const loc = storedLocationsRef.current.find((l) => l.id === id);
    if (loc) {
      await fetchLocationData(loc);
    }
  }, [fetchLocationData]);

  // Compute LocationState[] from StoredLocation[] + location counts + device online status
  const locations: LocationState[] = useMemo(() => {
    const result: LocationState[] = [];
    for (const loc of storedLocations) {
      if (loc.isAuto) continue;
      const memberDevices = devices.filter((d) => loc.deviceIds.includes(d.deviceId));
      // Skip locations with no matching devices in the app (ghost locations from server)
      if (memberDevices.length === 0) continue;
      const totalCount = locationCounts[loc.id] ?? 0;
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
  }, [storedLocations, devices, locationCounts]);

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
        return null;
      }

      const signingDevice = { deviceId: creds[0].device_id, password: creds[0].password };

      try {
        const locationId = await api.createLocation(creds, signingDevice, name);
        const newLocation: StoredLocation = {
          id: locationId,
          localId: generateLocalId(),
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
      // Read current state from refs to avoid stale closures
      const currentLocs = storedLocationsRef.current;
      const loc = currentLocs.find((l) => l.id === id);

      // Remove stored location FIRST (before devices, so auto-prune doesn't interfere)
      setStoredLocations((prev) => prev.filter((l) => l.id !== id));

      // Clean up count
      setLocationCounts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      // Then remove member devices from the app
      if (loc) {
        const currentDevices = devicesRef.current;
        for (const serverDeviceId of loc.deviceIds) {
          const device = currentDevices.find((d) => d.deviceId === serverDeviceId);
          if (device) {
            removeDevice(device.id);
          }
        }
      }
    },
    [removeDevice]
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

  // Helper: update a stored location's server ID + sync server metadata, preserving localId/name/color
  const updateLocationServerId = useCallback(
    (localId: string, oldServerId: string, newServerId: string, creds: Array<{ device_id: string; password: string }>, signingDevice: api.SigningCredentials) => {
      if (newServerId === oldServerId) return;
      api.getLocation(newServerId, creds, signingDevice)
        .then((serverLoc) => {
          const serverDevIds = serverLoc.devices.map((d) => d.device_id);
          setStoredLocations((prev) => {
            // Remove any other entries that have the new server ID (duplicates from watch effect)
            const cleaned = prev.filter((l) => l.localId === localId || l.id !== newServerId);
            return cleaned.map((l) =>
              l.localId === localId
                ? { ...l, id: newServerId, deviceIds: serverDevIds, overcrowdingLimit: serverLoc.overcrowding_limit ?? l.overcrowdingLimit, isOnMap: serverLoc.on_map, isAuto: false }
                : l
            );
          });
        })
        .catch(() => {
          // Fallback: just update the server ID
          setStoredLocations((prev) => {
            const cleaned = prev.filter((l) => l.localId === localId || l.id !== newServerId);
            return cleaned.map((l) => l.localId === localId ? { ...l, id: newServerId } : l);
          });
        });
    },
    []
  );

  const addDeviceToLocation = useCallback((locationId: string, serverDeviceId: string) => {
    // Used by settings page for moving already-registered devices between locations
    const loc = storedLocations.find((l) => l.id === locationId);
    if (!loc) return;

    const newDeviceIds = loc.deviceIds.includes(serverDeviceId)
      ? loc.deviceIds
      : [...loc.deviceIds, serverDeviceId];

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
      prev.map((l) => l.id === locationId ? { ...l, deviceIds: newDeviceIds } : l)
    );

    // Use createLocation (server deduplicates by device-set hash)
    api.createLocation(creds, signingDevice, loc.name, loc.overcrowdingLimit)
      .then((newId) => {
        updateLocationServerId(loc.localId, locationId, newId, creds, signingDevice);
      })
      .catch((err) => console.error("Failed to sync location change to server:", err));
  }, [storedLocations, devices, updateLocationServerId]);

  // Add a new counter (by ID + password) to an existing location.
  const addCounterToLocation = useCallback(
    async (locationId: string, newDeviceId: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const loc = storedLocations.find((l) => l.id === locationId);
      if (!loc) return { success: false, error: "Location not found" };
      const stableLocalId = loc.localId;

      // 1. Validate password
      try {
        const valid = await api.checkPassword(newDeviceId, password);
        if (!valid) return { success: false, error: "Invalid credentials" };
      } catch {
        return { success: false, error: "Failed to validate credentials" };
      }

      // 2. Suppress watch effect for this device to avoid race conditions
      pendingCounterAddRef.current.add(newDeviceId);

      try {
        // 3. Register device in DevicesContext (if not already present)
        const existing = devices.find((d) => d.deviceId === newDeviceId);
        if (!existing) {
          const added = await addDevice(newDeviceId, password);
          if (!added) return { success: false, error: "Failed to add counter" };
        }

        // 4. Build combined device set
        const combinedDeviceIds = loc.deviceIds.includes(newDeviceId)
          ? loc.deviceIds
          : [...loc.deviceIds, newDeviceId];
        const combinedSet = new Set(combinedDeviceIds);

        // 5. Build credentials
        const creds: Array<{ device_id: string; password: string }> = [];
        for (const sid of combinedDeviceIds) {
          if (sid === newDeviceId) {
            creds.push({ device_id: sid, password });
          } else {
            const device = devices.find((d) => d.deviceId === sid);
            if (device) creds.push({ device_id: device.deviceId, password: device.password });
          }
        }
        if (creds.length === 0) return { success: false, error: "No valid credentials" };
        const signingDevice = { deviceId: creds[0].device_id, password: creds[0].password };

        // 6. Optimistic local update
        setStoredLocations((prev) =>
          prev.map((l) => l.localId === stableLocalId ? { ...l, deviceIds: combinedDeviceIds } : l)
        );

        // 7. Find or create the server location with all combined devices
        let newServerId: string;
        const serverLocations = await api.getLocationsForDevice(newDeviceId, password);
        const sharedLoc = serverLocations.find((sl) => {
          const slDeviceIds = new Set(sl.devices.map((d) => d.device_id));
          return [...combinedSet].every((id) => slDeviceIds.has(id));
        });

        if (sharedLoc) {
          newServerId = sharedLoc.id;
        } else {
          newServerId = await api.createLocation(creds, signingDevice, loc.name, loc.overcrowdingLimit);
        }

        // 8. Swap the local entry to point at the correct server location
        setStoredLocations((prev) => {
          const cleaned = prev.filter((l) => l.localId === stableLocalId || l.id !== newServerId);
          return cleaned.map((l) =>
            l.localId === stableLocalId
              ? { ...l, id: newServerId, deviceIds: combinedDeviceIds, isAuto: false }
              : l
          );
        });

        // 9. Clean up auto-locations for the new device
        setStoredLocations((prev) =>
          prev.filter((l) => !(l.isAuto && l.deviceIds.length === 1 && l.deviceIds[0] === newDeviceId))
        );

        return { success: true };
      } catch (err) {
        console.error("addCounterToLocation server sync failed:", err);
        return { success: false, error: "Server sync failed" };
      } finally {
        pendingCounterAddRef.current.delete(newDeviceId);
      }
    },
    [storedLocations, devices, addDevice]
  );

  const removeDeviceFromLocation = useCallback((locationId: string, serverDeviceId: string) => {
    const loc = storedLocations.find((l) => l.id === locationId);
    if (!loc) return;

    // Remove the device from the app locally
    const device = devices.find((d) => d.deviceId === serverDeviceId);
    if (device) {
      removeDevice(device.id);
    }

    const newDeviceIds = loc.deviceIds.filter((id) => id !== serverDeviceId);

    if (newDeviceIds.length === 0) {
      setStoredLocations((prev) => prev.filter((l) => l.id !== locationId));
      return;
    }

    // Optimistic local update
    setStoredLocations((prev) =>
      prev.map((l) => l.id === locationId ? { ...l, deviceIds: newDeviceIds } : l)
    );

    // Find or create the server location matching the remaining counters
    const creds: Array<{ device_id: string; password: string }> = [];
    for (const sid of newDeviceIds) {
      const d = devices.find((dev) => dev.deviceId === sid);
      if (d) {
        creds.push({ device_id: d.deviceId, password: d.password });
      }
    }
    if (creds.length === 0) return;
    const signingDevice = { deviceId: creds[0].device_id, password: creds[0].password };

    api.createLocation(creds, signingDevice, loc.name, loc.overcrowdingLimit)
      .then((newId) => {
        updateLocationServerId(loc.localId, locationId, newId, creds, signingDevice);
      })
      .catch((err) => console.error("Failed to sync location change to server:", err));
  }, [storedLocations, devices, removeDevice, updateLocationServerId]);

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
      const autoLoc = storedLocations.find(
        (l) => l.isAuto && l.deviceIds.includes(serverDeviceId)
      );

      if (autoLoc) {
        setStoredLocations((prev) =>
          prev.map((l) =>
            l.id === autoLoc.id
              ? { ...l, name: locationName, isAuto: false, colorName }
              : l
          )
        );
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
                localId: generateLocalId(),
                name: locationName,
                deviceIds: serverDeviceIds,
                overcrowdingLimit: serverAutoLoc.overcrowding_limit,
                colorName,
                isAuto: false,
                isOnMap: serverAutoLoc.on_map,
              },
            ];
          });
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
            localId: generateLocalId(),
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
    const groupedServerIds = new Set(
      storedLocations.filter((l) => !l.isAuto).flatMap((l) => l.deviceIds)
    );
    return devices
      .filter((d) => !groupedServerIds.has(d.deviceId))
      .map((d) => d.id);
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
        addCounterToLocation,
        removeDeviceFromLocation,
        setLocationOvercrowdingLimit,
        getLocation,
        getLocationForDevice,
        getUngroupedDeviceIds,
        adoptAutoLocation,
        refreshAllLocations,
        refreshLocation,
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
