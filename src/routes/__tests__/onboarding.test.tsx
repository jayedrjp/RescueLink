// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  mapProps: null as null | { center: { lat: number; lng: number }; selectedPlaceId?: string },
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
import { createTestRouter } from "@/test-utils/app-router";
import { AppUnderTest } from "@/test-utils/AppUnderTest";

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
    profile: { role: "user", displayName: "Citizen Jane", email: "jane@test.org" },
    isAuthenticated: true,
    isAdmin: false,
    role: "user",
  });
  setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: false });
};

const asAdmin = () => {
  Object.assign(h.auth, {
    user: { uid: "a1" },
    profile: { role: "admin", displayName: "Admin Alex", email: "alex@test.org" },
    isAuthenticated: true,
    isAdmin: true,
    role: "admin",
  });
  setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: true });
};

const pathOf = (r: ReturnType<typeof createTestRouter>["router"]) => r.state.location.pathname;

describe("RescueLink 3-Screen Onboarding Implementation", () => {
  beforeEach(() => {
    resetAuthSnapshot();
    window.localStorage.clear();
    h.mapProps = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Screen Content & Visual Specifications", () => {
    it("renders Screen 1 (Stay Safe Together) with reference-matching content and Dot 1 active", async () => {
      asGuest();
      const { router } = createTestRouter(["/onboarding"], 0);
      render(<AppUnderTest router={router} />);

      // Heading and Description matching reference
      const heading = await screen.findByRole("heading", { name: "Stay Safe Together" });
      expect(heading).toBeTruthy();
      expect(
        screen.getByText(
          "Share your location with trusted contacts and help each other stay safe during emergencies.",
        ),
      ).toBeTruthy();

      // Illustration present with correct alt text
      const img = screen.getByRole("img", {
        name: "Illustration of smartphone with map, trusted contacts avatars, and security shield",
      });
      expect(img.getAttribute("src")).toBe("/images/onboarding/screen1-together.png");

      // Skip button present in top right
      expect(screen.getByRole("button", { name: /skip/i })).toBeTruthy();

      // Pagination indicators
      const dot1 = screen.getByTestId("pagination-dot-1");
      const dot2 = screen.getByTestId("pagination-dot-2");
      const dot3 = screen.getByTestId("pagination-dot-3");
      expect(dot1.getAttribute("aria-selected")).toBe("true");
      expect(dot2.getAttribute("aria-selected")).toBe("false");
      expect(dot3.getAttribute("aria-selected")).toBe("false");

      // Previous button is hidden/disabled on first slide
      const prevBtn = screen.getByTestId("onboarding-prev-btn") as HTMLButtonElement;
      expect(prevBtn.disabled).toBe(true);
    });

    it("navigates forward through all 3 reference screens with accurate pagination", async () => {
      asGuest();
      const user = userEvent.setup();
      const { router } = createTestRouter(["/onboarding"], 0);
      render(<AppUnderTest router={router} />);

      // Screen 1
      expect(await screen.findByRole("heading", { name: "Stay Safe Together" })).toBeTruthy();
      expect(screen.getByTestId("pagination-dot-1").getAttribute("aria-selected")).toBe("true");

      // Click Next -> moves to Screen 2
      await user.click(await screen.findByTestId("onboarding-next-btn"));

      // Screen 2 (Find Help Nearby)
      expect(await screen.findByRole("heading", { name: "Find Help Nearby" })).toBeTruthy();
      expect(
        screen.getByText(
          "Locate nearby hospitals, police stations, and fire services when every second matters.",
        ),
      ).toBeTruthy();
      const img2 = screen.getByRole("img", {
        name: "Illustration of smartphone with map route to nearby emergency services: hospital, police, and fire",
      });
      expect(img2.getAttribute("src")).toBe("/images/onboarding/screen2-nearby.png");
      expect(screen.getByTestId("pagination-dot-2").getAttribute("aria-selected")).toBe("true");

      // Previous button is now enabled
      expect((screen.getByTestId("onboarding-prev-btn") as HTMLButtonElement).disabled).toBe(false);

      // Click Next -> moves to Screen 3
      await user.click(screen.getByTestId("onboarding-next-btn"));

      // Screen 3 (Get Help Fast)
      expect(await screen.findByRole("heading", { name: "Get Help Fast" })).toBeTruthy();
      expect(
        screen.getByText("Send an SOS alert with your location when you need emergency help."),
      ).toBeTruthy();
      const img3 = screen.getByRole("img", {
        name: "Illustration of smartphone with glowing SOS alert button, medical cross shield, and map pin",
      });
      expect(img3.getAttribute("src")).toBe("/images/onboarding/screen3-fast.png");
      expect(screen.getByTestId("pagination-dot-3").getAttribute("aria-selected")).toBe("true");

      // Action button on final screen is labeled "Get Started"
      expect(screen.getByRole("button", { name: /get started/i })).toBeTruthy();
    });

    it("navigates backward through screens using the Previous button and stops at Screen 1", async () => {
      asGuest();
      const user = userEvent.setup();
      const { router } = createTestRouter(["/onboarding"], 0);
      render(<AppUnderTest router={router} />);

      // Wait for initial render then jump to Screen 3
      const nextBtn = await screen.findByTestId("onboarding-next-btn");
      await user.click(nextBtn);
      await user.click(await screen.findByTestId("onboarding-next-btn"));
      expect(await screen.findByRole("heading", { name: "Get Help Fast" })).toBeTruthy();

      // Click Previous -> back to Screen 2
      await user.click(screen.getByTestId("onboarding-prev-btn"));
      expect(await screen.findByRole("heading", { name: "Find Help Nearby" })).toBeTruthy();
      expect(screen.getByTestId("pagination-dot-2").getAttribute("aria-selected")).toBe("true");

      // Click Previous -> back to Screen 1
      await user.click(screen.getByTestId("onboarding-prev-btn"));
      expect(await screen.findByRole("heading", { name: "Stay Safe Together" })).toBeTruthy();
      expect(screen.getByTestId("pagination-dot-1").getAttribute("aria-selected")).toBe("true");
      expect((screen.getByTestId("onboarding-prev-btn") as HTMLButtonElement).disabled).toBe(true);
    });

    it("supports direct jumping via clickable pagination dots", async () => {
      asGuest();
      const user = userEvent.setup();
      const { router } = createTestRouter(["/onboarding"], 0);
      render(<AppUnderTest router={router} />);

      // Wait for initial render, on Screen 1 click dot 3
      const dot3 = await screen.findByTestId("pagination-dot-3");
      await user.click(dot3);
      expect(await screen.findByRole("heading", { name: "Get Help Fast" })).toBeTruthy();
      expect(screen.getByTestId("pagination-dot-3").getAttribute("aria-selected")).toBe("true");

      // On Screen 3, click dot 2
      await user.click(screen.getByTestId("pagination-dot-2"));
      expect(await screen.findByRole("heading", { name: "Find Help Nearby" })).toBeTruthy();
      expect(screen.getByTestId("pagination-dot-2").getAttribute("aria-selected")).toBe("true");

      // Click dot 1
      await user.click(screen.getByTestId("pagination-dot-1"));
      expect(await screen.findByRole("heading", { name: "Stay Safe Together" })).toBeTruthy();
      expect(screen.getByTestId("pagination-dot-1").getAttribute("aria-selected")).toBe("true");
    });
  });

  describe("Completion, Persistence & Routing Scenarios", () => {
    it("Scenario A / Skip: marks onboarding completed and replaces history with /welcome", async () => {
      asGuest();
      const user = userEvent.setup();
      const { router, history } = createTestRouter(["/welcome", "/onboarding"], 1);
      render(<AppUnderTest router={router} />);
      const startHistoryLen = history.length;

      // Click Skip
      const skipBtn = await screen.findByRole("button", { name: /skip introduction/i });
      await user.click(skipBtn);

      // Navigates to /welcome
      await waitFor(() => expect(pathOf(router)).toBe("/welcome"));
      // History was replaced (no extra stack entry, Back never re-enters onboarding)
      expect(history.length).toBe(startHistoryLen);
      // Persisted flag set
      expect(window.localStorage.getItem("rescuelink_intro_completed")).toBe("true");
    });

    it("Scenario A / Get Started: marks onboarding completed and replaces history with /welcome", async () => {
      asGuest();
      const user = userEvent.setup();
      const { router, history } = createTestRouter(["/welcome", "/onboarding"], 1);
      render(<AppUnderTest router={router} />);
      const startHistoryLen = history.length;

      // Navigate to Screen 3
      const nextBtn1 = await screen.findByTestId("onboarding-next-btn");
      await user.click(nextBtn1);
      const nextBtn2 = await screen.findByTestId("onboarding-next-btn");
      await user.click(nextBtn2);
      expect(await screen.findByRole("heading", { name: "Get Help Fast" })).toBeTruthy();

      // Click Get Started
      const getStartedBtn = await screen.findByRole("button", { name: /get started/i });
      await user.click(getStartedBtn);

      // Navigates to /welcome
      await waitFor(() => expect(pathOf(router)).toBe("/welcome"));
      expect(history.length).toBe(startHistoryLen);
      expect(window.localStorage.getItem("rescuelink_intro_completed")).toBe("true");
    });

    it("Scenario A / First launch: visiting '/' without completed intro redirects to '/onboarding' with ZERO BottomNav flash", async () => {
      asGuest();
      const { router } = createTestRouter(["/"], 0);
      const { container } = render(<AppUnderTest router={router} />);

      // BottomNav must never be rendered on '/' while intro is pending or during transition
      expect(screen.queryByLabelText("Main navigation")).toBeNull();
      expect(container.innerHTML.includes('aria-label="Main navigation"')).toBe(false);

      await waitFor(() => expect(pathOf(router)).toBe("/onboarding"));
      expect(await screen.findByRole("heading", { name: "Stay Safe Together" })).toBeTruthy();
      expect(screen.queryByLabelText("Main navigation")).toBeNull();
    });

    it("Scenario B / Returning user: visiting '/' with completed intro redirects directly to '/welcome' with no BottomNav", async () => {
      asGuest();
      window.localStorage.setItem("rescuelink_intro_completed", "true");
      const { router } = createTestRouter(["/"], 0);
      render(<AppUnderTest router={router} />);

      // BottomNav must not render for unauthenticated returning visitor on '/'
      expect(screen.queryByLabelText("Main navigation")).toBeNull();

      await waitFor(() => expect(pathOf(router)).toBe("/welcome"));
      expect(pathOf(router)).not.toBe("/onboarding");
      expect(screen.queryByLabelText("Main navigation")).toBeNull();
    });

    it("Scenario C / Authenticated Citizen: visiting '/' stays on '/' and renders BottomNav", async () => {
      asUser();
      const { router } = createTestRouter(["/"], 0);
      render(<AppUnderTest router={router} />);

      await waitFor(() => expect(pathOf(router)).toBe("/"));
      expect(pathOf(router)).not.toBe("/onboarding");
      expect(pathOf(router)).not.toBe("/welcome");
      // Authenticated citizen receives the full BottomNav
      expect(await screen.findByLabelText("Main navigation")).toBeTruthy();
    });

    it("Scenario C / Authenticated Admin: visiting '/' redirects to '/admin' and never shows onboarding", async () => {
      asAdmin();
      const { router } = createTestRouter(["/"], 0);
      render(<AppUnderTest router={router} />);

      await waitFor(() => expect(pathOf(router)).toBe("/admin"));
      expect(pathOf(router)).not.toBe("/onboarding");
    });

    it("Authenticated user who visits /onboarding returns to app on finish (not /welcome)", async () => {
      asUser();
      const user = userEvent.setup();
      const { router } = createTestRouter(["/onboarding"], 0);
      render(<AppUnderTest router={router} />);

      // Citizen skips or completes onboarding
      const skipBtn = await screen.findByRole("button", { name: /skip/i });
      await user.click(skipBtn);
      // Redirects back to citizen home '/', not '/welcome'
      await waitFor(() => expect(pathOf(router)).toBe("/"));
    });
  });
});
