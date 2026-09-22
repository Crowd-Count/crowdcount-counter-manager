"use client";

import { useState, useEffect } from "react";
import { logWarn } from "@/lib/logger";

const STAGING_TOKEN =
  "eyJraWQiOiI3RlRSM1gzS1JKIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiI0NVQ1NlFCMlBZIiwiaWF0IjoxNzcxMjgzMjU3LCJvcmlnaW4iOiJjb3VudGVyLXN0YWdpbmcuY3Jvd2Rjb3VudC50ZWNoIn0.BcBjf_kgq-zkRgrNhN9ZvJQ1zyVawWLiVHkDZJEHr8rehzV8SGiPl4BgZoe3v-5hbHCWFvBCuPJr5l5o4yXuZA";

const PRODUCTION_TOKEN =
  "eyJraWQiOiI2OE4yQTQ4S1pTIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiI0NVQ1NlFCMlBZIiwiaWF0IjoxNzcxMjgzMjM1LCJvcmlnaW4iOiJjb3VudGVyLmNyb3dkY291bnQudGVjaCJ9.yxRsNA0ztx2Tdfu_rv0k1Fmx6a0dtF1Sr3Syhr_is6ypxxM_behaFRv3XOpMqYJO6SF1qS-i4WNivT7vparqCg";

function getMapKitToken(): string {
  const hostname = window.location.hostname;
  if (hostname === "counter.crowdcount.tech") return PRODUCTION_TOKEN;
  return STAGING_TOKEN;
}

// Singleton state — shared across all hook instances
let loadState: "idle" | "loading" | "ready" | "error" = "idle";
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const fn of listeners) fn();
}

function loadMapKit() {
  if (loadState !== "idle") return;

  // The demo loads MapKit like any other visit: the on-map card is part of
  // the product, and a seeded location with real coordinates has a real map
  // behind it. The token is origin-bound, so off its host (localhost, a
  // preview) init fails and MapBackground falls back to its gradient.
  loadState = "loading";

  const script = document.createElement("script");
  script.src = "https://cdn.apple-mapkit.com/mk/5.81.48/mapkit.js";
  script.integrity = "sha384-QZ+GFMeAuqDQZMwmBOrunYXSXKXJ14mhsZ/92WkRqjGzKzyJZCE9O23zqph5j0uT";
  script.crossOrigin = "anonymous";

  script.onload = () => {
    try {
      mapkit.init({
        authorizationCallback: (done) => {
          done(getMapKitToken());
        },
      });
      loadState = "ready";
    } catch (e) {
      logWarn("[MapKit] init failed:", e);
      loadState = "error";
    }
    notifyListeners();
  };

  script.onerror = (e) => {
    logWarn("[MapKit] Script failed to load:", e);
    loadState = "error";
    notifyListeners();
  };

  document.head.appendChild(script);
}

export function useMapKit(): { isReady: boolean; isUnavailable: boolean } {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);

    loadMapKit();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { isReady: loadState === "ready", isUnavailable: loadState === "error" };
}
