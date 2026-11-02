/**
 * Date and Timestamp Utilities for RescueLink.
 * Safely handles ISO strings, Firestore Timestamp objects, missing/invalid dates,
 * and clock skew without crashing or throwing errors.
 */

/**
 * Normalizes any date/timestamp representation into a clean ISO 8601 string.
 * Gracefully handles ISO strings, Date instances, Firestore Timestamp objects
 * ({ toDate, seconds, _seconds }), and returns "" for invalid or missing values.
 */
export function parseSosTimestamp(raw: unknown): string {
  if (!raw) return "";

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    return trimmed;
  }

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? "" : raw.toISOString();
  }

  if (typeof raw === "object" && raw !== null) {
    // Firestore Timestamp with .toDate()
    if ("toDate" in raw && typeof (raw as { toDate: () => unknown }).toDate === "function") {
      try {
        const d = (raw as { toDate: () => unknown }).toDate();
        if (d instanceof Date && !Number.isNaN(d.getTime())) {
          return d.toISOString();
        }
      } catch {
        // fall through to other representations
      }
    }

    // Object with numeric seconds (e.g. Firestore Timestamp or Unix timestamp)
    if ("seconds" in raw && typeof (raw as { seconds: unknown }).seconds === "number") {
      const d = new Date((raw as { seconds: number }).seconds * 1000);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }

    // Object with _seconds (internal Firestore Timestamp serialization)
    if ("_seconds" in raw && typeof (raw as { _seconds: unknown })._seconds === "number") {
      const d = new Date((raw as { _seconds: number })._seconds * 1000);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
  }

  return "";
}

/**
 * Returns a concise human-friendly relative time string (e.g. "just now", "5m ago", "2h 10m ago", "Yesterday").
 * Handles clock skew safely if the client device clock is slightly behind.
 */
export function formatSosTimeAgo(raw: unknown, now: number = Date.now()): string {
  const iso = parseSosTimestamp(raw);
  if (!iso) return "Time not recorded";

  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Time unavailable";

  const diffMs = now - t;
  // If timestamp is slightly in the future due to minor client clock skew (< 2 mins)
  if (diffMs < 0) {
    if (Math.abs(diffMs) < 120_000) return "just now";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    const remMins = mins % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
  }
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Returns a 12-hour formatted time (e.g. "02:15 PM").
 */
export function formatSosAbsolute(raw: unknown): string {
  const iso = parseSosTimestamp(raw);
  if (!iso) return "Time unavailable";

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time unavailable";

  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Returns a complete localized date and time string (e.g. "Oct 24, 02:15 AM").
 */
export function formatSosFull(raw: unknown): string {
  const iso = parseSosTimestamp(raw);
  if (!iso) return "Time unavailable";

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time unavailable";

  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
