import { db, auth } from "@/lib/firebase/config";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

export const PUSH_PREFERENCES_KEY = "rl_push_preferences_v1";

export interface PushPreferences {
  enabled: boolean;
  weatherAlerts: boolean;
  severeWeatherOnly: boolean;
  civilDefenseAlerts: boolean;
  lastUpdated: number;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionData {
  id: string;
  userId?: string | undefined;
  endpoint: string;
  keys: PushSubscriptionKeys;
  topics: string[];
  enabled: boolean;
  locationName?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export type PushPermissionState = "granted" | "denied" | "prompt" | "unsupported";

export interface PushSubscriptionResult {
  success: boolean;
  reason?:
    "permission_denied" | "unsupported" | "vapid_key_missing" | "registration_failed" | undefined;
  message?: string | undefined;
  subscription?: PushSubscriptionData | undefined;
}

/**
 * Safely derives a deterministic document ID for a Web Push endpoint.
 * Ensures the result is alphanumeric, collision-resistant, and bounded to safe Firestore ID limits.
 */
export function deriveSubscriptionId(endpoint: string): string {
  if (typeof endpoint !== "string" || !endpoint) {
    return "sub_invalid";
  }
  let hash1 = 5381;
  let hash2 = 52711;
  for (let i = 0; i < endpoint.length; i++) {
    const char = endpoint.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 5) + hash2) ^ char;
  }
  const h1 = Math.abs(hash1).toString(36);
  const h2 = Math.abs(hash2).toString(36);
  const cleanTail = endpoint.replace(/[^a-zA-Z0-9]/g, "").slice(-20);
  return `sub_${h1}${h2}_${cleanTail}`.slice(0, 48);
}

/**
 * Utility to convert URL-safe base64 VAPID public key into Uint8Array for PushManager
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks whether the current runtime environment supports standard W3C Web Push & Service Workers.
 */
export function isPushNotificationSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Returns current browser notification permission state.
 */
export function getPushPermissionState(): PushPermissionState {
  if (!isPushNotificationSupported()) return "unsupported";
  return Notification.permission as PushPermissionState;
}

/**
 * Loads user push notification preferences from local storage.
 */
export function getPushPreferences(): PushPreferences {
  const defaultPrefs: PushPreferences = {
    enabled: false,
    weatherAlerts: true,
    severeWeatherOnly: true,
    civilDefenseAlerts: true,
    lastUpdated: Date.now(),
  };

  if (typeof window === "undefined") return defaultPrefs;

  try {
    const raw = localStorage.getItem(PUSH_PREFERENCES_KEY);
    if (!raw) return defaultPrefs;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultPrefs.enabled,
      weatherAlerts:
        typeof parsed.weatherAlerts === "boolean"
          ? parsed.weatherAlerts
          : defaultPrefs.weatherAlerts,
      severeWeatherOnly:
        typeof parsed.severeWeatherOnly === "boolean"
          ? parsed.severeWeatherOnly
          : defaultPrefs.severeWeatherOnly,
      civilDefenseAlerts:
        typeof parsed.civilDefenseAlerts === "boolean"
          ? parsed.civilDefenseAlerts
          : defaultPrefs.civilDefenseAlerts,
      lastUpdated: typeof parsed.lastUpdated === "number" ? parsed.lastUpdated : Date.now(),
    };
  } catch {
    return defaultPrefs;
  }
}

/**
 * Persists updated push preferences.
 */
