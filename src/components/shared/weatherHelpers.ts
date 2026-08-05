/**
 * Pure WMO weather-code → description catalog (Open-Meteo).
 */

export const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Partly cloudy",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight showers",
  81: "Moderate showers",
  82: "Violent showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

export function describeWeatherCode(code: number | null | undefined): string {
  if (code == null) return "Unknown";
  return WEATHER_DESCRIPTIONS[code] || "Unknown";
}
