// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------- hoisted mock state ----------
const h = vi.hoisted(() => {
  class SosError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    SosError,
    createSosRequest: vi.fn(),
    getSosRequestOnce: vi.fn(),
    cancelSosRequest: vi.fn(),
    resolveSosRequest: vi.fn(),
    updateSosLocation: vi.fn(),
    updateUserProfile: vi.fn(),
    newSosRequestId: vi.fn(() => "req-1"),
    subscribeToSosRequest: vi.fn(),
    getUserSosRequests: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    sub: {
      onData: null as null | ((s: unknown) => void),
      onError: null as null | ((e: Error) => void),
    },
    auth: {
      user: { uid: "u1", email: "a@b.c", displayName: "Rahim" } as null | Record<string, unknown>,
      profile: { displayName: "Rahim", email: "a@b.c", phone: "" } as null | Record<
        string,
        unknown
      >,
      loading: false,
      applyProfilePatch: vi.fn(),
    },
    geo: {
      ok: null as null | ((p: unknown) => void),
      err: null as null | ((e: unknown) => void),
      clearWatch: vi.fn(),
    },
  };
});

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    // TopBar's back button needs router history access.
    useCanGoBack: () => true,
    useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn() }),
  };
});
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));
vi.mock("@/components/MiniMapPreview", () => ({
  MiniMapPreview: (p: { location: { lat: number; lng: number }; responderLocation?: unknown }) => (
    <div data-testid="map">
      {p.location.lat},{p.location.lng}
      {p.responderLocation ? " responder-marker" : ""}
    </div>
  ),
}));
vi.mock("@/lib/map/places", () => ({ reverseGeocode: vi.fn(async () => "Test Road, Dhaka") }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => h.auth }));
vi.mock("@/lib/firebase/firestore", () => ({
  SosError: h.SosError,
  createSosRequest: h.createSosRequest,
  getSosRequestOnce: h.getSosRequestOnce,
  cancelSosRequest: h.cancelSosRequest,
  resolveSosRequest: h.resolveSosRequest,
  updateSosLocation: h.updateSosLocation,
  updateUserProfile: h.updateUserProfile,
  newSosRequestId: h.newSosRequestId,
  subscribeToSosRequest: h.subscribeToSosRequest,
  getUserSosRequests: h.getUserSosRequests,
}));

import { Route } from "@/routes/sos";

const SosScreen = Route.options.component as React.ComponentType;

const gpsFix = (lat = 23.8103, lng = 90.4125, accuracy = 14) => ({
  coords: { latitude: lat, longitude: lng, accuracy },
  timestamp: Date.now(),
});

const savedRequest = (over: Record<string, unknown> = {}) => ({
  id: "req-1",
  userId: "u1",
  userName: "Rahim",
  status: "active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  location: {
    source: "gps",
    address: "Test Road, Dhaka",
    lat: 23.8103,
    lng: 90.4125,
    accuracyMeters: 14,
  },
  ...over,
});

beforeEach(() => {
  h.auth.user = { uid: "u1", email: "a@b.c", displayName: "Rahim" };
  h.auth.profile = { displayName: "Rahim", email: "a@b.c", phone: "" };
  h.auth.loading = false;
  h.geo.ok = null;
  h.geo.err = null;
  h.sub.onData = null;
  h.sub.onError = null;
  h.createSosRequest.mockReset();
  h.getSosRequestOnce.mockReset().mockResolvedValue(null);
  h.cancelSosRequest.mockReset();
  h.resolveSosRequest.mockReset();
  h.updateSosLocation.mockReset().mockResolvedValue(undefined);
  h.updateUserProfile.mockReset().mockResolvedValue(undefined);
  h.newSosRequestId.mockReset().mockReturnValue("req-1");
  h.getUserSosRequests.mockReset().mockResolvedValue([]);
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  h.geo.clearWatch.mockReset();
  h.subscribeToSosRequest
    .mockReset()
    .mockImplementation(
      (_id: string, onData: (s: unknown) => void, onError: (e: Error) => void) => {
        h.sub.onData = onData;
        h.sub.onError = onError;
        return () => {};
      },
    );
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: (ok: (p: unknown) => void, err: (e: unknown) => void) => {
        h.geo.ok = ok;
        h.geo.err = err;
        return 7;
      },
      clearWatch: h.geo.clearWatch,
    },
  });
});

