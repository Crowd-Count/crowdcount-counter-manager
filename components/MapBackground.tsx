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

    const map = new mapkit.Map(containerRef.current, {
      center: new mapkit.Coordinate(latitude, longitude),
      region: new mapkit.CoordinateRegion(
        new mapkit.Coordinate(latitude, longitude),
        new mapkit.CoordinateSpan(0.01, 0.01)
      ),
      mapType: mapkit.MapType.MutedStandard,
      colorScheme:
        theme === "dark" ? mapkit.ColorScheme.Dark : mapkit.ColorScheme.Light,
      isScrollEnabled: false,
      isZoomEnabled: false,
      isRotationEnabled: false,
      showsCompass: "hidden",
      showsMapTypeControl: false,
      showsZoomControl: false,
      showsScale: "hidden",
    });

    mapRef.current = map;

    return () => {
      map.destroy();
      mapRef.current = null;
    };
    // Only recreate if coordinates change or MapKit becomes ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, latitude, longitude]);

  // Update color scheme in-place when theme changes (no map recreation)
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.colorScheme =
        theme === "dark" ? mapkit.ColorScheme.Dark : mapkit.ColorScheme.Light;
    }
  }, [theme]);

  if (!isReady) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0"
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    />
  );
});
