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
import { encrypt } from "@/lib/secureStorage";

interface LocationsContextType {
  locations: LocationState[];
  isLoading: boolean;
  addLocation: (name: string, colorName: LocationColorName, serverDeviceIds?: string[], passwordOverride?: string) => Promise<string | null>;
  removeLocation: (id: string) => Promise<void>;
  updateLocationName: (id: string, name: string) => void;
  updateLocationColor: (id: string, colorName: LocationColorName) => void;
  addCounterToLocation: (locationId: string, newDeviceId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  removeDeviceFromLocation: (locationId: string, serverDeviceId: string) => Promise<string | null>;
  setLocationOvercrowdingLimit: (id: string, limit: number | null) => Promise<void>;
  getLocation: (id: string) => LocationState | undefined;
  getLocationForDevice: (serverDeviceId: string) => LocationState | undefined;
  getUngroupedDeviceIds: () => string[];
  adoptAutoLocation: (serverDeviceId: string, password: string, locationName: string, colorName?: LocationColorName) => Promise<string | null>;
  refreshAllLocations: () => Promise<void>;
  refreshLocation: (id: string) => Promise<void>;
  hasConnectionError: boolean;
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
    // Backfill missing fields for locations from older versions
    let needsSave = false;
    for (const loc of parsed) {
      if (!loc.localId) {
        loc.localId = generateLocalId();
        needsSave = true;
      }
      if (loc.serverColor === undefined) {
        loc.serverColor = null;
        needsSave = true;
      }
      if (loc.latitude === undefined) {
        loc.latitude = null;
        needsSave = true;
      }
      if (loc.longitude === undefined) {
        loc.longitude = null;
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

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

function isSuperset<T>(superset: Set<T>, subset: Set<T>): boolean {
  return [...subset].every((x) => superset.has(x));
}

export function LocationsProvider({ children }: { children: React.ReactNode }) {
  const { devices, addDevice, removeDevice, updateDeviceOnlineStatus } = useDevices();
  const [storedLocations, setStoredLocations] = useState<StoredLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Location counts from server polling: locationServerId → current_count
  const [locationCounts, setLocationCounts] = useState<Record<string, number>>({});
  // Server device counts: locationServerId → number of devices the server knows about
  const [serverDeviceCounts, setServerDeviceCounts] = useState<Record<string, number>>({});
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const consecutiveFailuresRef = useRef(0);

  // Load locations from storage on mount
  useEffect(() => {
    const stored = loadLocationsFromStorage();
    setStoredLocations(stored);
    setIsLoading(false);
  }, []);

  // Save locations to storage when they change
  // NOTE: localStorage removal is handled explicitly by removeLocation (synchronous write)
  // to prevent accidental wipes from transient empty state
  useEffect(() => {
    if (!isLoading && storedLocations.length > 0) {
      saveLocationsToStorage(storedLocations);
    }
  }, [storedLocations, isLoading]);

  // ── Location Polling ──

  // Refs for polling to access latest state without re-triggering effects
  const storedLocationsRef = useRef<StoredLocation[]>([]);
  storedLocationsRef.current = storedLocations;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // Fetch data for a single location (count + per-device connection status)
  // Returns true if the location fetch succeeded, false otherwise
  const fetchLocationData = useCallback(async (loc: StoredLocation): Promise<boolean> => {
    const currentDevices = devicesRef.current;
    const locCreds = api.getLocationCredentials(loc, currentDevices);
    if (!locCreds) return false;

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

    let locationSuccess = false;
    const locationPromise = api.getLocation(loc.id, locCreds.credentials, locCreds.signingDevice)
      .then((serverLoc) => {
        locationSuccess = true;
        // Update count (only if changed to avoid re-renders)
        setLocationCounts((prev) => {
          if (prev[loc.id] === serverLoc.current_count) return prev;
          return { ...prev, [loc.id]: serverLoc.current_count };
        });
        // Track how many devices the server knows about
        setServerDeviceCounts((prev) => {
          const count = serverLoc.devices?.length ?? 0;
          if (prev[loc.id] === count) return prev;
          return { ...prev, [loc.id]: count };
        });
        // Sync metadata from server (server is authoritative for name, overcrowding, on_map, color)
        // NOTE: deviceIds are NOT synced from polling — they're managed by addCounterToLocation/removeDeviceFromLocation
        // to avoid race conditions where partial credentials return a partial device list
        setStoredLocations((prev) => {
          const existing = prev.find((l) => l.id === loc.id);
          if (!existing) return prev;
          const newName = serverLoc.location_name ?? existing.name;
          const newColor = serverLoc.location_color ?? existing.serverColor;
          const newLat = serverLoc.location_latitude ?? existing.latitude;
          const newLng = serverLoc.location_longitude ?? existing.longitude;
          if (
            existing.name === newName &&
            existing.overcrowdingLimit === serverLoc.overcrowding_limit &&
            existing.isOnMap === serverLoc.on_map &&
            existing.serverColor === newColor &&
            existing.latitude === newLat &&
            existing.longitude === newLng
          ) {
            return prev; // no change
          }
          return prev.map((l) =>
            l.id === loc.id
              ? {
                  ...l,
                  name: newName,
                  overcrowdingLimit: serverLoc.overcrowding_limit,
                  isOnMap: serverLoc.on_map,
                  serverColor: newColor,
                  latitude: newLat,
                  longitude: newLng,
                }
              : l
          );
        });
      })
      .catch((err) => {
        console.error(`Failed to poll location ${loc.id}:`, err);
      });

    await Promise.all([locationPromise, ...connectionPromises]);
    return locationSuccess;
  }, [updateDeviceOnlineStatus]);

  // Poll all non-auto locations
  const pollAllLocations = useCallback(async () => {
    const locs = storedLocationsRef.current.filter(
      (l) => !l.isAuto && l.deviceIds.length > 0
    );
    if (locs.length === 0) return;
    const results = await Promise.all(locs.map((loc) => fetchLocationData(loc)));
    const anySucceeded = results.some((ok) => ok === true);

    if (anySucceeded) {
      consecutiveFailuresRef.current = 0;
      setHasConnectionError(false);
    } else {
      consecutiveFailuresRef.current += 1;
      // Only show error after 2 consecutive failures (~5s) AND a healthcheck confirms server is down
      if (consecutiveFailuresRef.current >= 2) {
        const serverUp = await api.pingServer();
        setHasConnectionError(!serverUp);
      }
    }
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
      const totalCount = loc.id in locationCounts ? locationCounts[loc.id] : null;
      const isOverLimit =
        totalCount !== null &&
        loc.overcrowdingLimit !== null &&
        loc.overcrowdingLimit > 0 &&
        totalCount > loc.overcrowdingLimit;
      const allDevicesOnline = memberDevices.every((d) => d.isOnline);
      const someDevicesOnline = memberDevices.some((d) => d.isOnline);
      const serverDeviceCount = loc.id in serverDeviceCounts ? serverDeviceCounts[loc.id] : null;
      result.push({
        ...loc,
        totalCount,
        isOverLimit,
        allDevicesOnline,
        someDevicesOnline,
        serverDeviceCount,
      });
    }
    return result;
  }, [storedLocations, devices, locationCounts, serverDeviceCounts]);

  const addLocation = useCallback(
    async (name: string, colorName: LocationColorName, serverDeviceIds: string[] = [], passwordOverride?: string): Promise<string | null> => {
      // Build credentials from the devices matching these server device IDs
      const currentDevices = devicesRef.current;
      const creds: Array<{ device_id: string; password: string }> = [];
      for (const sid of serverDeviceIds) {
        const device = currentDevices.find((d) => d.deviceId === sid);
        if (device) {
          creds.push({ device_id: device.deviceId, password: device.password });
        } else if (passwordOverride) {
          // Device was just added and state hasn't flushed yet — use the provided password
          creds.push({ device_id: sid, password: passwordOverride });
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
          serverColor: null,
          latitude: null,
          longitude: null,
        };
        setStoredLocations((prev) => {
          // Dedup: if server returned an existing location ID, replace instead of adding
          const existingIdx = prev.findIndex((l) => l.id === locationId);
          if (existingIdx >= 0) {
            return prev.map((l) => l.id === locationId ? { ...l, name, colorName, deviceIds: serverDeviceIds, isAuto: false } : l);
          }
          return [...prev, newLocation];
        });
        return locationId;
      } catch (error) {
        console.error("Failed to create location on server:", error);
        return null;
      }
    },
    []
  );

  const removeLocation = useCallback(
    async (id: string) => {
      // Read current state from refs to avoid stale closures
      // Search by both server ID and localId (server ID may have changed since URL was loaded)
      const currentLocs = storedLocationsRef.current;
      const loc = currentLocs.find((l) => l.id === id || l.localId === id);
      if (!loc) return;

      // 1. Synchronously update localStorage BEFORE React state updates
      //    (React state may not flush before navigation)
      const remainingLocs = currentLocs.filter((l) => l.localId !== loc.localId);
      if (remainingLocs.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        saveLocationsToStorage(remainingLocs);
      }

      // 2. Remove devices from localStorage synchronously too
      const currentDevices = devicesRef.current;
      const deviceIdsToRemove = new Set<string>();
      for (const serverDeviceId of loc.deviceIds) {
        const device = currentDevices.find((d) => d.deviceId === serverDeviceId);
        if (device) deviceIdsToRemove.add(device.id);
      }
      const remainingDevices = currentDevices.filter((d) => !deviceIdsToRemove.has(d.id));
      if (remainingDevices.length === 0) {
        localStorage.removeItem("crowdcount_devices");
      } else {
        // Encrypt before writing — fire-and-forget (React state update also triggers a save)
        const devicesJson = JSON.stringify(
          remainingDevices.map((d) => ({ id: d.id, deviceId: d.deviceId, password: d.password, name: d.name }))
        );
        encrypt(devicesJson).then(
          (enc) => localStorage.setItem("crowdcount_devices", enc),
          () => localStorage.setItem("crowdcount_devices", devicesJson) // fallback
        );
      }

      // 3. Schedule React state updates (will commit on next render)
      setStoredLocations((prev) => prev.filter((l) => l.localId !== loc.localId));
      setLocationCounts((prev) => {
        const next = { ...prev };
        delete next[loc.id];
        return next;
      });
      for (const deviceLocalId of deviceIdsToRemove) {
        removeDevice(deviceLocalId);
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
    const loc = storedLocationsRef.current.find((l) => l.id === id);
    if (loc) {
      const locCreds = api.getLocationCredentials(loc, devicesRef.current);
      if (locCreds) {
        api.updateLocation(id, locCreds.credentials, locCreds.signingDevice, { name })
          .catch((err) => console.error("Failed to update location name on server:", err));
      }
    }
  }, []);

  const updateLocationColor = useCallback((id: string, colorName: LocationColorName) => {
    // Color is client-only, no server sync needed
    setStoredLocations((prev) =>
      prev.map((l) => (l.id === id ? { ...l, colorName } : l))
    );
  }, []);

  // Add a new counter (by ID + password) to an existing location.
  const addCounterToLocation = useCallback(
    async (locationId: string, newDeviceId: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const loc = storedLocationsRef.current.find((l) => l.id === locationId || l.localId === locationId);
      if (!loc) return { success: false, error: "Location not found" };
      const stableLocalId = loc.localId;

      // 1. Validate password
      try {
        const valid = await api.checkPassword(newDeviceId, password);
        if (!valid) return { success: false, error: "Invalid credentials" };
      } catch {
        return { success: false, error: "Failed to validate credentials" };
      }

      try {
        // 2. Register device in DevicesContext (if not already present)
        //    addDevice returns false if device already exists OR if checkPassword fails.
        //    Since we already validated password in step 1, false means "already exists" — safe to continue.
        const existing = devicesRef.current.find((d) => d.deviceId === newDeviceId);
        if (!existing) {
          await addDevice(newDeviceId, password);
        }

        // 3. Build combined device set (dedup)
        const combinedDeviceIds = loc.deviceIds.includes(newDeviceId)
          ? loc.deviceIds
          : [...loc.deviceIds, newDeviceId];

        // 4. Build credentials from all devices (use devicesRef + new password for the new device)
        const currentDevices = devicesRef.current;
        const creds: Array<{ device_id: string; password: string }> = [];
        for (const sid of combinedDeviceIds) {
          if (sid === newDeviceId) {
            creds.push({ device_id: sid, password });
          } else {
            const device = currentDevices.find((d) => d.deviceId === sid);
            if (device) creds.push({ device_id: device.deviceId, password: device.password });
          }
        }
        if (creds.length === 0) return { success: false, error: "No valid credentials" };
        const signingDevice = { deviceId: creds[0].device_id, password: creds[0].password };

        // 5. iOS-style lookup: find existing location with matching device set
        const serverLocations = await api.getLocationsForDevice(newDeviceId, password);
        const combinedSet = new Set(combinedDeviceIds);
        const sharedLoc = serverLocations.find((sl) => {
          const serverSet = new Set(sl.devices.map((d) => d.device_id));
          return sl.on_map
            ? setsEqual(serverSet, combinedSet)
            : isSuperset(serverSet, combinedSet);
        });

        let newServerId: string;
        let serverName = loc.name;
        let serverOvercrowding = loc.overcrowdingLimit;
        let serverOnMap = loc.isOnMap;
        let serverColor = loc.serverColor;
        let serverLat = loc.latitude;
        let serverLng = loc.longitude;

        if (sharedLoc) {
          // Match found — use existing server location
          newServerId = sharedLoc.location_id;
          serverName = sharedLoc.location_name ?? loc.name;
          serverOvercrowding = sharedLoc.overcrowding_limit;
          serverOnMap = sharedLoc.on_map;
          serverColor = sharedLoc.location_color ?? loc.serverColor;
          serverLat = sharedLoc.location_latitude ?? loc.latitude;
          serverLng = sharedLoc.location_longitude ?? loc.longitude;
        } else {
          // No match — create new location
          newServerId = await api.createLocation(creds, signingDevice, loc.name, loc.overcrowdingLimit);
          try {
            const serverLoc = await api.getLocation(newServerId, creds, signingDevice);
            serverName = serverLoc.location_name ?? loc.name;
            serverOvercrowding = serverLoc.overcrowding_limit;
            serverOnMap = serverLoc.on_map;
            serverColor = serverLoc.location_color ?? loc.serverColor;
            serverLat = serverLoc.location_latitude ?? loc.latitude;
            serverLng = serverLoc.location_longitude ?? loc.longitude;
          } catch {
            // Fall back to local values if fetch fails
          }
        }

        // 6. Update target location (by localId) with new server ID + server metadata
        //    Also filter out any other entries with the same new server ID (dedup)
        setStoredLocations((prev) => {
          const cleaned = prev.filter((l) => l.localId === stableLocalId || l.id !== newServerId);
          return cleaned.map((l) =>
            l.localId === stableLocalId
              ? { ...l, id: newServerId, deviceIds: combinedDeviceIds, isAuto: false, name: serverName, overcrowdingLimit: serverOvercrowding, isOnMap: serverOnMap, serverColor, latitude: serverLat, longitude: serverLng }
              : l
          );
        });

        // 9. Remove standalone locations for the new device (from previous auto-location)
        //    (any loc where deviceIds.length === 1 && deviceIds[0] === newDeviceId && localId !== target)
        setStoredLocations((prev) =>
          prev.filter((l) => !(l.deviceIds.length === 1 && l.deviceIds[0] === newDeviceId && l.localId !== stableLocalId))
        );

        return { success: true };
      } catch (err) {
        console.error("addCounterToLocation server sync failed:", err);
        return { success: false, error: "Server sync failed" };
      }
    },
    [addDevice]
  );

  const removeDeviceFromLocation = useCallback(async (locationId: string, serverDeviceId: string): Promise<string | null> => {
    const loc = storedLocationsRef.current.find((l) => l.id === locationId || l.localId === locationId);
    if (!loc) return null;
    const stableLocalId = loc.localId;

    const currentDevices = devicesRef.current;
    const device = currentDevices.find((d) => d.deviceId === serverDeviceId);

    const remainingDeviceIds = loc.deviceIds.filter((id) => id !== serverDeviceId);

    // If this was the last device, delete location + remove device
    if (remainingDeviceIds.length === 0) {
      setStoredLocations((prev) => prev.filter((l) => l.localId !== stableLocalId));
      if (device) removeDevice(device.id);
      return null;
    }

    // Build remaining credentials (BEFORE removing anything)
    const creds: Array<{ device_id: string; password: string }> = [];
    for (const sid of remainingDeviceIds) {
      const d = currentDevices.find((dev) => dev.deviceId === sid);
      if (d) {
        creds.push({ device_id: d.deviceId, password: d.password });
      }
    }
    if (creds.length === 0) return null;
    const signingDevice = { deviceId: creds[0].device_id, password: creds[0].password };

    try {
      // iOS-style lookup: find existing location with remaining device set
      const serverLocations = await api.getLocationsForDevice(creds[0].device_id, creds[0].password);
      const remainingSet = new Set(remainingDeviceIds);
      const sharedLoc = serverLocations.find((sl) => {
        const serverSet = new Set(sl.devices.map((d) => d.device_id));
        return sl.on_map
          ? setsEqual(serverSet, remainingSet)
          : isSuperset(serverSet, remainingSet);
      });

      let newServerId: string;
      let serverName = loc.name;
      let serverOvercrowding = loc.overcrowdingLimit;
      let serverOnMap = loc.isOnMap;
      let serverColor = loc.serverColor;
      let serverLat = loc.latitude;
      let serverLng = loc.longitude;
      let serverCount: number | null = null;

      if (sharedLoc) {
        // Match found — use existing server location
        newServerId = sharedLoc.location_id;
        serverName = sharedLoc.location_name ?? loc.name;
        serverOvercrowding = sharedLoc.overcrowding_limit;
        serverOnMap = sharedLoc.on_map;
        serverColor = sharedLoc.location_color ?? loc.serverColor;
        serverLat = sharedLoc.location_latitude ?? loc.latitude;
        serverLng = sharedLoc.location_longitude ?? loc.longitude;
        serverCount = sharedLoc.current_count;
      } else {
        // No match — create new location
        newServerId = await api.createLocation(creds, signingDevice, loc.name, loc.overcrowdingLimit);
        try {
          const serverLoc = await api.getLocation(newServerId, creds, signingDevice);
          serverName = serverLoc.location_name ?? loc.name;
          serverOvercrowding = serverLoc.overcrowding_limit;
          serverOnMap = serverLoc.on_map;
          serverColor = serverLoc.location_color ?? loc.serverColor;
          serverLat = serverLoc.location_latitude ?? loc.latitude;
          serverLng = serverLoc.location_longitude ?? loc.longitude;
          serverCount = serverLoc.current_count;
        } catch {
          // Fall back to local values if fetch fails
        }
      }

      // Swap local location to new server ID + remaining devices + server metadata
      setStoredLocations((prev) => {
        const cleaned = prev.filter((l) => l.localId === stableLocalId || l.id !== newServerId);
        return cleaned.map((l) =>
          l.localId === stableLocalId
            ? { ...l, id: newServerId, deviceIds: remainingDeviceIds, name: serverName, overcrowdingLimit: serverOvercrowding, isOnMap: serverOnMap, serverColor, latitude: serverLat, longitude: serverLng }
            : l
        );
      });

      // Update count for the new server ID + clean up old count
      if (serverCount !== null) {
        setLocationCounts((prev) => {
          const next = { ...prev };
          delete next[loc.id]; // Remove old server ID entry
          next[newServerId] = serverCount;
          return next;
        });
      }

      // Remove device from app — counter is fully gone
      if (device) removeDevice(device.id);
      return newServerId;
    } catch (err) {
      console.error("Failed to sync location change to server:", err);
      // Still remove device locally even if server sync failed
      if (device) removeDevice(device.id);
      return loc.id;
    }
  }, [removeDevice]);

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
      const loc = storedLocationsRef.current.find((l) => l.id === id);
      if (loc) {
        const locCreds = api.getLocationCredentials(loc, devicesRef.current);
        if (locCreds) {
          api.updateLocation(id, locCreds.credentials, locCreds.signingDevice, { overcrowdingLimit: normalizedLimit })
            .catch((err) => console.error("Failed to update overcrowding limit on server:", err));
        }
      }
    },
    []
  );

  // Adopt an auto-location for a device: rename it, mark isAuto: false
  const adoptAutoLocation = useCallback(
    async (serverDeviceId: string, password: string, locationName: string, colorName: LocationColorName = "blue"): Promise<string | null> => {
      const autoLoc = storedLocationsRef.current.find(
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
        // Await the rename so the server has the correct name before the user proceeds
        await api.updateLocation(autoLoc.id, creds, signingDevice, { name: locationName })
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
          const serverLocId = serverAutoLoc.location_id;
          const serverDeviceIds = serverAutoLoc.devices.map((d) => d.device_id);
          setStoredLocations((prev) => {
            const existingIdx = prev.findIndex((l) => l.id === serverLocId);
            if (existingIdx >= 0) {
              return prev.map((l) =>
                l.id === serverLocId
                  ? { ...l, name: locationName, isAuto: false, colorName, deviceIds: serverDeviceIds }
                  : l
              );
            }
            return [
              ...prev,
              {
                id: serverLocId,
                localId: generateLocalId(),
                name: locationName,
                deviceIds: serverDeviceIds,
                overcrowdingLimit: serverAutoLoc.overcrowding_limit,
                colorName,
                isAuto: false,
                isOnMap: serverAutoLoc.on_map,
                serverColor: serverAutoLoc.location_color ?? null,
                latitude: serverAutoLoc.location_latitude ?? null,
                longitude: serverAutoLoc.location_longitude ?? null,
              },
            ];
          });
          const signingDevice = { deviceId: serverDeviceId, password };
          const creds = [{ device_id: serverDeviceId, password }];
          await api.updateLocation(serverLocId, creds, signingDevice, { name: locationName })
            .catch((err) => console.error("Failed to rename adopted location:", err));
          return serverLocId;
        }

        // No auto-location exists — create a new location
        // (createLocation returns existing ID if same device set exists, but does NOT update name)
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
            serverColor: null,
            latitude: null,
            longitude: null,
          },
        ]);
        // Always push name to server (createLocation may have returned an existing location
        // whose name differs from what the user entered)
        await api.updateLocation(locationId, creds, signingDevice, { name: locationName })
          .catch((err) => console.error("Failed to set location name on server:", err));
        return locationId;
      } catch (err) {
        console.error("Failed to adopt/create location:", err);
        return null;
      }
    },
    []
  );

  const getLocation = useCallback(
    (id: string) => locations.find((l) => l.id === id || l.localId === id),
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
        addCounterToLocation,
        removeDeviceFromLocation,
        setLocationOvercrowdingLimit,
        getLocation,
        getLocationForDevice,
        getUngroupedDeviceIds,
        adoptAutoLocation,
        refreshAllLocations,
        refreshLocation,
        hasConnectionError,
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
