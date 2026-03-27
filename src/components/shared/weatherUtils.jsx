/**
 * Weather integration utilities
 * Uses Open-Meteo API (free, no key needed)
 */

const WEATHER_DESCRIPTIONS = {
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

export async function getCurrentWeather(latitude, longitude) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,precipitation,weather_code&temperature_unit=fahrenheit`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.current) {
      return {
        temperature: data.current.temperature_2m,
        windSpeed: data.current.wind_speed_10m,
        precipitation: data.current.precipitation,
        weatherCode: data.current.weather_code,
        description: WEATHER_DESCRIPTIONS[data.current.weather_code] || "Unknown",
      };
    }
    return null;
  } catch (error) {
    console.error("Weather fetch error:", error);
    return null;
  }
}

export async function getWeatherForecast(latitude, longitude) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code&temperature_unit=fahrenheit`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.daily) {
      return data.daily.time.map((date, idx) => ({
        date,
        tempMax: data.daily.temperature_2m_max[idx],
        tempMin: data.daily.temperature_2m_min[idx],
        precipitation: data.daily.precipitation_sum[idx],
        windSpeed: data.daily.wind_speed_10m_max[idx],
        weatherCode: data.daily.weather_code[idx],
        description: WEATHER_DESCRIPTIONS[data.daily.weather_code[idx]] || "Unknown",
      }));
    }
    return [];
  } catch (error) {
    console.error("Weather forecast error:", error);
    return [];
  }
}

export async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}