afterEach(() => cleanup());

async function toConfirmStep() {
  const user = userEvent.setup();
  render(<SosScreen />);
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
  return user;
}

describe("SOS screen — Phase 1 behaviour", () => {
  it("SOS-1: a failed write NEVER shows success; stays on confirm step with retry + 999", async () => {
    h.createSosRequest.mockRejectedValue(
      Object.assign(new Error("denied"), { code: "permission-denied" }),
    );
    const user = await toConfirmStep();
    act(() => h.geo.ok!(gpsFix()));
    await user.type(screen.getByLabelText(/emergency message/i), "fire in building");
    await user.click(screen.getByRole("button", { name: /confirm sos/i }));

    expect(await screen.findByText(/was NOT sent/i)).toBeTruthy();
    expect(screen.queryByText(/SOS request saved/i)).toBeNull();
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /call 999/i })[0]!.getAttribute("href")).toBe(
      "tel:999",
    );
    // typed message preserved
    expect((screen.getByLabelText(/emergency message/i) as HTMLTextAreaElement).value).toBe(
      "fire in building",
    );
    expect(h.subscribeToSosRequest).not.toHaveBeenCalled();
  });

  it("SOS-1: retry reuses the same request id (no duplicates) and succeeds afterwards", async () => {
    h.createSosRequest.mockRejectedValueOnce(new h.SosError("timeout", "no confirmation"));
    h.createSosRequest.mockResolvedValueOnce(savedRequest());
    const user = await toConfirmStep();
    act(() => h.geo.ok!(gpsFix()));
    await user.click(screen.getByRole("button", { name: /confirm sos/i }));
    await screen.findByText(/was NOT sent/i);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText(/SOS request saved/i)).toBeTruthy();
    const ids = h.createSosRequest.mock.calls.map((c) => c[0].requestId);
    expect(ids).toEqual(["req-1", "req-1"]);
    expect(h.newSosRequestId).toHaveBeenCalledTimes(1);
  });

  it("SOS-1: if a retry error hides that the first attempt actually landed, it is detected and shown as success", async () => {
    h.createSosRequest.mockRejectedValueOnce(new h.SosError("timeout", "no confirmation"));
    h.createSosRequest.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "permission-denied" }),
    );
    const user = await toConfirmStep();
    act(() => h.geo.ok!(gpsFix()));
    await user.click(screen.getByRole("button", { name: /confirm sos/i }));
    await screen.findByText(/was NOT sent/i);
    h.getSosRequestOnce.mockResolvedValue(savedRequest()); // server actually has it
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText(/SOS request saved/i)).toBeTruthy();
  });

  it("SOS-1: repeated taps send only one request", async () => {
    let resolve!: (v: unknown) => void;
    h.createSosRequest.mockImplementation(() => new Promise((r) => (resolve = r)));
    const user = await toConfirmStep();
    act(() => h.geo.ok!(gpsFix()));
    const btn = screen.getByRole("button", { name: /confirm sos/i });
    await user.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(h.createSosRequest).toHaveBeenCalledTimes(1);
    await act(async () => resolve(savedRequest()));
    await screen.findByText(/SOS request saved/i);
  });

  it("SOS-1: signed-out visitors cannot 'send' — sign-in notice, nothing is created", async () => {
    h.auth.user = null;
    h.auth.profile = null;
    await toConfirmStep();
    expect(screen.getByText(/sign in to send an sos request/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /confirm sos/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(h.createSosRequest).not.toHaveBeenCalled();
  });

  it("SOS-2: with GPS denied no default coordinates are used; address is required and marked approximate", async () => {
    h.createSosRequest.mockResolvedValue(
      savedRequest({ location: { source: "manual", address: "House 12, Road 5" } }),
    );
    const user = await toConfirmStep();
    act(() => h.geo.err!({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }));

    expect(await screen.findByText(/permission was denied/i)).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    const send = screen.getByRole("button", { name: /confirm sos/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    await user.type(screen.getByLabelText(/address or nearest landmark/i), "House 12, Road 5");
    expect(screen.getByText(/approximate address typed by you/i)).toBeTruthy();
    expect(send.disabled).toBe(false);
    await user.click(send);

    await screen.findByText(/SOS request saved/i);
    const payload = h.createSosRequest.mock.calls[0]![0];
    expect(payload.location).toEqual({ source: "manual", address: "House 12, Road 5" });
    expect(JSON.stringify(payload)).not.toMatch(/23\.7461|90\.3742|Dhanmondi 27|GPS strong/);
    // updates are not synced for manual locations
    expect(h.updateSosLocation).not.toHaveBeenCalled();
  });

  it("SOS-2: with a real GPS fix, real coordinates and measured accuracy are submitted", async () => {
    h.createSosRequest.mockResolvedValue(savedRequest());
    const user = await toConfirmStep();
    act(() => h.geo.ok!(gpsFix(23.8103, 90.4125, 14.2)));
    await screen.findByText(/Test Road, Dhaka/);
    expect(screen.getByTestId("map").textContent).toContain("23.8103,90.4125");
    await user.click(screen.getByRole("button", { name: /confirm sos/i }));
    await screen.findByText(/SOS request saved/i);
    expect(h.createSosRequest.mock.calls[0]![0].location).toMatchObject({
      source: "gps",
      lat: 23.8103,
      lng: 90.4125,
      accuracyMeters: 14.2,
      address: "Test Road, Dhaka",
    });
  });

  it("SOS-7: a GPS fix arriving later never overwrites the typed message; blank message gets a generic default only at send", async () => {
    h.createSosRequest.mockResolvedValue(savedRequest());
    const user = await toConfirmStep();
    await user.type(screen.getByLabelText(/emergency message/i), "my own words");
    act(() => h.geo.ok!(gpsFix()));
    await screen.findByText(/Test Road, Dhaka/);
    act(() => h.geo.ok!(gpsFix(23.9, 90.5)));
    expect((screen.getByLabelText(/emergency message/i) as HTMLTextAreaElement).value).toBe(
      "my own words",
    );
    await user.click(screen.getByRole("button", { name: /confirm sos/i }));
    await screen.findByText(/SOS request saved/i);
    expect(h.createSosRequest.mock.calls[0]![0].message).toBe("my own words");
  });

  it("SOS-7: empty message field stays empty on screen (no auto-generated text injected)", async () => {
    await toConfirmStep();
    act(() => h.geo.ok!(gpsFix()));
    await screen.findByText(/Test Road, Dhaka/);
    expect((screen.getByLabelText(/emergency message/i) as HTMLTextAreaElement).value).toBe("");
  });

  it("SOS-5: invalid phone blocks sending; valid phone is normalized, sent, and saved to the profile", async () => {
    h.createSosRequest.mockResolvedValue(savedRequest({ userPhone: "+8801712345678" }));
    const user = await toConfirmStep();
    act(() => h.geo.ok!(gpsFix()));
    const phone = screen.getByLabelText(/callback phone number/i);
    expect(screen.getByText(/responders will not be able to call you/i)).toBeTruthy();

    await user.type(phone, "12345");
    await user.click(screen.getByRole("button", { name: /confirm sos/i }));
    expect(await screen.findByText(/phone number is not valid/i)).toBeTruthy();
    expect(h.createSosRequest).not.toHaveBeenCalled();

    await user.clear(phone);
    await user.type(phone, "017-1234 5678");
    await user.click(screen.getByRole("button", { name: /try again|confirm sos/i }));
    await screen.findByText(/SOS request saved/i);
    expect(h.createSosRequest.mock.calls[0]![0].userPhone).toBe("+8801712345678");
    await waitFor(() =>
      expect(h.updateUserProfile).toHaveBeenCalledWith("u1", { phone: "+8801712345678" }),
    );
    await waitFor(() =>
      expect(h.auth.applyProfilePatch).toHaveBeenCalledWith({ phone: "+8801712345678" }),
    );
  });

  it("SOS-5: saved profile phone pre-fills the callback field and is used", async () => {
    h.auth.profile = { displayName: "Rahim", email: "a@b.c", phone: "+8801712345678" };
    h.createSosRequest.mockResolvedValue(savedRequest());
    const user = await toConfirmStep();
    act(() => h.geo.ok!(gpsFix()));
    expect((screen.getByLabelText(/callback phone number/i) as HTMLInputElement).value).toBe(
      "+8801712345678",
    );
    await user.click(screen.getByRole("button", { name: /confirm sos/i }));
    await screen.findByText(/SOS request saved/i);
    expect(h.createSosRequest.mock.calls[0]![0].userPhone).toBe("+8801712345678");
    expect(h.updateUserProfile).not.toHaveBeenCalled(); // unchanged → no redundant write
  });

  async function submitOk() {
    h.createSosRequest.mockResolvedValue(savedRequest());
    const user = await toConfirmStep();
    act(() => h.geo.ok!(gpsFix()));
    await user.click(screen.getByRole("button", { name: /confirm sos/i }));
    await screen.findByText(/SOS request saved/i);
    return user;
  }

  it("SOS-3: after sending there is NO fabricated progress, responder, ETA or responder marker", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await submitOk();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(screen.getByText(/waiting for a responder to accept/i)).toBeTruthy();
      expect(screen.queryByText(/Unit 04/)).toBeNull();
      expect(screen.queryByText(/ETA/)).toBeNull();
      expect(screen.queryByText(/responder-marker/)).toBeNull();
      expect(screen.queryByText(/updating every 10s/i)).toBeNull();
      expect(screen.queryByText(/Step \d of 2/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("SOS-3: status/responder/ETA shown only when the Firestore record contains them", async () => {
    await submitOk();
    act(() =>
      h.sub.onData!(
        savedRequest({
          status: "assigned",
          assignedResponder: {
            unit: "Karim (volunteer)",
            eta: "12 min",
            responderId: "v1",
            assignedAt: new Date().toISOString(),
          },
        }),
      ),
    );
    expect(await screen.findByText(/Responder: Karim \(volunteer\) · ETA 12 min/)).toBeTruthy();
    expect(screen.getByText(/A responder accepted your request/)).toBeTruthy();
    expect(screen.queryByText(/responder-marker/)).toBeNull(); // no real responder location → no marker

    act(() =>
      h.sub.onData!(
        savedRequest({
          status: "assigned",
          assignedResponder: {
            unit: "Karim",
            eta: "12 min",
            location: { lat: 23.81, lng: 90.41, updatedAt: new Date().toISOString() },
          },
        }),
      ),
    );
    expect(screen.getByTestId("map").textContent).toContain("responder-marker");
  });

  it("SOS-3: live GPS updates are persisted (throttled) only while the request is open; blocked writes are reported honestly", async () => {
    await submitOk();
    act(() => h.geo.ok!(gpsFix(23.82, 90.43, 9)));
    await waitFor(() => expect(h.updateSosLocation).toHaveBeenCalledTimes(1));
    expect(h.updateSosLocation).toHaveBeenCalledWith("req-1", {
      lat: 23.82,
      lng: 90.43,
      accuracyMeters: 9,
    });
    // immediate second fix is throttled
    act(() => h.geo.ok!(gpsFix(23.83, 90.44, 9)));
    expect(h.updateSosLocation).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/GPS shared with responders · updated/i)).toBeTruthy();
  });

  it("SOS-3: permission-denied location sync stops retrying and does not claim live sharing", async () => {
    h.updateSosLocation.mockRejectedValue(
      Object.assign(new Error("d"), { code: "permission-denied" }),
    );
    await submitOk();
    act(() => h.geo.ok!(gpsFix(23.82, 90.43)));
    expect(await screen.findByText(/Automatic updates are not available/i)).toBeTruthy();
    expect(screen.queryByText(/GPS shared with responders/i)).toBeNull();
    act(() => h.geo.ok!(gpsFix(23.9, 90.5)));
    expect(h.updateSosLocation).toHaveBeenCalledTimes(1);
  });

  it("SOS-3: no location writes after the request is closed", async () => {
    await submitOk();
    act(() => h.sub.onData!(savedRequest({ status: "resolved" })));
    await screen.findByText(/closed as resolved/i);
    act(() => h.geo.ok!(gpsFix(23.9, 90.5)));
    expect(h.updateSosLocation).not.toHaveBeenCalled();
  });

  it("SOS-3: GPS watcher is cleared on unmount", async () => {
    const { unmount } = render(<SosScreen />);
    unmount();
    expect(h.geo.clearWatch).toHaveBeenCalledWith(7);
  });

  it("SOS-3: listener errors are surfaced with a retry that resubscribes", async () => {
    await submitOk();
    expect(h.subscribeToSosRequest).toHaveBeenCalledTimes(1);
    act(() => h.sub.onError!(new Error("Missing or insufficient permissions.")));
    expect(await screen.findByText(/live status updates interrupted/i)).toBeTruthy();
    expect(screen.getByText(/insufficient permissions/i)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: /retry/i }));
    expect(h.subscribeToSosRequest).toHaveBeenCalledTimes(2);
  });

  it("SOS-3: step labels say 'of 3' (not 'of 2')", async () => {
    render(<SosScreen />);
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
  });

  it("SOS-4: cancel calls cancelSosRequest and shows closed state; failure keeps request active", async () => {
    const user = await submitOk();
    h.cancelSosRequest.mockRejectedValueOnce(new Error("network down"));
    await user.click(screen.getByRole("button", { name: /cancel sos request/i }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(screen.getByText(/waiting for a responder to accept/i)).toBeTruthy(); // still active
    expect(screen.getByRole("button", { name: /cancel sos request/i })).toBeTruthy();

    h.cancelSosRequest.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: /cancel sos request/i }));
    expect(await screen.findByText(/This request was cancelled/i)).toBeTruthy();
    expect(h.cancelSosRequest).toHaveBeenLastCalledWith("req-1", { uid: "u1" });
    expect(h.resolveSosRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /start a new request/i })).toBeTruthy();
  });

  it("SOS-4: 'close as resolved' calls resolveSosRequest (not cancel) and failure is not hidden", async () => {
    const user = await submitOk();
    act(() =>
      h.sub.onData!(
        savedRequest({ status: "assigned", assignedResponder: { unit: "Karim", eta: "5 min" } }),
      ),
    );
    h.resolveSosRequest.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "permission-denied" }),
    );
    await user.click(await screen.findByRole("button", { name: /close as resolved/i }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.cancelSosRequest).not.toHaveBeenCalled();
    expect(screen.queryByText(/closed as resolved/i)).toBeNull(); // UI did not pretend

    h.resolveSosRequest.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: /close as resolved/i }));
    expect(await screen.findByText(/closed as resolved/i)).toBeTruthy();
    expect(h.resolveSosRequest).toHaveBeenLastCalledWith("req-1", { uid: "u1" });
    expect(h.cancelSosRequest).not.toHaveBeenCalled();
  });

  it("SOS-Recovery: recovers existing open 'active' request on mount and transitions to Step 3", async () => {
    const existingReq = savedRequest({
      id: "recovered-req-1",
      status: "active",
      message: "Trapped in flood waters",
    });
    h.getUserSosRequests.mockResolvedValueOnce([existingReq]);

    render(<SosScreen />);

    // Step 3 should be displayed after recovery
    expect(await screen.findByText("SOS Active")).toBeTruthy();
    expect(screen.getByText(/waiting for a responder to accept/i)).toBeTruthy();
    expect(h.subscribeToSosRequest).toHaveBeenCalledWith(
      "recovered-req-1",
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("SOS-Recovery: recovers existing open 'assigned' request with responder information on mount", async () => {
    const existingReq = savedRequest({
      id: "recovered-req-2",
      status: "assigned",
      assignedResponder: { unit: "Volunteer Unit 4", eta: "8 min" },
    });
    h.getUserSosRequests.mockResolvedValueOnce([existingReq]);

    render(<SosScreen />);

    expect(await screen.findByText("SOS Active")).toBeTruthy();
    expect(screen.getByText(/Volunteer Unit 4/i)).toBeTruthy();
    expect(screen.getByText(/8 min/i)).toBeTruthy();
  });

  it("SOS-Recovery: ignores past resolved or cancelled requests on mount and stays on Step 1", async () => {
    const oldReqs = [
      savedRequest({ id: "old-1", status: "resolved" }),
      savedRequest({ id: "old-2", status: "cancelled" }),
    ];
    h.getUserSosRequests.mockResolvedValueOnce(oldReqs);

    render(<SosScreen />);

    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(screen.queryByText("Step 3 of 3")).toBeNull();
    expect(h.subscribeToSosRequest).not.toHaveBeenCalled();
  });
});
