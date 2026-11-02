import type { WeatherCondition } from "./types";

/**
 * Maps WMO (World Meteorological Organization) Code 4677 weather codes to
 * human-readable English/Bengali descriptions, appropriate icon names, and severity flags.
 *
 * @param code WMO weather code (0 - 99)
 * @param isDay Boolean indicating day (true) or night (false) for diurnal icons
 */
export function getWmoCondition(code: number, isDay: boolean = true): WeatherCondition {
  switch (code) {
    case 0:
      return {
        code,
        label: "Clear sky",
        labelBn: "পরিষ্কার আকাশ",
        iconName: isDay ? "sun" : "moon",
        isSevere: false,
      };
    case 1:
      return {
        code,
        label: "Mainly clear",
        labelBn: "মূলত পরিষ্কার",
        iconName: isDay ? "cloud-sun" : "cloud-moon",
        isSevere: false,
      };
    case 2:
      return {
        code,
        label: "Partly cloudy",
        labelBn: "আংশিক মেঘলা",
        iconName: isDay ? "cloud-sun" : "cloud-moon",
        isSevere: false,
      };
    case 3:
      return {
        code,
        label: "Overcast",
        labelBn: "মেঘাচ্ছন্ন আকাশ",
        iconName: "cloud",
        isSevere: false,
      };
    case 45:
    case 48:
      return {
        code,
        label: code === 48 ? "Depositing rime fog" : "Foggy",
        labelBn: "কুয়াশাচ্ছন্ন",
        iconName: "cloud-fog",
        isSevere: false,
      };
    case 51:
      return {
        code,
        label: "Light drizzle",
        labelBn: "হালকা গুঁড়ি গুঁড়ি বৃষ্টি",
        iconName: "cloud-drizzle",
        isSevere: false,
      };
    case 53:
      return {
        code,
        label: "Moderate drizzle",
        labelBn: "মাঝারি গুঁড়ি গুঁড়ি বৃষ্টি",
        iconName: "cloud-drizzle",
        isSevere: false,
      };
    case 55:
      return {
        code,
        label: "Dense drizzle",
        labelBn: "ঘন গুঁড়ি গুঁড়ি বৃষ্টি",
        iconName: "cloud-drizzle",
        isSevere: false,
      };
    case 56:
    case 57:
      return {
        code,
        label: "Freezing drizzle",
        labelBn: "হিমশীতল গুঁড়ি গুঁড়ি বৃষ্টি",
        iconName: "cloud-drizzle",
        isSevere: false,
      };
    case 61:
      return {
        code,
        label: "Slight rain",
        labelBn: "হালকা বৃষ্টিপাত",
        iconName: "cloud-rain",
        isSevere: false,
      };
    case 63:
      return {
        code,
        label: "Moderate rain",
        labelBn: "মাঝারি বৃষ্টিপাত",
        iconName: "cloud-rain",
        isSevere: false,
      };
    case 65:
      return {
        code,
        label: "Heavy rain",
        labelBn: "ভারী বৃষ্টিপাত",
        iconName: "cloud-rain",
        isSevere: true,
      };
    case 66:
    case 67:
      return {
        code,
        label: "Freezing rain",
        labelBn: "হিমশীতল বৃষ্টি",
        iconName: "cloud-rain",
        isSevere: true,
      };
    case 71:
    case 73:
    case 75:
    case 77:
      return {
        code,
        label: "Snowfall",
        labelBn: "তুষারপাত",
        iconName: "cloud",
        isSevere: false,
      };
    case 80:
      return {
        code,
        label: "Slight rain showers",
        labelBn: "হালকা পশলা বৃষ্টি",
        iconName: "cloud-rain",
        isSevere: false,
      };
    case 81:
      return {
        code,
        label: "Moderate rain showers",
        labelBn: "মাঝারি পশলা বৃষ্টি",
        iconName: "cloud-rain",
        isSevere: false,
      };
    case 82:
      return {
        code,
        label: "Violent rain showers",
        labelBn: "তীব্র পশলা বৃষ্টি",
        iconName: "cloud-rain",
        isSevere: true,
      };
    case 85:
    case 86:
      return {
        code,
        label: "Snow showers",
        labelBn: "তুষারঝড়",
        iconName: "cloud",
        isSevere: false,
      };
    case 95:
      return {
        code,
        label: "Thunderstorm",
        labelBn: "বজ্রঝড় ও বৃষ্টি",
        iconName: "cloud-lightning",
        isSevere: true,
      };
    case 96:
      return {
        code,
        label: "Thunderstorm with slight hail",
        labelBn: "হালকা শিলাবৃষ্টিসহ বজ্রঝড়",
        iconName: "cloud-lightning",
        isSevere: true,
      };
    case 99:
      return {
        code,
        label: "Severe thunderstorm with heavy hail",
        labelBn: "তীব্র শিলাবৃষ্টিসহ ভারী বজ্রঝড়",
        iconName: "cloud-lightning",
        isSevere: true,
      };
    default:
      return {
        code,
        label: code >= 60 ? "Rainy" : "Cloudy",
        labelBn: code >= 60 ? "বৃষ্টি" : "মেঘলা",
        iconName: code >= 60 ? "cloud-rain" : "cloud",
        isSevere: false,
      };
  }
}
