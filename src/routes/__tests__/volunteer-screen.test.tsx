// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUnderTest } from "@/test-utils/AppUnderTest";
import { createTestRouter } from "@/test-utils/app-router";
import { setAuthSnapshot, resetAuthSnapshot } from "@/lib/auth-store";
import * as firestoreModule from "@/lib/firebase/firestore";
import { toast } from "sonner";

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

vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
}));

const asCitizen = () => {
  Object.assign(h.auth, {
    user: { uid: "citizen-1" },
    profile: {
      uid: "citizen-1",
      role: "user",
      displayName: "Karim Citizen",
      email: "karim@example.com",
      volunteerStatus: "none",
      area: "Mohammadpur, Dhaka",
    },
    isAuthenticated: true,
    isAdmin: false,
    isVolunteerApproved: false,
    isVolunteerPending: false,
    role: "user",
  });
  setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: false });
};

const asAdmin = () => {
  Object.assign(h.auth, {
    user: { uid: "admin-1" },
    profile: {
      uid: "admin-1",
      role: "admin",
      displayName: "Commander Admin",
      email: "admin@rescuelink.org",
      volunteerStatus: "none",
      area: "Dhaka Central",
    },
    isAuthenticated: true,
    isAdmin: true,
    isVolunteerApproved: false,
    isVolunteerPending: false,
    role: "admin",
  });
  setAuthSnapshot({ ready: true, isAuthenticated: true, isAdmin: true });
};

