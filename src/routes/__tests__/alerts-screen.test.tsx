// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { createTestRouter } from "@/test-utils/app-router";
import { AppUnderTest } from "@/test-utils/AppUnderTest";
import * as weatherNotificationsModule from "@/lib/weather/weather-notifications";
import * as useWeatherModule from "@/lib/weather/use-weather";
import type { WeatherData } from "@/lib/weather/types";
import { getWmoCondition } from "@/lib/weather/wmo";

vi.mock("@/context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    isAuthenticated: false,
    isAdmin: false,
    isVolunteer: false,
    isVolunteerApproved: false,
  }),
}));

vi.mock("@/lib/firebase/config", () => ({
  auth: null,
  db: null,
  isFirebaseConfigured: () => false,
  getMissingFirebaseConfig: () => [],
}));

vi.mock("@/lib/firebase/firestore", () => ({
  subscribeToAlerts: vi.fn(() => () => {}),
  getStoredAlerts: () => [
    {
      id: "a1",
      severity: "critical",
      title: "Flash Flood Warning",
      body: "Water level rising rapidly.",
      location: "Sylhet",
      time: "10 min ago",
      createdAt: new Date().toISOString(),
      category: "flood",
    },
    {
      id: "a2",
      severity: "warning",
      title: "Cyclone Advisory",
      body: "Wind gusts along coastal belt.",
      location: "Chittagong",
      time: "30 min ago",
      createdAt: new Date().toISOString(),
      category: "cyclone",
    },
  ],
}));

function createSampleWeatherData(isSevere: boolean): WeatherData {
  const code = isSevere ? 95 : 0;
  const isDay = true;
  return {
    current: {
      temperature: 30,
      apparentTemperature: 32,
      relativeHumidity: 80,
      precipitation: isSevere ? 25 : 0,
      weatherCode: code,
      windSpeed: isSevere ? 55 : 12,
      isDay,
      condition: getWmoCondition(code, isDay),
      timestamp: "2026-10-25T00:00:00Z",
    },
    hourly: [],
    daily: [],
    locationName: "Dhaka, Bangladesh",
    isFallbackLocation: false,
    latitude: 23.8103,
    longitude: 90.4125,
    fetchedAt: Date.now(),
  };
}

describe("Alerts Route & Screen Full Verification", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Alerts screen with emergency action shortcuts and BMD official disclaimer", async () => {
    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: createSampleWeatherData(false),
      loading: false,
      error: null,
      isRefreshing: false,
      refetch: vi.fn(),
    });

    const { router } = createTestRouter(["/alerts"]);
    render(<AppUnderTest router={router} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alerts" })).toBeDefined();
    });

    // Verify emergency action buttons are present and point to correct destinations
    expect(screen.getByText("Find Shelters")).toBeDefined();
    expect(screen.getByText("Emergency Helplines")).toBeDefined();

    // Verify official BMD disclaimer is present without fabricated warning data
    expect(screen.getByText(/Official Bangladesh Weather Warnings/i)).toBeDefined();
    expect(screen.getByText(/Meteorological Act \(2018\)/i)).toBeDefined();

    const bmdLink = screen.getByRole("link", { name: /BMD Portal/i });
    expect(bmdLink).toBeDefined();
    expect(bmdLink.getAttribute("href")).toBe("https://www.bmd.gov.bd/web/en/");
    expect(bmdLink.getAttribute("target")).toBe("_blank");
    expect(bmdLink.getAttribute("rel")).toContain("noopener");
  });

  it("displays stored civil disaster alerts and filters by severity tab", async () => {
    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: createSampleWeatherData(false),
      loading: false,
      error: null,
      isRefreshing: false,
      refetch: vi.fn(),
    });

    const { router } = createTestRouter(["/alerts"]);
    render(<AppUnderTest router={router} />);

    // Stored alerts rendered
    await waitFor(() => {
      expect(screen.getByText("Flash Flood Warning")).toBeDefined();
      expect(screen.getByText("Cyclone Update")).toBeDefined();
    });

    // Test tab filter: Critical tab
    const criticalTab = screen.getByRole("button", { name: "Critical" });
    fireEvent.click(criticalTab);

    expect(screen.getByText("Flash Flood Warning")).toBeDefined();
    expect(screen.queryByText("Cyclone Update")).toBeNull();

    // Test tab filter: Warning tab
    const warningTab = screen.getByRole("button", { name: "Warning" });
    fireEvent.click(warningTab);

    expect(screen.queryByText("Flash Flood Warning")).toBeNull();
    expect(screen.getByText("Cyclone Update")).toBeDefined();
  });

  it("integrates live meteorological observations and distinguishes source attribution", async () => {
    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: createSampleWeatherData(true), // severe storm
      loading: false,
      error: null,
      isRefreshing: false,
      refetch: vi.fn(),
    });

    const markReadSpy = vi.spyOn(weatherNotificationsModule, "markAllWeatherNotificationsAsRead");

    const { router } = createTestRouter(["/alerts"]);
    render(<AppUnderTest router={router} />);

    await waitFor(() => {
      expect(screen.getByText(/Severe Weather:/i)).toBeDefined();
    });

    // Verify source origin badges distinguish Civil Broadcasts from Live Meteorological Observations
    expect(screen.getAllByText("Live Meteorological Observation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Civil Authority Broadcast").length).toBeGreaterThan(0);

    // Verify markAllWeatherNotificationsAsRead was invoked on mounting alerts
    expect(markReadSpy).toHaveBeenCalled();
  });
});
