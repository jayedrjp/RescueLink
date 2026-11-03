// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  auth: {
    user: null as null | { uid: string },
    profile: null as null | Record<string, unknown>,
    profileError: null,
    loading: false,
    initializing: false,
    isFirebaseReady: true,
    isAuthenticated: false,
    isAdmin: false,
    isVolunteer: false,
    isVolunteerApproved: false,
    isVolunteerPending: false,
    role: null as string | null,
    activeMode: "user",
    setActiveMode: () => {},
    refreshProfile: async () => {},
    applyProfilePatch: () => {},
    logout: async () => {},
  },
  mapProps: null as null | {
    center: { lat: number; lng: number };
    selectedPlaceId?: string;
    onSelectPlace?: (place: unknown) => void;
  },
}));

vi.mock("@/context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => h.auth,
}));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  signInWithPopup: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  GoogleAuthProvider: class {},
  onAuthStateChanged: vi.fn(() => () => {}),
}));
// No Firebase at all in these tests: every data call degrades to "empty" like an unconfigured app.
vi.mock("@/lib/firebase/config", () => ({
  auth: null,
  db: null,
  isFirebaseConfigured: () => false,
  getMissingFirebaseConfig: () => [],
}));
vi.mock("@/components/MiniMapPreview", () => ({ MiniMapPreview: () => null }));
vi.mock("@/components/InteractiveMap", () => ({
  InteractiveMap: React.forwardRef(
    (props: NonNullable<typeof h.mapProps>, ref: React.Ref<unknown>) => {
      h.mapProps = props;
      React.useImperativeHandle(ref, () => ({ flyTo: vi.fn() }));
      return <div data-testid="interactive-map" />;
    },
  ),
}));

import { resetAuthSnapshot, setAuthSnapshot } from "@/lib/auth-store";
import { requireSignedIn } from "@/lib/route-guards";
import { createTestRouter } from "@/test-utils/app-router";
import { AppUnderTest } from "@/test-utils/AppUnderTest";
import { VERIFIED_EMERGENCY_PLACES } from "@/lib/map/places";

const asGuest = () => {
  Object.assign(h.auth, {
    user: null,
    profile: null,
    isAuthenticated: false,
    isAdmin: false,
    role: null,
  });
  setAuthSnapshot({ ready: true, isAuthenticated: false, isAdmin: false });
};
const asUser = () => {
  Object.assign(h.auth, {
    user: { uid: "u1" },
    profile: { role: "user", displayName: "U", email: "u@e.co", volunteerStatus: "none" },
    isAuthenticated: true,
    isAdmin: false,
    role: "user",
  });
  setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: false });
};
const asAdmin = () => {
  Object.assign(h.auth, {
    user: { uid: "a1" },
    profile: { role: "admin", displayName: "A", email: "a@e.co", volunteerStatus: "none" },
    isAuthenticated: true,
    isAdmin: true,
    role: "admin",
  });
  setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: true });
};
const pathOf = (r: ReturnType<typeof createTestRouter>["router"]) => r.state.location.pathname;