beforeEach(() => {
  resetAuthSnapshot();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Volunteer Screen UI & Form Updates", () => {
  it("case 18: removes the handshake icon and its green circular background completely above 'Help Your Community'", async () => {
    asCitizen();
    const { router } = createTestRouter(["/volunteer"]);
    render(<AppUnderTest router={router} />);

    // 'Help Your Community' heading is present
    expect(await screen.findByRole("heading", { name: /help your community/i })).toBeTruthy();

    // Verify there is no green circular background container (bg-safe/10) with HeartHandshake above the heading
    const container = screen.queryByText(/help your community/i)?.parentElement;
    expect(container).toBeTruthy();
    // The parent container should NOT contain the old rounded-3xl bg-safe/10 span
    const greenCircle = container?.querySelector(".bg-safe\\/10");
    expect(greenCircle).toBeNull();
  });

  it("case 3 & 4: displays all three new fields (DOB, Age, NID) and auto-calculates age from DOB", async () => {
    asCitizen();
    const user = userEvent.setup();
    const { router } = createTestRouter(["/volunteer"]);
    render(<AppUnderTest router={router} />);

    // Click "Apply to Become a Volunteer" button to open the form
    const applyBtn = await screen.findByRole("button", {
      name: /apply to become a volunteer/i,
    });
    await user.click(applyBtn);

    // Verify card header
    expect(await screen.findByText(/relief volunteer application/i)).toBeTruthy();

    // Field 1: Date of Birth input
    const dobInput = screen.getByLabelText(/date of birth/i) as HTMLInputElement;
    expect(dobInput).toBeTruthy();
    expect(dobInput.type).toBe("date");

    // Field 2: Calculated Age input (read-only)
    const ageInput = screen.getByLabelText(/calculated age/i) as HTMLInputElement;
    expect(ageInput).toBeTruthy();
    expect(ageInput.readOnly).toBe(true);

    // Field 3: NID Number input
    const nidInput = screen.getByLabelText(/nid number/i) as HTMLInputElement;
    expect(nidInput).toBeTruthy();

    // Enter DOB for someone born in 2002 (should be ~24 years old)
    await user.type(dobInput, "2002-05-15");
    expect(ageInput.value).toMatch(/2[3-4] years old/);
    expect(screen.getByText(/eligible age range \(18–30 years\)/i)).toBeTruthy();
  });

  it("case 5 & 6: enforces age eligibility feedback for applicants aged 17 or below and 31 or above", async () => {
    asCitizen();
    const user = userEvent.setup();
    const { router } = createTestRouter(["/volunteer"]);
    render(<AppUnderTest router={router} />);

    await user.click(await screen.findByRole("button", { name: /apply to become a volunteer/i }));

    const dobInput = screen.getByLabelText(/date of birth/i);
    const ageInput = screen.getByLabelText(/calculated age/i) as HTMLInputElement;

    // Underage applicant (e.g. 15 years old)
    await user.clear(dobInput);
    await user.type(dobInput, "2011-01-01");
    expect(ageInput.value).toMatch(/1[4-5] years old/);
    expect(screen.getByText(/applicants must be at least 18 years old to apply/i)).toBeTruthy();

    // Overage applicant (e.g. 40 years old)
    await user.clear(dobInput);
    await user.type(dobInput, "1985-01-01");
    expect(ageInput.value).toMatch(/4[0-1] years old/);
    expect(screen.getByText(/applicants must be 30 years old or younger to apply/i)).toBeTruthy();
  });

  it("case 8 & 9: NID field accepts exactly 10 numeric digits and sanitizes non-numeric input", async () => {
    asCitizen();
    const user = userEvent.setup();
    const { router } = createTestRouter(["/volunteer"]);
    render(<AppUnderTest router={router} />);

    await user.click(await screen.findByRole("button", { name: /apply to become a volunteer/i }));

    const nidInput = screen.getByLabelText(/nid number/i) as HTMLInputElement;

    // Type string with letters and extra characters
    await user.type(nidInput, "123abc456!7890123");
    // Only numbers up to 10 digits allowed
    expect(nidInput.value).toBe("1234567890");
    expect(nidInput.value.length).toBe(10);
  });

  it("submits application successfully when valid DOB (18–30) and 10-digit NID are provided", async () => {
    asCitizen();
    const user = userEvent.setup();
    const submitSpy = vi
      .spyOn(firestoreModule, "submitVolunteerApplication")
      .mockResolvedValueOnce(undefined);

    const { router } = createTestRouter(["/volunteer"]);
    render(<AppUnderTest router={router} />);

    await user.click(await screen.findByRole("button", { name: /apply to become a volunteer/i }));

    const dobInput = screen.getByLabelText(/date of birth/i);
    const nidInput = screen.getByLabelText(/nid number/i);
    const termsCheckbox = screen.getByRole("checkbox");

    await user.type(dobInput, "2000-01-01");
    await user.type(nidInput, "1234567890");
    await user.click(termsCheckbox);

    const submitBtn = screen.getByRole("button", { name: /submit application/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith("citizen-1", {
        area: "Mohammadpur, Dhaka",
        skills: expect.arrayContaining(["First Aid & Medical Support"]),
        notes: "",
        dateOfBirth: "2000-01-01",
        nid: "1234567890",
      });
    });

    expect(toast.success).toHaveBeenCalledWith(
      "Volunteer Application Submitted!",
      expect.anything(),
    );
  });

  it("displays exact error 'This NID number is already registered.' on duplicate NID rejection", async () => {
    asCitizen();
    const user = userEvent.setup();
    vi.spyOn(firestoreModule, "submitVolunteerApplication").mockRejectedValueOnce(
      new Error("This NID number is already registered."),
    );

    const { router } = createTestRouter(["/volunteer"]);
    render(<AppUnderTest router={router} />);

    await user.click(await screen.findByRole("button", { name: /apply to become a volunteer/i }));

    const dobInput = screen.getByLabelText(/date of birth/i);
    const nidInput = screen.getByLabelText(/nid number/i);
    const termsCheckbox = screen.getByRole("checkbox");

    await user.type(dobInput, "2000-01-01");
    await user.type(nidInput, "9876543210");
    await user.click(termsCheckbox);

    const submitBtn = screen.getByRole("button", { name: /submit application/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("This NID number is already registered.");
    });
  });

  it("prevents administrator accounts from seeing or submitting the volunteer application form", async () => {
    asAdmin();
    const { router } = createTestRouter(["/volunteer"]);
    render(<AppUnderTest router={router} />);

    expect(
      await screen.findByText(/administrator accounts cannot apply as volunteers/i),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /apply to become a volunteer/i })).toBeNull();
  });

  it("prevents administrator accounts from seeing or submitting the volunteer application form", async () => {
    asAdmin();
    const { router } = createTestRouter(["/volunteer"]);
    render(<AppUnderTest router={router} />);

    expect(
      await screen.findByText(/administrator accounts cannot apply as volunteers/i),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /apply to become a volunteer/i })).toBeNull();
  });
});
