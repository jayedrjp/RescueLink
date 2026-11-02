import { Capacitor } from "@capacitor/core";
import { Geolocation, type Position } from "@capacitor/geolocation";

export interface DeviceCoordinates {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface LocationPermissionState {
  granted: boolean;
  canAskAgain: boolean;
  status: "granted" | "denied" | "prompt" | "unsupported";
}

export interface PositionRequestOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export class DeviceLocationError extends Error {
  readonly code: number;
  static readonly PERMISSION_DENIED = 1;
  static readonly POSITION_UNAVAILABLE = 2;
  static readonly TIMEOUT = 3;

  constructor(code: number, message: string) {
    super(message);
    this.name = "DeviceLocationError";
    this.code = code;
  }
}

/**
 * Checks current location permission status without prompting.
 */
export async function checkLocationPermission(): Promise<LocationPermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Geolocation.checkPermissions();
      const granted = status.location === "granted" || status.coarseLocation === "granted";
      const denied = status.location === "denied" && status.coarseLocation === "denied";

      return {
        granted,
        canAskAgain: !denied,
        status: granted ? "granted" : denied ? "denied" : "prompt",
      };
    } catch (err) {
      console.warn("[RescueLink Location] Could not check native permissions:", err);
      return { granted: false, canAskAgain: true, status: "prompt" };
    }
  }

  // Web fallback
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    return { granted: false, canAskAgain: false, status: "unsupported" };
  }

  if ("permissions" in navigator && navigator.permissions?.query) {
    try {
      const res = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      return {
        granted: res.state === "granted",
        canAskAgain: res.state !== "denied",
        status: res.state === "granted" ? "granted" : res.state === "denied" ? "denied" : "prompt",
      };
    } catch {
      // Ignore query errors in browsers that don't support geolocation permission query
    }
  }

  return { granted: false, canAskAgain: true, status: "prompt" };
}

/**
 * Requests location permission from the operating system / browser.
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Geolocation.requestPermissions({
        permissions: ["location", "coarseLocation"],
      });
      return status.location === "granted" || status.coarseLocation === "granted";
    } catch (err) {
      console.warn("[RescueLink Location] Native permission request failed:", err);
      return false;
    }
  }

  // Web fallback: trigger prompt via a one-time position call
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      resolve(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  });
}

/**
 * Retrieves the current device position, prompting for permissions if required.
 */
export async function getCurrentDevicePosition(
  options: PositionRequestOptions = {},
): Promise<DeviceCoordinates> {
  const enableHighAccuracy = options.enableHighAccuracy ?? true;
  const timeout = options.timeout ?? 15000;
  const maximumAge = options.maximumAge ?? 10000;

  if (Capacitor.isNativePlatform()) {
    try {
      // Verify or request permission first
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        const requested = await Geolocation.requestPermissions({
          permissions: ["location", "coarseLocation"],
        });
        if (requested.location !== "granted" && requested.coarseLocation !== "granted") {
          throw new DeviceLocationError(
            DeviceLocationError.PERMISSION_DENIED,
            "Location permission was denied by the user.",
          );
        }
      }

      const pos: Position = await Geolocation.getCurrentPosition({
        enableHighAccuracy,
        timeout,
        maximumAge,
      });

      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch (err: unknown) {
      if (err instanceof DeviceLocationError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission")) {
        throw new DeviceLocationError(
          DeviceLocationError.PERMISSION_DENIED,
          "Location permission denied.",
        );
      }
      if (msg.toLowerCase().includes("timeout")) {
        throw new DeviceLocationError(
          DeviceLocationError.TIMEOUT,
          "Location request timed out. Please verify GPS is enabled.",
        );
      }
      throw new DeviceLocationError(
        DeviceLocationError.POSITION_UNAVAILABLE,
        "GPS position unavailable. Please enable device location services.",
      );
    }
  }

  // Web fallback using navigator.geolocation
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(
        new DeviceLocationError(
          DeviceLocationError.POSITION_UNAVAILABLE,
          "Geolocation is not supported in this environment.",
        ),
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        let code = DeviceLocationError.POSITION_UNAVAILABLE;
        if (err.code === err.PERMISSION_DENIED) code = DeviceLocationError.PERMISSION_DENIED;
        else if (err.code === err.TIMEOUT) code = DeviceLocationError.TIMEOUT;
        reject(new DeviceLocationError(code, err.message || "Failed to retrieve location."));
      },
      { enableHighAccuracy, timeout, maximumAge },
    );
  });
}

/**
 * Starts watching device position continuously.
 * Returns an unsubscribe / cleanup function.
 */
export function watchDevicePosition(
  onSuccess: (coords: DeviceCoordinates) => void,
  onError: (err: DeviceLocationError) => void,
  options: PositionRequestOptions = {},
): () => void {
  const enableHighAccuracy = options.enableHighAccuracy ?? true;
  const timeout = options.timeout ?? 20000;
  const maximumAge = options.maximumAge ?? 5000;

  if (Capacitor.isNativePlatform()) {
    let watchId: string | null = null;
    let isCancelled = false;

    // Check & request permissions, then start watcher
    (async () => {
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
          const req = await Geolocation.requestPermissions({
            permissions: ["location", "coarseLocation"],
          });
          if (req.location !== "granted" && req.coarseLocation !== "granted") {
            if (!isCancelled) {
              onError(
                new DeviceLocationError(
                  DeviceLocationError.PERMISSION_DENIED,
                  "Location permission was denied.",
                ),
              );
            }
            return;
          }
        }

        if (isCancelled) return;

        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy, timeout, maximumAge },
          (pos, err) => {
            if (isCancelled) return;
            if (err) {
              const msg = err.message || "";
              const code = msg.toLowerCase().includes("denied")
                ? DeviceLocationError.PERMISSION_DENIED
                : DeviceLocationError.POSITION_UNAVAILABLE;
              onError(new DeviceLocationError(code, msg || "Location watch error."));
              return;
            }
            if (pos) {
              onSuccess({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            }
          },
        );
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          const code = msg.toLowerCase().includes("denied")
            ? DeviceLocationError.PERMISSION_DENIED
            : DeviceLocationError.POSITION_UNAVAILABLE;
          onError(new DeviceLocationError(code, msg || "Unable to start GPS watcher."));
        }
      }
    })();

    return () => {
      isCancelled = true;
      if (watchId) {
        Geolocation.clearWatch({ id: watchId }).catch(() => {});
      }
    };
  }

  // Web fallback using navigator.geolocation.watchPosition
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    onError(
      new DeviceLocationError(
        DeviceLocationError.POSITION_UNAVAILABLE,
        "Geolocation is not supported in this browser.",
      ),
    );
    return () => {};
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onSuccess({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    },
    (err) => {
      let code = DeviceLocationError.POSITION_UNAVAILABLE;
      if (err.code === err.PERMISSION_DENIED) code = DeviceLocationError.PERMISSION_DENIED;
      else if (err.code === err.TIMEOUT) code = DeviceLocationError.TIMEOUT;
      onError(new DeviceLocationError(code, err.message || "GPS error"));
    },
    { enableHighAccuracy, timeout, maximumAge },
  );

  return () => {
    navigator.geolocation.clearWatch(id);
  };
}
