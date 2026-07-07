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
import { encrypt, decrypt, isEncrypted } from "@/lib/secureStorage";
import { logError, logWarn } from "@/lib/logger";

interface LocationsContextType {
  locations: LocationState[];
  isLoading: boolean;
  addLocation: (name: string, colorName: LocationColorName, serverDeviceIds?: string[], passwordOverrides?: Record<string, string>) => Promise<string | null>;
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

async function loadLocationsFromStorage(): Promise<StoredLocation[]> {
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
    const parsed = JSON.parse(json) as StoredLocation[];
    // Migration check: if any location lacks isAuto field, it's old format — discard
    if (parsed.length > 0 && parsed[0].isAuto === undefined) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    // Backfill missing fields for locations from older versions
    for (const loc of parsed) {
      if (!loc.localId) {
        loc.localId = generateLocalId();
      }
      if (loc.serverColor === undefined) {
        loc.serverColor = null;
      }
      if (loc.latitude === undefined) {
        loc.latitude = null;
      }
      if (loc.longitude === undefined) {
        loc.longitude = null;
      }
    }
    // Don't write back here — next regular save will encrypt automatically
    return parsed;
  } catch {
    return [];
  }
}

async function saveLocationsToStorage(locations: StoredLocation[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const encrypted = await encrypt(JSON.stringify(locations));
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch {
    logWarn("Failed to encrypt location data — keeping in memory only");
  }
}

// Extract device IDs from server response — handles both tuple format ["id", "label"]
// and object format {device_id: "id", ...}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDeviceIds(devices: any[]): string[] {
  return devices.map((d) => (Array.isArray(d) ? d[0] : d.device_id));
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

function isSuperset<T>(superset: Set<T>, subset: Set<T>): boolean {
  return [...subset].every((x) => superset.has(x));
}

interface ReconciledLocation {
  serverId: string;
  name: string;
  overcrowdingLimit: number | null;
  isOnMap: boolean;
  serverColor: string | null;
  latitude: number | null;
  longitude: number | null;
  currentCount: number | null;
}

/**
 * Find or create a server location for a target device set.
 *
 * Looks up existing server locations via getLocationsForDevice, finds one
 * whose device set matches (exact match for on-map, superset for off-map),
 * and reuses it. If no match, creates a new location and fetches its metadata.
 *
 * Falls back to the supplied location's local values if the post-create
 * getLocation fetch fails.
 */
async function reconcileServerLocation(
  targetDeviceIds: string[],
  credentials: Array<{ device_id: string; password: string }>,
  signingDevice: { deviceId: string; password: string },
  fallbackLoc: StoredLocation,
  lookupDevice: { deviceId: string; password: string }
): Promise<ReconciledLocation> {
  const serverLocations = await api.getLocationsForDevice(lookupDevice.deviceId, lookupDevice.password);
  const targetSet = new Set(targetDeviceIds);

  const sharedLoc = serverLocations.find((sl) => {
    const serverSet = new Set(extractDeviceIds(sl.devices));
    return sl.on_map ? setsEqual(serverSet, targetSet) : isSuperset(serverSet, targetSet);
  });

  if (sharedLoc) {
    return {
      serverId: sharedLoc.location_id,
      name: sharedLoc.location_name ?? fallbackLoc.name,
      overcrowdingLimit: sharedLoc.overcrowding_limit,
      isOnMap: sharedLoc.on_map,
      serverColor: sharedLoc.location_color ?? fallbackLoc.serverColor,
      latitude: sharedLoc.location_latitude ?? fallbackLoc.latitude,
      longitude: sharedLoc.location_longitude ?? fallbackLoc.longitude,
      currentCount: sharedLoc.current_count,
    };
  }

  const newServerId = await api.createLocation(credentials, signingDevice, fallbackLoc.name, fallbackLoc.overcrowdingLimit);
  try {
    const serverLoc = await api.getLocation(newServerId, credentials, signingDevice);
    return {
      serverId: newServerId,
      name: serverLoc.location_name ?? fallbackLoc.name,
      overcrowdingLimit: serverLoc.overcrowding_limit,
      isOnMap: serverLoc.on_map,
      serverColor: serverLoc.location_color ?? fallbackLoc.serverColor,
      latitude: serverLoc.location_latitude ?? fallbackLoc.latitude,
      longitude: serverLoc.location_longitude ?? fallbackLoc.longitude,
      currentCount: serverLoc.current_count,
    };
  } catch {
    // Fall back to local values if fetch fails
    return {
      serverId: newServerId,
      name: fallbackLoc.name,
      overcrowdingLimit: fallbackLoc.overcrowdingLimit,
      isOnMap: fallbackLoc.isOnMap,
      serverColor: fallbackLoc.serverColor,
      latitude: fallbackLoc.latitude,
      longitude: fallbackLoc.longitude,
      currentCount: null,
    };
  }
}

export function LocationsProvider({ children }: { children: React.ReactNode }) {
  const { devices, addDevice, removeDevice, updateDeviceOnlineStatus } = useDevices();
  const [storedLocations, setStoredLocations] = useState<StoredLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Location counts from server polling: locationServerId → current_count
  const [locationCounts, setLocationCounts] = useState<Record<string, number>>({});
  // Incomplete on-map location warnings: local localId → total device count the server expects
  const [serverDeviceCounts, setServerDeviceCounts] = useState<Record<string, number>>({});
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const consecutiveFailuresRef = useRef(0);
  const lastIncompleteCheckRef = useRef(0);

  // Load locations from storage on mount
  useEffect(() => {
    loadLocationsFromStorage().then((stored) => {
      setStoredLocations(stored);
      setIsLoading(false);
    });
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
  const devicesRef = useRef(devices);
  useEffect(() => {
    storedLocationsRef.current = storedLocations;
    devicesRef.current = devices;
  });

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
        logError(`Failed to poll location ${loc.id}:`, err);
      });

    await Promise.all([locationPromise, ...connectionPromises]);
    return locationSuccess;
  }, [updateDeviceOnlineStatus]);

  // Check for incomplete on-map locations (like iOS checkForIncompleteOnMapLocations)
  // Uses getLocationsForDevice which returns the FULL device list from the server
  // Throttled to run at most once every 30 seconds
  const checkIncompleteLocations = useCallback(async () => {
    const now = Date.now();
    if (now - lastIncompleteCheckRef.current < 30000) return;
    lastIncompleteCheckRef.current = now;

    const currentDevices = devicesRef.current;
    const currentLocs = storedLocationsRef.current;
    if (currentDevices.length === 0 || currentLocs.length === 0) return;

    const localDeviceIds = new Set(currentDevices.map((d) => d.deviceId));
    const checkedServerLocs = new Set<string>();
    const newCounts: Record<string, number> = {};

    for (const device of currentDevices) {
      try {
        const serverLocations = await api.getLocationsForDevice(device.deviceId, device.password);
        for (const serverLoc of serverLocations) {
          if (!serverLoc.on_map || checkedServerLocs.has(serverLoc.location_id)) continue;
          checkedServerLocs.add(serverLoc.location_id);

          const serverDeviceIds = extractDeviceIds(serverLoc.devices);
          const missingCount = serverDeviceIds.filter((id) => !localDeviceIds.has(id)).length;
          if (missingCount > 0) {
            const localLoc = currentLocs.find((l) =>
              !l.isAuto && l.deviceIds.some((did) => serverDeviceIds.includes(did))
            );
            if (localLoc) {
              newCounts[localLoc.localId] = serverDeviceIds.length;
            }
          }
        }
      } catch {
        // Ignore failures for individual devices
      }
    }

    setServerDeviceCounts(newCounts);
  }, []);

  // Poll all non-auto locations (for backwards compatibility and migration from device first to location first) 
  // TODO: remove "non auto" logic soon, doesnt impact anything though just some bloat
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
      // Check for incomplete on-map locations (throttled internally)
      checkIncompleteLocations();
    } else {
      consecutiveFailuresRef.current += 1;
      // Only show error after 2 consecutive failures (~5s) AND a healthcheck confirms server is down
      if (consecutiveFailuresRef.current >= 2) {
        const serverUp = await api.pingServer();
        setHasConnectionError(!serverUp);
      }
    }
  }, [fetchLocationData, checkIncompleteLocations]);

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
      const serverDeviceCount = loc.localId in serverDeviceCounts ? serverDeviceCounts[loc.localId] : null;
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
    async (name: string, colorName: LocationColorName, serverDeviceIds: string[] = [], passwordOverrides?: Record<string, string>): Promise<string | null> => {
      // Build credentials from the devices matching these server device IDs
      const currentDevices = devicesRef.current;
      const creds: Array<{ device_id: string; password: string }> = [];
      for (const sid of serverDeviceIds) {
        const device = currentDevices.find((d) => d.deviceId === sid);
        if (device) {
          creds.push({ device_id: device.deviceId, password: device.password });
        } else if (passwordOverrides?.[sid]) {
          // Device was just added and state hasn't flushed yet — use the provided password
          creds.push({ device_id: sid, password: passwordOverrides[sid] });
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
        logError("Failed to create location on server:", error);
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

      // 1. Update localStorage BEFORE React state updates
      //    (React state may not flush before navigation)
      const remainingLocs = currentLocs.filter((l) => l.localId !== loc.localId);
      if (remainingLocs.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        await saveLocationsToStorage(remainingLocs);
      }

      // 2. Remove devices from localStorage too
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
          () => {} // On encryption failure, skip write — data stays in memory only
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
          .catch((err) => logError("Failed to update location name on server:", err));
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

        // 4. Build credentials (use devicesRef + new password for the new device since
        //    state may not have flushed yet from addDevice above)
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

        // 5. Reconcile with server: find matching server location or create one
        const reconciled = await reconcileServerLocation(
          combinedDeviceIds,
          creds,
          signingDevice,
          loc,
          { deviceId: newDeviceId, password }
        );

        // 6. Update target location (by localId) with new server ID + server metadata.
        //    Also filter out any other entries with the same new server ID (dedup)
        //    AND remove standalone auto-locations for the new device in the same pass.
        setStoredLocations((prev) => {
          const cleaned = prev.filter((l) =>
            l.localId === stableLocalId ||
            (l.id !== reconciled.serverId &&
              !(l.deviceIds.length === 1 && l.deviceIds[0] === newDeviceId))
          );
          return cleaned.map((l) =>
            l.localId === stableLocalId
              ? {
                  ...l,
                  id: reconciled.serverId,
                  deviceIds: combinedDeviceIds,
                  isAuto: false,
                  name: reconciled.name,
                  overcrowdingLimit: reconciled.overcrowdingLimit,
                  isOnMap: reconciled.isOnMap,
                  serverColor: reconciled.serverColor,
                  latitude: reconciled.latitude,
                  longitude: reconciled.longitude,
                }
              : l
          );
        });

        return { success: true };
      } catch (err) {
        logError("addCounterToLocation server sync failed:", err);
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
      // Reconcile with server: find matching server location or create one
      const reconciled = await reconcileServerLocation(
        remainingDeviceIds,
        creds,
        signingDevice,
        loc,
        { deviceId: creds[0].device_id, password: creds[0].password }
      );

      // Swap local location to new server ID + remaining devices + server metadata
      setStoredLocations((prev) => {
        const cleaned = prev.filter((l) => l.localId === stableLocalId || l.id !== reconciled.serverId);
        return cleaned.map((l) =>
          l.localId === stableLocalId
            ? {
                ...l,
                id: reconciled.serverId,
                deviceIds: remainingDeviceIds,
                name: reconciled.name,
                overcrowdingLimit: reconciled.overcrowdingLimit,
                isOnMap: reconciled.isOnMap,
                serverColor: reconciled.serverColor,
                latitude: reconciled.latitude,
                longitude: reconciled.longitude,
              }
            : l
        );
      });

      // Update count for the new server ID + clean up old count
      if (reconciled.currentCount !== null) {
        const newCount = reconciled.currentCount;
        setLocationCounts((prev) => {
          const next = { ...prev };
          delete next[loc.id]; // Remove old server ID entry
          next[reconciled.serverId] = newCount;
          return next;
        });
      }

      // Remove device from app — counter is fully gone
      if (device) removeDevice(device.id);
      return reconciled.serverId;
    } catch (err) {
      logError("Failed to sync location change to server:", err);
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
            .catch((err) => logError("Failed to update overcrowding limit on server:", err));
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
          .catch((err) => logError("Failed to rename adopted location:", err));
        return autoLoc.id;
      }

      // No auto-location found yet — fetch from server
      try {
        const serverLocations = await api.getLocationsForDevice(serverDeviceId, password);
        const serverAutoLoc = serverLocations.find(
          (sl) => sl.is_auto && extractDeviceIds(sl.devices).includes(serverDeviceId)
        );

        if (serverAutoLoc) {
          const serverLocId = serverAutoLoc.location_id;
          const serverDeviceIds = extractDeviceIds(serverAutoLoc.devices);
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
            .catch((err) => logError("Failed to rename adopted location:", err));
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
          .catch((err) => logError("Failed to set location name on server:", err));
        return locationId;
      } catch (err) {
        logError("Failed to adopt/create location:", err);
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
