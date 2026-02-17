"use client";

import { memo, useRef, useEffect } from "react";
import { useMapKit } from "@/hooks/useMapKit";
import { useTheme } from "@/contexts/ThemeContext";

interface MapBackgroundProps {
  latitude: number;
  longitude: number;
}

export const MapBackground = memo(function MapBackground({
  latitude,
  longitude,
}: MapBackgroundProps) {
  const { isReady } = useMapKit();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapkit.Map | null>(null);

  // Create / destroy map
  useEffect(() => {
    if (!isReady || !containerRef.current) return;

    try {
      const map = new mapkit.Map(containerRef.current, {
        center: new mapkit.Coordinate(latitude, longitude),
        region: new mapkit.CoordinateRegion(
          new mapkit.Coordinate(latitude, longitude),
          new mapkit.CoordinateSpan(0.01, 0.01)
        ),
        mapType: mapkit.Map.MapTypes.MutedStandard,
        colorScheme:
          theme === "dark" ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light,
        isScrollEnabled: false,
        isZoomEnabled: false,
        isRotationEnabled: false,
        showsCompass: mapkit.FeatureVisibility.Hidden,
        showsMapTypeControl: false,
        showsZoomControl: false,
        showsScale: mapkit.FeatureVisibility.Hidden,
      });

      mapRef.current = map;

      return () => {
        map.destroy();
        mapRef.current = null;
      };
    } catch (e) {
      console.warn("[MapBackground] Failed to create map:", e);
    }
    // Only recreate if coordinates change or MapKit becomes ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, latitude, longitude]);

  // Update color scheme in-place when theme changes (no map recreation)
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.colorScheme =
        theme === "dark" ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light;
    }
  }, [theme]);

  if (!isReady) return null;

  return (
    <div
      ref={containerRef}
      className="absolute left-0 right-0 z-0"
      style={{ pointerEvents: "none", top: "-40%", height: "180%" }}
      aria-hidden="true"
    />
  );
});
