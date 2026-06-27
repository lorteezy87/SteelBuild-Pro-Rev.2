/**
 * weatherRisk.js — Proactive weather risk for Gantt Installation tasks.
 *
 * Uses Open-Meteo (free, no API key, no credits required):
 *   - Geocoding:  https://geocoding-api.open-meteo.com/v1/search
 *   - Forecast:   https://api.open-meteo.com/v1/forecast (daily, up to 16d)
 *
 * Flow:
 *   getWeatherRiskForProject(project) →
 *     { risks: [{ date, summary, severity, drivers: {...} }, ...], source }
 *
 * Risks are days in the next 16 days whose weather is bad enough to
 * warrant a planning heads-up on field work:
 *   - Heavy precipitation (> HEAVY_RAIN_MM)
 *   - High wind gusts (> HIGH_GUST_KPH)
 *   - Freezing temps (min < 0°C) — concrete / galvanizing / safety
 *   - Extreme heat (max > HEAT_CEILING_C) — OSHA heat rest cycles
 *   - Snow (precipitation_probability > SNOW_PROB_PCT with snow)
 *
 * Results cached in-memory per (lat,lon) for FORECAST_TTL_MS so
 * repeated Gantt renders don't spam the API. Geocoded lat/lon is
 * cached per-address in localStorage (addresses don't move) so the
 * slow step only runs once per project ever.
 */

// ── Tunables ────────────────────────────────────────────────────────
const FORECAST_TTL_MS   = 30 * 60 * 1000;    // 30 min
const HEAVY_RAIN_MM     = 12;                // ~½ inch in a day → washout
const HIGH_GUST_KPH     = 55;                // ≈ 34 mph — crane/lift concern
const HEAT_CEILING_C    = 38;                // ≈ 100°F
const FREEZE_FLOOR_C    = 0;
const SNOW_PROB_PCT     = 40;                // 40% snow probability

const GEOCODE_CACHE_KEY = "sbp-weather-geocode-v1";
const FORECAST_MEMORY_CACHE = new Map(); // lat,lon → { at, data }

