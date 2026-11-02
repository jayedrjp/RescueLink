// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WeatherWidget } from "../WeatherWidget";
import type { WeatherData } from "@/lib/weather/types";

const mockWeatherData: WeatherData = {
  current: {
    temperature: 28,
    apparentTemperature: 31,
    relativeHumidity: 75,
    precipitation: 2.5,
    weatherCode: 65,
    windSpeed: 18,
    isDay: true,
    condition: {
      code: 65,
      label: "Heavy rain",
      labelBn: "ভারী বৃষ্টিপাত",
      iconName: "cloud-rain",
      isSevere: true,
    },
    timestamp: "2026-10-24T23:00",
  },
  hourly: [
    {
      time: "2026-10-24T23:00",
      formattedHour: "11 PM",
      temperature: 28,
      precipitationProbability: 70,
      weatherCode: 65,
      condition: {
        code: 65,
        label: "Heavy rain",
        labelBn: "ভারী বৃষ্টিপাত",
        iconName: "cloud-rain",
        isSevere: true,
      },
    },
  ],
  daily: [],
  locationName: "Mirpur 10, Dhaka",
  isFallbackLocation: false,
  latitude: 23.8068,
  longitude: 90.3688,
  fetchedAt: Date.now(),
};

describe("WeatherWidget Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders loading skeleton when loading and no weather data", () => {
    const { container } = render(<WeatherWidget weather={null} loading={true} error={null} />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders honest error state with retry button when error occurs", () => {
    const onRefresh = vi.fn();
    render(
      <WeatherWidget weather={null} loading={false} error="Network down" onRefresh={onRefresh} />,
    );

    expect(screen.getByText("Live Weather Unavailable")).toBeTruthy();
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    expect(retryBtn).toBeTruthy();
    fireEvent.click(retryBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders live weather observations accurately", () => {
    render(<WeatherWidget weather={mockWeatherData} loading={false} error={null} />);

    expect(screen.getByText("Mirpur 10, Dhaka")).toBeTruthy();
    expect(screen.getByText("Live GPS")).toBeTruthy();
    expect(screen.getByText("28°C")).toBeTruthy();
    expect(screen.getByText(/Feels like 31°C/i)).toBeTruthy();
    expect(screen.getAllByText(/Heavy rain/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/ভারী বৃষ্টিপাত/i)).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy(); // Humidity
    expect(screen.getByText("18 km/h")).toBeTruthy(); // Wind
    expect(screen.getByText("2.5 mm")).toBeTruthy(); // Precipitation
  });

  it("displays severe condition alert banner when condition is severe", () => {
    render(<WeatherWidget weather={mockWeatherData} loading={false} error={null} />);

    expect(screen.getByText(/Severe meteorological condition: Heavy rain/i)).toBeTruthy();
  });

  it("renders Default Area badge when location is fallback", () => {
    const fallbackData: WeatherData = {
      ...mockWeatherData,
      locationName: "Dhaka, Bangladesh",
      isFallbackLocation: true,
    };

    render(<WeatherWidget weather={fallbackData} loading={false} error={null} />);

    expect(screen.getByText("Default Area")).toBeTruthy();
  });
});