beforeEach(() => {
  resetAuthSnapshot();
  h.mapProps = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe("NAV-8: legacy /admin?sub=... links redirect before render, with replace (no Back trap)", () => {
  it.each([
    ["alerts", "/admin/alerts"],
    ["donations", "/admin/donations"],
    ["users", "/admin/citizens"],
    ["reports", "/admin/reports"],
  ])("sub=%s -> %s and the legacy URL never enters the history", async (sub, target) => {
    asAdmin();
    const { router, history } = createTestRouter(["/profile", `/admin?sub=${sub}`], 1);
    render(<AppUnderTest router={router} />);
    await waitFor(() => expect(pathOf(router)).toBe(target));
    expect(history.length).toBe(2); // replaced, not pushed
    act(() => history.back());
    await waitFor(() => expect(pathOf(router)).toBe("/profile")); // Back skips the legacy URL entirely
  });

  it("plain /admin and unknown sub values are not redirected", async () => {
    asAdmin();
    const a = createTestRouter(["/admin?tab=sos"]);
    await a.router.load();
    expect(pathOf(a.router)).toBe("/admin");
    const b = createTestRouter(["/admin?sub=whatever"]);
    await b.router.load();
    expect(pathOf(b.router)).toBe("/admin");
  });
});

describe("NAV-10: route-level guards (beforeLoad)", () => {
  const protectedPaths = [
    "/admin",
    "/admin/alerts",
    "/admin/citizens",
    "/admin/donations",
    "/admin/reports",
  ];

  it.each(protectedPaths)("signed-out visitor to %s is sent to /login with replace", async (p) => {
    asGuest();
    const { router, history } = createTestRouter(["/", p], 1);
    render(<AppUnderTest router={router} />);
    await waitFor(() => expect(pathOf(router)).toBe("/login"));
    expect(history.length).toBe(2);
    act(() => history.back());
    await waitFor(() => expect(pathOf(router)).toBe("/")); // protected URL is not left behind
  });

  it("after logout, Back to a protected page redirects to /login instead of exposing it", async () => {
    asAdmin();
    const { router, history } = createTestRouter(["/login", "/admin?tab=home"], 1);
    render(<AppUnderTest router={router} />);
    await waitFor(() => expect(pathOf(router)).toBe("/admin"));
    await act(async () => {
      await router.navigate({ to: "/profile" });
    });
    asGuest(); // logout
    act(() => history.back()); // Back onto /admin
    await waitFor(() => expect(pathOf(router)).toBe("/login"));
    expect(pathOf(router)).not.toBe("/admin");
  });

  it("waits while auth is unresolved, then lets a signed-in user through (no false redirect)", async () => {
    // not ready at all
    const { router } = createTestRouter(["/admin"]);
    let settled = false;
    const loading = router.load().then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 30));
    expect(settled).toBe(false); // navigation is held, not redirected
    setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: true });
    await loading;
    expect(pathOf(router)).toBe("/admin");
  });

  it("waits while auth is unresolved, then redirects a signed-out visitor", async () => {
    const { router } = createTestRouter(["/admin/alerts"]);
    const loading = router.load();
    await new Promise((r) => setTimeout(r, 20));
    setAuthSnapshot({ ready: true, isAuthenticated: false, isAdmin: false });
    await loading;
    expect(pathOf(router)).toBe("/login");
  });

  it("never hangs: if auth never resolves it stops waiting and does NOT redirect", async () => {
    vi.useFakeTimers();
    const guard = requireSignedIn();
    await vi.advanceTimersByTimeAsync(8100);
    await expect(guard).resolves.toBeUndefined();
  });

  it("a signed-in non-admin is not redirected by the guard (the page shows an explicit Access Denied)", async () => {
    asUser();
    const { router } = createTestRouter(["/admin"]);
    await router.load();
    expect(pathOf(router)).toBe("/admin");
  });
});

describe("NAV-11: guest-accessible pages are not bounced", () => {
  it.each([
    "/map",
    "/sos",
    "/services",
    "/shelters",
    "/shelters/mirpur",
    "/alerts",
    "/donate",
    "/permissions",
    "/welcome",
    "/login",
    "/register",
    "/instructions",
    "/support",
  ])("a signed-out visitor can open %s", async (p) => {
    asGuest();
    const { router } = createTestRouter([p]);
    await router.load();
    expect(pathOf(router)).toBe(p);
  });
});

// ---------------------------------------------------------------------------------------------
describe("NAV-2: pages opened from Profile go back to Profile, not Home", () => {
  it.each([
    "/volunteer",
    "/donate",
    "/alerts",
    "/services",
    "/shelters",
    "/instructions",
    "/support",
  ])("%s -> back arrow -> /profile", async (p) => {
    asUser();
    const { router, history } = createTestRouter(["/profile", p], 1);
    render(<AppUnderTest router={router} />);
    await waitFor(() => expect(pathOf(router)).toBe(p));
    const before = history.length;
    await userEvent.setup().click(await screen.findByRole("button", { name: /go back/i }));
    await waitFor(() => expect(pathOf(router)).toBe("/profile"));
    expect(history.length).toBe(before);
  });
});