// ── Geocoding ───────────────────────────────────────────────────────
function loadGeocodeCache() {
  try {
    const raw = typeof window !== "undefined" && window.localStorage?.getItem(GEOCODE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}
function saveGeocodeCache(cache) {
  try { window.localStorage?.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); } catch { /* ignore */ }
}

/**
 * Pull "City, ST" out of a free-text address. Works on everything I
 * tested (USPS / shipping formats: "1234 Foo St, Tucson, AZ 85719"),
 * falls back to the raw string so Open-Meteo can take a shot.
 */
function cityStateFromAddress(addr) {
  if (!addr) return null;
  // Match "<something>, <City>, <ST> <ZIP?>" — ST is 2 caps after the comma.
  const m = /,\s*([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s+\d{5})?\s*$/.exec(addr.trim());
  if (m) return `${m[1].trim()}, ${m[2]}`;
  // Fall back to last two comma-separated segments.
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(", ");
  return addr.trim();
}

async function geocodeAddress(address) {
  if (!address) return null;
  const cache = loadGeocodeCache();
  if (cache[address]) return cache[address];

  const query = cityStateFromAddress(address);
  if (!query) return null;

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    const data = await resp.json();
    const hit = data?.results?.[0];
    if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return null;
    const coord = { lat: hit.latitude, lon: hit.longitude, label: `${hit.name}${hit.admin1 ? ", " + hit.admin1 : ""}` };
    cache[address] = coord;
    saveGeocodeCache(cache);
    return coord;
  } catch {
    return null;
  }
}

// ── Forecast fetch ──────────────────────────────────────────────────
async function fetchForecast(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = FORECAST_MEMORY_CACHE.get(key);
  if (hit && Date.now() - hit.at < FORECAST_TTL_MS) return hit.data;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("daily", [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "snowfall_sum",
    "wind_gusts_10m_max",
    "weathercode",
  ].join(","));
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "16");

  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    const data = await resp.json();
    FORECAST_MEMORY_CACHE.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

// ── Risk classification ─────────────────────────────────────────────
function classifyDay({ precipitation_sum, snowfall_sum, wind_gusts_10m_max, temperature_2m_min, temperature_2m_max, precipitation_probability_max }) {
  const drivers = [];
  let severity = 0;

  if (Number.isFinite(snowfall_sum) && snowfall_sum > 0 && (precipitation_probability_max ?? 0) >= SNOW_PROB_PCT) {
    drivers.push(`${snowfall_sum.toFixed(1)}cm snow`);
    severity = Math.max(severity, 3);
  }
  if (Number.isFinite(precipitation_sum) && precipitation_sum > HEAVY_RAIN_MM) {
    drivers.push(`${precipitation_sum.toFixed(0)}mm rain`);
    severity = Math.max(severity, precipitation_sum > HEAVY_RAIN_MM * 2 ? 3 : 2);
  }
  if (Number.isFinite(wind_gusts_10m_max) && wind_gusts_10m_max > HIGH_GUST_KPH) {
    drivers.push(`gusts ${Math.round(wind_gusts_10m_max)}km/h`);
    severity = Math.max(severity, wind_gusts_10m_max > HIGH_GUST_KPH * 1.3 ? 3 : 2);
  }
  if (Number.isFinite(temperature_2m_min) && temperature_2m_min < FREEZE_FLOOR_C) {
    drivers.push(`freeze (${Math.round(temperature_2m_min)}°C)`);
    severity = Math.max(severity, 2);
  }
  if (Number.isFinite(temperature_2m_max) && temperature_2m_max > HEAT_CEILING_C) {
    drivers.push(`heat (${Math.round(temperature_2m_max)}°C)`);
    severity = Math.max(severity, 2);
  }

  if (severity === 0) return null;
  return { severity, drivers };
}

function normalizeForecast(data) {
  if (!data?.daily?.time?.length) return [];
  const d = data.daily;
  const out = [];
  for (let i = 0; i < d.time.length; i++) {
    const row = {
      date:                         d.time[i],
      temperature_2m_max:           d.temperature_2m_max?.[i],
      temperature_2m_min:           d.temperature_2m_min?.[i],
      precipitation_sum:            d.precipitation_sum?.[i],
      precipitation_probability_max: d.precipitation_probability_max?.[i],
      snowfall_sum:                 d.snowfall_sum?.[i],
      wind_gusts_10m_max:           d.wind_gusts_10m_max?.[i],
    };
    const risk = classifyDay(row);
    if (risk) {
      out.push({
        date:     row.date,
        severity: risk.severity,
        summary:  risk.drivers.join(", "),
        drivers:  row,
      });
    }
  }
  return out;
}

// ── Public API ──────────────────────────────────────────────────────
/**
 * Fetch the 16-day risk profile for a project. Returns null (not an
 * empty object) when there's no address or Open-Meteo is unreachable,
 * so the caller can distinguish "clear skies" from "we don't know".
 */
export async function getWeatherRiskForProject(project) {
  if (!project) return null;
  const coord = await geocodeAddress(project.address);
  if (!coord) return null;
  const forecast = await fetchForecast(coord.lat, coord.lon);
  if (!forecast) return null;
  const risks = normalizeForecast(forecast);
  return {
    source: `Open-Meteo · ${coord.label}`,
    lat:    coord.lat,
    lon:    coord.lon,
    risks,  // [{ date, severity, summary, drivers }]
  };
}

/**
 * Given a risk profile + a task's [start,end] date range, return any
 * bad-weather days that overlap. Used by the Gantt to attach a warning
 * to Installation rows. Dates compared as YYYY-MM-DD strings to sidestep
 * timezone rabbit holes.
 */
export function risksForTaskWindow(risks, startDate, endDate) {
  if (!risks?.length || !startDate || !endDate) return [];
  const s = String(startDate).slice(0, 10);
  const e = String(endDate).slice(0, 10);
  return risks.filter((r) => r.date >= s && r.date <= e);
}
