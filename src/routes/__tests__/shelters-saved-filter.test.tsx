// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestRouter } from "@/test-utils/app-router";
import { AppUnderTest } from "@/test-utils/AppUnderTest";

const h = vi.hoisted(() => ({
  auth: {
    user: { uid: "test_user_1" } as null | { uid: string },
    profile: {
      role: "user",
      displayName: "Tester",
      email: "tester@e.co",
      volunteerStatus: "none",
    },
    loading: false,
    isAuthenticated: true,
    isAdmin: false,
    isVolunteer: false,
    isVolunteerApproved: false,
  },
}));

vi.mock("@/context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => h.auth,
}));

vi.mock("@/lib/firebase/config", () => ({
  auth: null,
  db: null,
  isFirebaseConfigured: () => false,
  getMissingFirebaseConfig: () => [],
}));

vi.mock("@/lib/firebase/firestore", () => ({
  subscribeToShelters: vi.fn(() => () => {}),
}));

vi.mock("@/components/MiniMapPreview", () => ({ MiniMapPreview: () => null }));
vi.mock("@/components/InteractiveMap", () => ({
  InteractiveMap: () => <div data-testid="interactive-map" />,
}));

beforeEach(() => {
  localStorage.clear();
  h.auth.user = { uid: "test_user_1" };
  h.auth.isAuthenticated = true;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("PRO-2: Saved Shelters filter on /shelters route", () => {
  it("displays all shelters by default when no search query is present", async () => {
    const { router } = createTestRouter(["/shelters"]);
    render(<AppUnderTest router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Find Shelter")).toBeTruthy();
    });

    // Check filter controls exist
    expect(screen.getByRole("button", { name: "All Shelters" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /filter saved shelters only/i })).toBeTruthy();

    // Verify multiple shelters are displayed in the list
    const detailLinks = screen.getAllByRole("link", { name: /view details/i });
    expect(detailLinks.length).toBeGreaterThan(1);
  });

  it("activates Saved Only filter automatically when opening /shelters?saved=true", async () => {
    // Seed one saved shelter for test_user_1 (Mirpur)
    localStorage.setItem("rl_saved_shelters_test_user_1", JSON.stringify(["mirpur"]));

    const { router } = createTestRouter(["/shelters?saved=true"]);
    render(<AppUnderTest router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Saved Shelters")).toBeTruthy();
    });

    // Verify only the saved shelter (Mirpur) is displayed
    expect(screen.getByText("Mirpur Shelter Center")).toBeTruthy();

    // Verify other shelters are not in the list
    expect(screen.queryByText("Uttara Model School Camp")).toBeNull();
  });

  it("renders appropriate empty state when /shelters?saved=true has no saved shelters", async () => {
    // No shelters saved for user
    localStorage.setItem("rl_saved_shelters_test_user_1", JSON.stringify([]));

    const { router } = createTestRouter(["/shelters?saved=true"]);
    render(<AppUnderTest router={router} />);

    await waitFor(() => {
      expect(screen.getByText("No saved shelters yet")).toBeTruthy();
    });

    expect(
      screen.getByText(/Bookmark shelters with the bookmark icon to quickly access them here/i),
    ).toBeTruthy();

    // Verify View all shelters button is rendered
    const viewAllBtn = screen.getByRole("button", {
      name: /view all shelters/i,
    });
    expect(viewAllBtn).toBeTruthy();

    // Clicking View all shelters switches to full list
    await userEvent.setup().click(viewAllBtn);

    await waitFor(() => {
      expect(screen.getByText("Find Shelter")).toBeTruthy();
    });
    expect(screen.getAllByRole("link", { name: /view details/i }).length).toBeGreaterThan(1);
  });

  it("allows switching between All Shelters and Saved Shelters using filter chips", async () => {
    localStorage.setItem("rl_saved_shelters_test_user_1", JSON.stringify(["mirpur"]));

    const { router } = createTestRouter(["/shelters"]);
    render(<AppUnderTest router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Find Shelter")).toBeTruthy();
    });

    // Click "Saved" chip
    const savedChip = screen.getByRole("button", {
      name: /filter saved shelters only/i,
    });
    await userEvent.setup().click(savedChip);

    await waitFor(() => {
      expect(screen.getByText("Saved Shelters")).toBeTruthy();
    });
    expect(screen.getByText("Mirpur Shelter Center")).toBeTruthy();
    expect(screen.queryByText("Uttara Model School Camp")).toBeNull();

    // Click "All Shelters" chip
    const allChip = screen.getByRole("button", { name: "All Shelters" });
    await userEvent.setup().click(allChip);

    await waitFor(() => {
      expect(screen.getByText("Find Shelter")).toBeTruthy();
    });
    expect(screen.getAllByRole("link", { name: /view details/i }).length).toBeGreaterThan(1);
  });

  it("preserves user isolation across different authenticated accounts", async () => {
    // User 1 has Mirpur
    localStorage.setItem("rl_saved_shelters_test_user_1", JSON.stringify(["mirpur"]));
    // User 2 has Uttara
    localStorage.setItem("rl_saved_shelters_test_user_2", JSON.stringify(["uttara"]));

    // Render for User 1
    const { router } = createTestRouter(["/shelters?saved=true"]);
    const { unmount } = render(<AppUnderTest router={router} />);

    await waitFor(() => {
      expect(screen.getByText("Mirpur Shelter Center")).toBeTruthy();
    });
    expect(screen.queryByText("Uttara Model School Camp")).toBeNull();
    unmount();

    // Switch to User 2
    h.auth.user = { uid: "test_user_2" };
    const router2 = createTestRouter(["/shelters?saved=true"]);
    render(<AppUnderTest router={router2.router} />);

    await waitFor(() => {
      expect(screen.getByText("Uttara Model School Camp")).toBeTruthy();
    });
    expect(screen.queryByText("Mirpur Shelter Center")).toBeNull();
  });
});
