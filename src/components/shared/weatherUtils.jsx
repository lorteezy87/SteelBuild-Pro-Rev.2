/**
 * Weather integration utilities
 * Uses Open-Meteo API (free, no key needed)
 */

import { describeWeatherCode } from "./weatherHelpers";

export { WEATHER_DESCRIPTIONS, describeWeatherCode } from "./weatherHelpers";

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
        description: describeWeatherCode(data.current.weather_code),
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
        description: describeWeatherCode(data.daily.weather_code[idx]),
      }));
    }
    return [];
  } catch (error) {
    console.error("Weather forecast error:", error);
    return [];
  }
}
