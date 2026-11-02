import { describe, expect, it, vi, beforeEach } from "vitest";

// In-memory fake Firestore state for SOS delivery tests
type SnapshotCallback = (snap: {
  forEach: (fn: (d: { id: string; data: () => Record<string, unknown> }) => void) => void;
}) => void;
type ErrorCallback = (err: Error) => void;

let snapshotListeners: Array<{
  onNext: SnapshotCallback;
  onError?: ErrorCallback | undefined;
}> = [];

let mockDb: { fake: boolean } | null = { fake: true };

vi.mock("@/lib/firebase/config", () => ({
  get db() {
    return mockDb;
  },
  auth: null,
}));

vi.mock("firebase/firestore", () => {
  return {
    collection: (_db: unknown, name: string) => ({ path: name }),
    doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join("/") }),
    onSnapshot: (_ref: unknown, onNext: SnapshotCallback, onError?: ErrorCallback) => {
      const listener: { onNext: SnapshotCallback; onError?: ErrorCallback | undefined } = {
        onNext,
        onError,
      };
      snapshotListeners.push(listener);
      return () => {
        snapshotListeners = snapshotListeners.filter((l) => l !== listener);
      };
    },
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn(),
    getDocFromServer: vi.fn(),
  };
});

import { subscribeToAllSosRequests } from "../firebase/firestore";
import type { SosRequest } from "../firebase/types";
import { formatSosTimeAgo, formatSosAbsolute, formatSosFull } from "../date-utils";

describe("Admin SOS Real-Time Delivery & Timestamp Handling", () => {
  beforeEach(() => {
    snapshotListeners = [];
    mockDb = { fake: true };
  });

  it("subscribes to all SOS requests and delivers documents in real time", () => {
    const received: Array<unknown> = [];
    const unsubscribe = subscribeToAllSosRequests((requests) => {
      received.push(requests);
    });

    expect(snapshotListeners.length).toBe(1);

    // Simulate Firestore sending a snapshot with 2 SOS documents
    const doc1 = {
      id: "sos-1",
      data: () => ({
        userId: "user-1",
        userName: "Citizen 1",
        status: "active",
        createdAt: "2026-10-24T01:00:00.000Z",
        updatedAt: "2026-10-24T01:00:00.000Z",
        location: { source: "manual", address: "Dhanmondi Road 27" },
      }),
    };
    const doc2 = {
      id: "sos-2",
      data: () => ({
        userId: "user-2",
        userName: "Citizen 2",
        status: "active",
        createdAt: "2026-10-24T01:15:00.000Z",
        updatedAt: "2026-10-24T01:15:00.000Z",
        location: { source: "gps", address: "Gulshan 2", lat: 23.79, lng: 90.41 },
      }),
    };

    snapshotListeners[0]!.onNext({
      forEach: (fn) => [doc1, doc2].forEach(fn),
    });

    expect(received.length).toBe(1);
    const firstDelivery = received[0] as Array<{ id: string; createdAt: string; userName: string }>;
    expect(firstDelivery.length).toBe(2);

    // Verifies sorting descending by createdAt (doc2 at 01:15 is first, doc1 at 01:00 is second)
    expect(firstDelivery[0]!.id).toBe("sos-2");
    expect(firstDelivery[1]!.id).toBe("sos-1");

    unsubscribe();
    expect(snapshotListeners.length).toBe(0);
  });

  it("normalizes Firestore Timestamp objects with toDate() safely", () => {
    let delivered: SosRequest[] = [];
    subscribeToAllSosRequests((requests) => {
      delivered = requests;
    });

    const firestoreTimestampDoc = {
      id: "sos-ts",
      data: () => ({
        userId: "user-3",
        userName: "Citizen 3",
        status: "active",
        // Firestore Timestamp object mock
        createdAt: {
          toDate: () => new Date("2026-10-24T01:20:00.000Z"),
        },
        location: { source: "manual", address: "Uttara Sector 3" },
      }),
    };

    snapshotListeners[0]!.onNext({
      forEach: (fn) => [firestoreTimestampDoc].forEach(fn),
    });

    expect(delivered.length).toBe(1);
    expect(delivered[0]!.id).toBe("sos-ts");
    expect(delivered[0]!.createdAt).toBe("2026-10-24T01:20:00.000Z");
  });

  it("invokes onError handler and cleans up on subscription errors", () => {
    const errorLog: Error[] = [];
    const unsubscribe = subscribeToAllSosRequests(
      () => {},
      (err) => errorLog.push(err),
    );

    const testError = new Error("permission-denied");
    (testError as unknown as { code: string }).code = "permission-denied";

    snapshotListeners[0]!.onError!(testError);

    expect(errorLog.length).toBe(1);
    expect(errorLog[0]!.message).toBe("permission-denied");

    unsubscribe();
  });

  it("invokes onError if database connection is unavailable", () => {
    mockDb = null;
    const errorLog: Error[] = [];
    const unsubscribe = subscribeToAllSosRequests(
      () => {},
      (err) => errorLog.push(err),
    );

    expect(errorLog.length).toBe(1);
    expect(errorLog[0]!.message).toContain("Firestore is not initialized");
    unsubscribe();
  });

  it("formats timestamps consistently for Admin UI without crashing", () => {
    const iso = "2026-10-24T01:00:00.000Z";
    const now = new Date("2026-10-24T01:05:00.000Z").getTime();

    expect(formatSosTimeAgo(iso, now)).toBe("5m ago");
    expect(typeof formatSosAbsolute(iso)).toBe("string");
    expect(typeof formatSosFull(iso)).toBe("string");

    // Missing or invalid timestamps return safe strings
    expect(formatSosTimeAgo(null)).toBe("Time not recorded");
    expect(formatSosTimeAgo(undefined)).toBe("Time not recorded");
    expect(formatSosTimeAgo("invalid-date")).toBe("Time unavailable");
  });
});
