// RescueLink Background Weather Push Service Worker
// Standards-compliant W3C Service Worker for Push & Notification APIs
// Hardened with strict URL sanitization, same-origin enforcement, and bounded payload parsing.

const CACHE_NAME = "rescuelink-sw-v1";

/**
 * Validates and sanitizes destination URLs to prevent open-redirect and protocol execution attacks.
 * Strictly guarantees that opened windows remain on the application origin.
 */
function getSafeTargetUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return "/alerts";
  }
  const trimmed = rawUrl.trim();
  // Disallow protocol-relative URLs (//) and backslash confusion (\)
  if (trimmed.startsWith("//") || trimmed.includes("\\")) {
    return "/alerts";
  }
  try {
    const origin = self.location.origin;
    const resolved = new URL(trimmed, origin);
    // Strict same-origin validation: disallow javascript:, data:, or external origins
    if (resolved.origin !== origin) {
      return "/alerts";
    }
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return "/alerts";
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Handles incoming Web Push notifications from server-side background schedulers.
 */
self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
    if (!payload || typeof payload !== "object") {
      payload = {
        title: "RescueLink Emergency Alert",
        body: String(payload || ""),
        url: "/alerts",
      };
    }
  } catch (err) {
    payload = {
      title: "RescueLink Emergency Alert",
      body: typeof event.data.text === "function" ? event.data.text() : "New emergency advisory",
      url: "/alerts",
    };
  }

  // Sanitize and bound payload fields
  const title =
    typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.slice(0, 150)
      : "RescueLink Weather Advisory";
  const body =
    typeof payload.body === "string" && payload.body.trim().length > 0
      ? payload.body.slice(0, 500)
      : "A new meteorological advisory has been issued for your area.";
  const eventKey =
    typeof payload.eventKey === "string"
      ? payload.eventKey.slice(0, 128)
      : typeof payload.tag === "string"
        ? payload.tag.slice(0, 128)
        : "rescuelink-weather";
  const severity =
    payload.severity === "critical" || payload.severity === "warning" || payload.severity === "info"
      ? payload.severity
      : "warning";
  const safeUrl = getSafeTargetUrl(payload.url);

  const notificationOptions = {
    body: body,
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: eventKey, // Deterministic tag prevents stacking duplicate notifications for the same event
    renotify: payload.isUpdate === true,
    requireInteraction: severity === "critical",
    data: {
      url: safeUrl,
      eventKey: eventKey,
      category: typeof payload.category === "string" ? payload.category.slice(0, 50) : "weather",
      timestamp: typeof payload.timestamp === "number" ? payload.timestamp : Date.now(),
    },
  };

  event.waitUntil(self.registration.showNotification(title, notificationOptions));
});

/**
 * Handles user interaction when clicking an active push notification.
 * Disallows untrusted navigation and enforces safe internal routing.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const safeUrl = getSafeTargetUrl(event.notification.data?.url);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing open tab if available
      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname === safeUrl && "focus" in client) {
            return client.focus();
          }
        } catch {
          // ignore
        }
      }
      // Otherwise open a new window safely within application boundary
      if (self.clients.openWindow) {
        return self.clients.openWindow(safeUrl);
      }
    }),
  );
});