describe("Profile menu navigation to dedicated info pages (never onboarding)", () => {
  it("clicking Emergency System Instructions opens /instructions with real content and never onboarding", async () => {
    asUser();
    const user = userEvent.setup();
    const { router } = createTestRouter(["/profile"], 0);
    render(<AppUnderTest router={router} />);

    const link = await screen.findByRole("link", { name: /emergency system instructions/i });
    expect(link.getAttribute("href")).toBe("/instructions");
    await user.click(link);

    await waitFor(() => expect(pathOf(router)).toBe("/instructions"));
    expect(pathOf(router)).not.toBe("/onboarding");
    expect(await screen.findByRole("heading", { name: /emergency instructions/i })).toBeTruthy();
    expect(screen.queryByText(/share your location with trusted contacts/i)).toBeNull();
  });

  it("clicking Help & Support opens /support with real content and never onboarding", async () => {
    asUser();
    const user = userEvent.setup();
    const { router } = createTestRouter(["/profile"], 0);
    render(<AppUnderTest router={router} />);

    const link = await screen.findByRole("link", { name: /help & support/i });
    expect(link.getAttribute("href")).toBe("/support");
    await user.click(link);

    await waitFor(() => expect(pathOf(router)).toBe("/support"));
    expect(pathOf(router)).not.toBe("/onboarding");
    expect(await screen.findByRole("heading", { name: /help & support/i })).toBeTruthy();
    expect(screen.queryByText(/share your location with trusted contacts/i)).toBeNull();
  });
});

describe("NAV-5/6: Permissions and shelter details return to the real origin", () => {
  it("Permissions opened from Profile goes back to Profile; opened directly it falls back to Profile (not onboarding)", async () => {
    asUser();
    const a = createTestRouter(["/profile", "/permissions"], 1);
    render(<AppUnderTest router={a.router} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: /go back/i }));
    await waitFor(() => expect(pathOf(a.router)).toBe("/profile"));
    cleanup();

    const b = createTestRouter(["/permissions"]);
    render(<AppUnderTest router={b.router} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: /go back/i }));
    await waitFor(() => expect(pathOf(b.router)).toBe("/profile"));
    expect(b.history.length).toBe(1);
  });

  it("Shelter details go back to wherever they were opened from; a direct link falls back to the list", async () => {
    asUser();
    for (const origin of ["/", "/donate", "/map"]) {
      const a = createTestRouter([origin, "/shelters/mirpur"], 1);
      render(<AppUnderTest router={a.router} />);
      await userEvent.setup().click(await screen.findByRole("button", { name: /go back/i }));
      await waitFor(() => expect(pathOf(a.router)).toBe(origin));
      cleanup();
    }
    const b = createTestRouter(["/shelters/mirpur"]);
    render(<AppUnderTest router={b.router} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: /go back/i }));
    await waitFor(() => expect(pathOf(b.router)).toBe("/shelters"));
    expect(b.history.length).toBe(1);
  });
});

describe("NAV-9: services category chips replace the history entry", () => {
  it("switching Hospitals -> Police -> Fire never adds entries, and one Back leaves the page", async () => {
    asUser();
    const { router, history } = createTestRouter(["/profile", "/services"], 1);
    render(<AppUnderTest router={router} />);
    const user = userEvent.setup();
    const start = history.length;
    await user.click(await screen.findByRole("button", { name: /^police$/i }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ cat: "police" }));
    await user.click(screen.getByRole("button", { name: /fire stations/i }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ cat: "fire" }));
    expect(history.length).toBe(start);
    act(() => history.back());
    await waitFor(() => expect(pathOf(router)).toBe("/profile"));
  });
});