export function savePushPreferences(updates: Partial<PushPreferences>): PushPreferences {
  const current = getPushPreferences();
  const updated: PushPreferences = {
    ...current,
    ...updates,
    lastUpdated: Date.now(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(PUSH_PREFERENCES_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  return updated;
}

/**
 * Registers the background push Service Worker ('/sw.js').
 */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushNotificationSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.warn("[RescueLink Push] Service Worker registration failed:", err);
    return null;
  }
}

/**
 * Subscribes user to Web Push notifications after an explicit user interaction.
 *
 * Grounding details:
 * 1. Checks browser support and requests Notification permission.
 * 2. If VAPID public key (VITE_VAPID_PUBLIC_KEY) is not provided, reports transparent status.
 * 3. Associates subscription with current authenticated user in Firestore if available.
 */
export async function subscribeToPushNotifications(options?: {
  locationName?: string | undefined;
}): Promise<PushSubscriptionResult> {
  if (!isPushNotificationSupported()) {
    return {
      success: false,
      reason: "unsupported",
      message: "Web Push notifications are not supported by this browser.",
    };
  }

  // 1. Request permission
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (err) {
    return {
      success: false,
      reason: "permission_denied",
      message: "Failed to request browser notification permission.",
    };
  }

  if (permission !== "granted") {
    savePushPreferences({ enabled: false });
    return {
      success: false,
      reason: "permission_denied",
      message: "Notification permission was not granted by the user.",
    };
  }

  // 2. Register Service Worker
  const registration = await registerPushServiceWorker();
  if (!registration) {
    return {
      success: false,
      reason: "registration_failed",
      message: "Could not initialize background service worker.",
    };
  }

  // 3. Resolve VAPID Public Key
  const vapidPublicKey = import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string | undefined;
  if (!vapidPublicKey || vapidPublicKey.trim().length === 0) {
    // Permission was granted, but backend VAPID credentials are not configured yet
    savePushPreferences({ enabled: true });
    return {
      success: false,
      reason: "vapid_key_missing",
      message:
        "Browser notification permission is active. Background server push requires VITE_VAPID_PUBLIC_KEY configuration.",
    };
  }

  // 4. Subscribe via PushManager
  try {
    const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      });
    }

    const rawJson = subscription.toJSON();
    const p256dh = rawJson.keys?.["p256dh"] || "";
    const authKey = rawJson.keys?.["auth"] || "";

    if (!subscription.endpoint || !subscription.endpoint.startsWith("https://")) {
      return {
        success: false,
        reason: "registration_failed",
        message: "Push subscription endpoint must use secure HTTPS protocol.",
      };
    }

    const subId = deriveSubscriptionId(subscription.endpoint);
    const nowIso = new Date().toISOString();

    const record: PushSubscriptionData = {
      id: subId,
      userId: auth?.currentUser?.uid,
      endpoint: subscription.endpoint,
      keys: { p256dh, auth: authKey },
      topics: ["weather", "emergency"],
      enabled: true,
      locationName: (options?.locationName || "Bangladesh").slice(0, 100),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // 5. Store subscription in Firestore if database is connected and user authenticated
    if (db && auth?.currentUser) {
      try {
        const subDocRef = doc(db, "push_subscriptions", subId);
        await setDoc(
          subDocRef,
          {
            ...record,
            userId: auth.currentUser.uid,
            serverTimestamp: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (dbErr) {
        console.warn("[RescueLink Push] Could not sync subscription to Firestore:", dbErr);
      }
    }

    savePushPreferences({ enabled: true });

    return {
      success: true,
      subscription: record,
    };
  } catch (err) {
    console.error("[RescueLink Push] PushManager subscription failed:", err);
    return {
      success: false,
      reason: "registration_failed",
      message:
        err instanceof Error ? err.message : "Failed to subscribe to push notification service.",
    };
  }
}

/**
 * Unsubscribes current client from PushManager and disables preferences.
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  savePushPreferences({ enabled: false });

  if (!isPushNotificationSupported()) return true;

  try {
    const sw = navigator.serviceWorker;
    if (!sw) return true;

    const registration = sw.ready ? await sw.ready : null;
    const subscription = registration?.pushManager
      ? await registration.pushManager.getSubscription()
      : null;

    if (subscription) {
      const subId = deriveSubscriptionId(subscription.endpoint);

      // Attempt to remove from Firestore if authenticated
      if (db && auth?.currentUser) {
        try {
          await deleteDoc(doc(db, "push_subscriptions", subId));
        } catch {
          // ignore
        }
      }

      await subscription.unsubscribe();
    }

    return true;
  } catch (err) {
    console.warn("[RescueLink Push] Unsubscribe failed:", err);
    return false;
  }
}