describe("NAV-12: Directions opens the map on the selected place (or says why it cannot)", () => {
  it("service with a known map place links to that place; unknown ones fall back to a search query", async () => {
    asUser();
    const { router } = createTestRouter(["/services?cat=hospitals"]);
    render(<AppUnderTest router={router} />);
    const links = (await screen.findAllByRole("link", {
      name: /directions/i,
    })) as HTMLAnchorElement[];
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs.some((x) => x?.startsWith("/map?place="))).toBe(true);
    for (const href of hrefs) expect(href).toMatch(/^\/map\?(place|q)=/);
  });

  it("shelter details link to the matching map shelter", async () => {
    asUser();
    const { router } = createTestRouter(["/shelters/mirpur"]);
    render(<AppUnderTest router={router} />);
    const link = (await screen.findByRole("link", { name: /directions/i })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/map?place=shelter-mirpur");
  });
});

describe("Map route: back button, requested place, honest fallbacks", () => {
  const mirpur = VERIFIED_EMERGENCY_PLACES.find((p) => p.id === "shelter-mirpur")!;

  function stubGeolocation(lat: number, lng: number) {
    Object.defineProperty(globalThis.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (p: unknown) => void) =>
          ok({ coords: { latitude: lat, longitude: lng, accuracy: 20 } }),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
    });
  }

  it("NAV-3: the map has a back button that returns to the previous page", async () => {
    asUser();
    const { router } = createTestRouter(["/services", "/map"], 1);
    render(<AppUnderTest router={router} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: /go back/i }));
    await waitFor(() => expect(pathOf(router)).toBe("/services"));
  });

  it("NAV-11: for a signed-out visitor who opened /map directly, back goes to /welcome (not through '/')", async () => {
    asGuest();
    const { router } = createTestRouter(["/map"]);
    render(<AppUnderTest router={router} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: /go back/i }));
    await waitFor(() => expect(pathOf(router)).toBe("/welcome"));
  });

  it("opens centred on and selecting the requested place, and a later GPS fix does not pull the view away", async () => {
    asUser();
    stubGeolocation(23.9, 90.5); // far from Mirpur
    const { router } = createTestRouter([`/map?place=${mirpur.id}`]);
    render(<AppUnderTest router={router} />);
    await screen.findByTestId("interactive-map");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(h.mapProps?.center).toEqual(mirpur.coordinates);
    expect(h.mapProps?.selectedPlaceId).toBe(mirpur.id);
  });

  it("without a requested place the map still centres on the user's GPS fix (existing behaviour kept)", async () => {
    asUser();
    stubGeolocation(23.9, 90.5);
    const { router } = createTestRouter(["/map"]);
    render(<AppUnderTest router={router} />);
    await screen.findByTestId("interactive-map");
    await waitFor(() => expect(h.mapProps?.center).toEqual({ lat: 23.9, lng: 90.5 }));
  });

  it("an unknown place id says so instead of silently showing something else", async () => {
    asUser();
    const { router } = createTestRouter(["/map?place=does-not-exist"]);
    render(<AppUnderTest router={router} />);
    expect(await screen.findByText(/could not be found on the map/i)).toBeTruthy();
  });

  it("a name without coordinates pre-fills the search and explains that no exact location exists", async () => {
    asUser();
    const { router } = createTestRouter(["/map?q=Hotline%20Ambulance%2016263"]);
    render(<AppUnderTest router={router} />);
    expect(
      await screen.findByText(/no exact map location is available for "Hotline Ambulance 16263"/i),
    ).toBeTruthy();
    expect(
      (screen.getByPlaceholderText(/search emergency services/i) as HTMLInputElement).value,
    ).toBe("Hotline Ambulance 16263");
  });

  it("validates and sanitises the search params", () => {
    const route = createTestRouter(["/map"]).router.routesByPath["/map"] as unknown as {
      options: { validateSearch: (s: Record<string, unknown>) => unknown };
    };
    expect(route.options.validateSearch({ place: " x ", q: "  hi ", junk: 1 })).toEqual({
      place: "x",
      q: "hi",
    });
    expect(route.options.validateSearch({ place: 5, q: "" })).toEqual({});
    expect((route.options.validateSearch({ q: "z".repeat(500) }) as { q: string }).q).toHaveLength(
      120,
    );
  });

  it("opening /map without a place parameter displays no bottom popup and does not select Dhaka Medical College Hospital", async () => {
    asUser();
    const { router } = createTestRouter(["/map"]);
    render(<AppUnderTest router={router} />);
    await screen.findByTestId("interactive-map");
    expect(h.mapProps?.selectedPlaceId).toBe("");
    expect(screen.queryByRole("button", { name: /dismiss details/i })).toBeNull();
    expect(screen.queryByText(/Dhaka Medical College Hospital/i)).toBeNull();
  });

  it("selecting a marker displays its details popup, and clicking X immediately closes it and keeps it closed", async () => {
    asUser();
    const user = userEvent.setup();
    const { router } = createTestRouter(["/map"]);
    render(<AppUnderTest router={router} />);
    await screen.findByTestId("interactive-map");
    expect(h.mapProps?.selectedPlaceId).toBe("");

    // Simulate clicking a marker
    act(() => {
      h.mapProps?.onSelectPlace?.(mirpur);
    });

    expect(await screen.findByText(mirpur.name)).toBeTruthy();
    const closeBtn = screen.getByRole("button", { name: /dismiss details/i });
    expect(closeBtn).toBeTruthy();

    // Click close (X)
    await user.click(closeBtn);

    // Popup is dismissed and does NOT re-appear
    expect(screen.queryByRole("button", { name: /dismiss details/i })).toBeNull();
    expect(screen.queryByText(mirpur.name)).toBeNull();
    expect(h.mapProps?.selectedPlaceId).toBe("");
  });

  it("clicking X on a requested place popup removes the place search param from the URL", async () => {
    asUser();
    const user = userEvent.setup();
    const { router } = createTestRouter([`/map?place=${mirpur.id}&q=mirpur`]);
    render(<AppUnderTest router={router} />);
    await screen.findByTestId("interactive-map");

    expect(await screen.findByText(mirpur.name)).toBeTruthy();
    const closeBtn = await screen.findByRole("button", { name: /dismiss details/i });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: "mirpur" });
    });
    expect(screen.queryByRole("button", { name: /dismiss details/i })).toBeNull();
  });

  it("navigating away from /map and returning does not restore the previous selection", async () => {
    asUser();
    const user = userEvent.setup();
    const { router } = createTestRouter(["/map"]);
    render(<AppUnderTest router={router} />);
    await screen.findByTestId("interactive-map");

    // Select a marker
    act(() => {
      h.mapProps?.onSelectPlace?.(mirpur);
    });
    expect(await screen.findByText(mirpur.name)).toBeTruthy();

    // Dismiss it
    await user.click(screen.getByRole("button", { name: /dismiss details/i }));
    expect(screen.queryByText(mirpur.name)).toBeNull();

    // Navigate to /profile and then back to /map
    await act(async () => {
      await router.navigate({ to: "/profile" });
    });
    await waitFor(() => expect(pathOf(router)).toBe("/profile"));

    await act(async () => {
      await router.navigate({ to: "/map" });
    });
    await screen.findByTestId("interactive-map");
    expect(h.mapProps?.selectedPlaceId).toBe("");
    expect(screen.queryByRole("button", { name: /dismiss details/i })).toBeNull();
  });

  it("filtering places when a place is selected clears the selection without forced auto-selection", async () => {
    asUser();
    const { router } = createTestRouter(["/map"]);
    render(<AppUnderTest router={router} />);
    await screen.findByTestId("interactive-map");

    act(() => {
      h.mapProps?.onSelectPlace?.(mirpur);
    });
    expect(await screen.findByText(mirpur.name)).toBeTruthy();

    // Type a search query that excludes mirpur
    const searchInput = screen.getByPlaceholderText(/search emergency services/i);
    await userEvent.setup().type(searchInput, "NonExistentFacility123");

    // Selection should be cleared, no fallback place forced
    await waitFor(() => {
      expect(screen.queryByText(mirpur.name)).toBeNull();
      expect(screen.queryByText(/Dhaka Medical College Hospital/i)).toBeNull();
      expect(h.mapProps?.selectedPlaceId).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("NAV-4/13: real admin pages", () => {
  it("the dashboard (root of the portal) has no back arrow", async () => {
    asAdmin();
    const { router } = createTestRouter(["/admin?tab=home"]);
    render(<AppUnderTest router={router} />);
    await screen.findByText(/admin dashboard/i);
    expect(screen.queryByRole("button", { name: /go back/i })).toBeNull();
  });

  it("on other tabs the arrow returns to the dashboard tab by REPLACING the entry (no history growth, no '/' round trip)", async () => {
    asAdmin();
    const { router, history } = createTestRouter(["/profile", "/admin?tab=sos"], 1);
    render(<AppUnderTest router={router} />);
    const start = history.length;
    await userEvent.setup().click(await screen.findByRole("button", { name: /go back/i }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "home" }));
    expect(pathOf(router)).toBe("/admin");
    expect(history.length).toBe(start);
  });

  it("admin sub-pages go back to where the admin came from; a direct link falls back to the 'More' tab with replace", async () => {
    asAdmin();
    for (const sub of ["alerts", "citizens", "donations", "reports"]) {
      const a = createTestRouter(["/admin?tab=more", `/admin/${sub}`], 1);
      render(<AppUnderTest router={a.router} />);
      await userEvent.setup().click(await screen.findByRole("button", { name: /back/i }));
      await waitFor(() => expect(pathOf(a.router)).toBe("/admin"));
      expect(a.router.state.location.search).toMatchObject({ tab: "more" });
      expect(a.history.length).toBe(2); // went back; did not push another "More" entry
      cleanup();

      const b = createTestRouter([`/admin/${sub}`]);
      render(<AppUnderTest router={b.router} />);
      await userEvent.setup().click(await screen.findByRole("button", { name: /back/i }));
      await waitFor(() => expect(pathOf(b.router)).toBe("/admin"));
      expect(b.router.state.location.search).toMatchObject({ tab: "more" });
      expect(b.history.length).toBe(1);
      cleanup();
    }
  });

  it("signing out of the admin session replaces the entry with /login (Back cannot reopen the admin page)", async () => {
    asAdmin();
    const logout = vi.fn(async () => {
      asGuest();
    });
    h.auth.logout = logout;
    const { router, history } = createTestRouter(["/login", "/admin?tab=more"], 1);
    render(<AppUnderTest router={router} />);
    const start = history.length;
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /sign out from admin session/i }));
    await waitFor(() => expect(pathOf(router)).toBe("/login"));
    expect(logout).toHaveBeenCalled();
    expect(history.length).toBe(start); // replaced, not pushed
    h.auth.logout = async () => {};
  });
});

describe("NAV-10: profile logout and onboarding completion replace the entry", () => {
  it("Sign Out on Profile replaces the page with /welcome", async () => {
    asUser();
    h.auth.logout = vi.fn(async () => {
      asGuest();
    });
    const { router, history } = createTestRouter(["/", "/profile"], 1);
    render(<AppUnderTest router={router} />);
    const start = history.length;
    await userEvent.setup().click(await screen.findByRole("button", { name: /^sign out$/i }));
    await waitFor(() => expect(pathOf(router)).toBe("/welcome"));
    expect(history.length).toBe(start);
    h.auth.logout = async () => {};
  });

  it("finishing the intro replaces /onboarding: Back never returns to the slides", async () => {
    asGuest();
    const { router, history } = createTestRouter(["/welcome", "/onboarding"], 1);
    render(<AppUnderTest router={router} />);
    const start = history.length;
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /skip introduction/i }));
    await waitFor(() => expect(pathOf(router)).not.toBe("/onboarding"));
    expect(history.length).toBe(start);
    act(() => history.back());
    await waitFor(() => expect(history.location.pathname).toBe("/welcome"));
    expect(pathOf(router)).not.toBe("/onboarding");
  });
});
