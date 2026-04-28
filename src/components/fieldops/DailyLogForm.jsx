/**
 * DailyLogForm — superintendent's end-of-day form.
 *
 * Field-overhaul rebuild (Package B):
 *   - B1 Weather auto-pull: when creating a new log AND the project has
 *     an `address`, geocode + Open-Meteo current-weather hits land into
 *     the temperature / wind / weather_description fields. Fail open —
 *     never blocks the form. The pulled values are also stamped into
 *     `metadata.weather_auto = { ... }` so we know later this came from
 *     the API and can offer "click to override".
 *   - B2 Manning rollup: rows for Ironworkers / Welders / Operators /
 *     Laborers / Other with count + hours each, persisted under
 *     `metadata.manning`. Auto-sums total man-hours and back-fills the
 *     existing headcount / hours_worked columns so legacy reports still
 *     work.
 *   - B3 Photos inline: PhotoStripUploader on the same form (was already
 *     wired before this change).
 *
 * The DB schema (verified against information_schema for project
 * kjrwqagyeswwoxpjkcko) keeps temperature / wind_speed as TEXT, so we
 * always coerce numeric inputs to string-or-null on submit.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import PhotoStripUploader from "@/components/shared/PhotoStripUploader";
import MultiSelectChips from "@/components/shared/MultiSelectChips";
import { Cloud, RefreshCw } from "lucide-react";
import { getCurrentWeather, geocodeAddress as geocodeNominatim } from "@/components/shared/weatherUtils";

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};

// Coerce JSONB values that may come back from Postgres as strings or null.
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asObject(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return {};
}

// Manning trades — fixed canonical set. Anything not in the list goes
// into the "Other" bucket. Order is rendered top→bottom on the form.
const MANNING_TRADES = ["Ironworkers", "Welders", "Operators", "Laborers", "Foremen", "Other"];

const emptyManning = () => MANNING_TRADES.reduce((acc, trade) => {
  acc[trade] = { count: 0, hours: 0 };
  return acc;
}, {});

/**
 * Open-Meteo geocoding (no API key, free tier well above our usage).
 * Returns { latitude, longitude } or null. Falls back to OSM Nominatim
 * via the existing weatherUtils helper if Open-Meteo's geocoder doesn't
 * find the address.
 */
async function geocodeWithFallback(address) {
  if (!address) return null;
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1&language=en&format=json`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      const hit = data?.results?.[0];
      if (hit) return { latitude: hit.latitude, longitude: hit.longitude };
    }
  } catch (err) {
    console.warn("[DailyLogForm] Open-Meteo geocode failed:", err);
  }
  // Fallback to Nominatim (existing helper)
  try {
    return await geocodeNominatim(address);
  } catch {
    return null;
  }
}

export default function DailyLogForm({ projectId, log, onSave, onClose, isSaving }) {
  const isEditing = !!log;

  const [formData, setFormData] = useState({
    project_id: projectId,
    date: new Date().toISOString().split("T")[0],
    superintendent: "",
    crew_name: "",
    headcount: "",
    hours_worked: "",
    weather_description: "",
    temperature: "",
    wind_speed: "",
    activities: "",
    equipment_used: "",
    materials_received: "",
    delays: "",
    delay_hours: "",
    safety_incidents: 0,
    safety_notes: "",
    photos: [],
    related_action_item_ids: [],
    related_rfi_ids: [],
    metadata: { manning: emptyManning() },
  });

  // Weather banner state — only relevant on create. We surface it once
  // the auto-pull resolves so the user knows the values came from an API
  // and they can click to override. The ref prevents double-firing in
  // React strict-mode dev double-mount.
  const [weatherBanner, setWeatherBanner] = useState(null); // { auto: true, source: "...", at: ISO }
  const [weatherLoading, setWeatherLoading] = useState(false);
  const weatherFetchedRef = useRef(false);

  useEffect(() => {
    if (log) {
      setFormData({
        ...log,
        photos: asArray(log.photos),
        related_action_item_ids: asArray(log.related_action_item_ids),
        related_rfi_ids: asArray(log.related_rfi_ids),
        metadata: { ...asObject(log.metadata), manning: { ...emptyManning(), ...asObject(asObject(log.metadata).manning) } },
      });
      // If this row was created with an auto-pull, surface the banner so
      // an editor knows the weather fields are not free-form (they were
      // pulled from Open-Meteo at create time). Editing them is fine —
      // the banner just labels the provenance.
      const meta = asObject(log.metadata);
      if (meta.weather_auto) {
        setWeatherBanner({ auto: true, ...meta.weather_auto, persisted: true });
      }
    }
  }, [log]);

  // ── Project context ──
  const { data: projects = [] } = useQuery({
    queryKey: ["projects-for-daily-log", formData.project_id],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });
  const project = useMemo(
    () => projects.find((p) => p.id === formData.project_id) || null,
    [projects, formData.project_id]
  );

  // ── Weather auto-pull (B1) ──
  // Triggers exactly once when:
  //   - we're creating a new log (not editing)
  //   - the project has an `address`
  //   - the user hasn't manually filled any weather field yet
  // Fails open — if geocode or weather fetch errors out, the form still
  // works and the user can fill the fields by hand.
  useEffect(() => {
    if (isEditing) return;
    if (weatherFetchedRef.current) return;
    if (!project?.address) return;
    // Don't overwrite manual edits — if any weather field already has
    // a value when this effect fires, bail.
    const { weather_description, temperature, wind_speed } = formData;
    if (weather_description || temperature || wind_speed) return;

    weatherFetchedRef.current = true;
    setWeatherLoading(true);

    (async () => {
      try {
        const coords = await geocodeWithFallback(project.address);
        if (!coords) {
          setWeatherBanner({ failed: true, reason: "Couldn't geocode project address" });
          return;
        }
        const weather = await getCurrentWeather(coords.latitude, coords.longitude);
        if (!weather) {
          setWeatherBanner({ failed: true, reason: "Open-Meteo didn't return a current reading" });
          return;
        }
        const auto = {
          temperature: weather.temperature,
          windSpeed: weather.windSpeed,
          precipitation: weather.precipitation,
          description: weather.description,
          weatherCode: weather.weatherCode,
          coords,
          source: "open-meteo",
          fetched_at: new Date().toISOString(),
        };
        setFormData((prev) => ({
          ...prev,
          temperature: weather.temperature != null ? String(Math.round(weather.temperature)) : prev.temperature,
          wind_speed: weather.windSpeed != null ? String(Math.round(weather.windSpeed)) : prev.wind_speed,
          weather_description: weather.description || prev.weather_description,
          metadata: {
            ...asObject(prev.metadata),
            weather_auto: auto,
          },
        }));
        setWeatherBanner({ auto: true, ...auto });
      } catch (err) {
        console.warn("[DailyLogForm] weather auto-pull failed:", err);
        setWeatherBanner({ failed: true, reason: "Network or API error" });
      } finally {
        setWeatherLoading(false);
      }
    })();
  }, [isEditing, project, formData]);

  // ── Action Items + RFIs for cross-link multi-selects (project-scoped) ──
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items-for-link", formData.project_id],
    queryFn: () =>
      formData.project_id
        ? base44.entities.ActionItem.filter({ project_id: formData.project_id })
        : Promise.resolve([]),
    enabled: !!formData.project_id,
    staleTime: 60 * 1000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis-for-link", formData.project_id],
    queryFn: () =>
      formData.project_id
        ? base44.entities.RFI.filter({ project_id: formData.project_id })
        : Promise.resolve([]),
    enabled: !!formData.project_id,
    staleTime: 60 * 1000,
  });

  const actionItemOptions = useMemo(
    () =>
      actionItems.map((a) => ({
        id: a.id,
        label: a.title || a.description?.slice(0, 40) || `Item ${a.id?.slice(0, 6)}`,
        sublabel: a.status || "",
      })),
    [actionItems]
  );

  const rfiOptions = useMemo(
    () =>
      rfis.map((r) => ({
        id: r.id,
        label: r.rfi_number || r.title || `RFI ${r.id?.slice(0, 6)}`,
        sublabel: r.title && r.rfi_number ? r.title : r.status || "",
      })),
    [rfis]
  );

  // ── Manning helpers (B2) ──
  const manning = useMemo(
    () => ({ ...emptyManning(), ...asObject(asObject(formData.metadata).manning) }),
    [formData.metadata]
  );

  const setManningField = (trade, key, value) => {
    setFormData((prev) => {
      const meta = asObject(prev.metadata);
      const prevManning = { ...emptyManning(), ...asObject(meta.manning) };
      const nextManning = {
        ...prevManning,
        [trade]: {
          ...prevManning[trade],
          [key]: value,
        },
      };
      return {
        ...prev,
        metadata: { ...meta, manning: nextManning },
      };
    });
  };

  const manningTotals = useMemo(() => {
    let totalCount = 0;
    let totalHours = 0;
    for (const trade of MANNING_TRADES) {
      const row = manning[trade] || { count: 0, hours: 0 };
      const c = Number(row.count) || 0;
      const h = Number(row.hours) || 0;
      totalCount += c;
      totalHours += c * h;
    }
    return { totalCount, totalHours };
  }, [manning]);

  // Auto-sync the legacy headcount / hours_worked columns so the rest
  // of the app (LEMs / dashboard tiles / older reports) stays accurate
  // when the user fills the manning grid. Only kick in when the manning
  // totals exceed the headline numbers — so a user typing the headline
  // numbers manually isn't fought by a zero-manning total.
  useEffect(() => {
    if (manningTotals.totalCount === 0 && manningTotals.totalHours === 0) return;
    setFormData((prev) => {
      const headcountNeedsUpdate = !prev.headcount || Number(prev.headcount) === 0
        || Number(prev.headcount) !== manningTotals.totalCount;
      const hoursNeedsUpdate = !prev.hours_worked || Number(prev.hours_worked) === 0
        || Number(prev.hours_worked) !== manningTotals.totalHours;
      if (!headcountNeedsUpdate && !hoursNeedsUpdate) return prev;
      return {
        ...prev,
        headcount: String(manningTotals.totalCount),
        hours_worked: String(manningTotals.totalHours),
      };
    });
    // Manning grid drives headcount/hours — only re-sync when the totals
    // change, otherwise we'd loop forever fighting our own setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manningTotals.totalCount, manningTotals.totalHours]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.project_id) {
      alert("Select a project before saving a daily log.");
      return;
    }
    onSave({
      ...formData,
      headcount: parseInt(formData.headcount) || 0,
      hours_worked: parseFloat(formData.hours_worked) || 0,
      // temperature and wind_speed are TEXT in the daily_logs schema — keep them
      // as strings (or null) so PostgREST doesn't choke on a number→text mismatch.
      temperature: formData.temperature === "" || formData.temperature == null ? null : String(formData.temperature),
      wind_speed: formData.wind_speed === "" || formData.wind_speed == null ? null : String(formData.wind_speed),
      delay_hours: parseFloat(formData.delay_hours) || 0,
      safety_incidents: parseInt(formData.safety_incidents) || 0,
      photos: asArray(formData.photos),
      related_action_item_ids: asArray(formData.related_action_item_ids),
      related_rfi_ids: asArray(formData.related_rfi_ids),
      metadata: asObject(formData.metadata),
    });
  };

  const set = (field) => (e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  const setField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        padding: "20px",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: "0 0 16px 0",
          textTransform: "uppercase",
          letterSpacing: "0.10em",
        }}
      >
        {isEditing ? "Edit Daily Log" : "New Daily Log"}
      </h3>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Date & Superintendent */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={formData.date} onChange={set("date")} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>Superintendent</label>
            <input type="text" value={formData.superintendent} onChange={set("superintendent")} style={inputStyle} />
          </div>
        </div>

        {/* Weather banner (B1) */}
        {(weatherBanner || weatherLoading) && (
          <WeatherBanner
            banner={weatherBanner}
            loading={weatherLoading}
            address={project?.address}
          />
        )}

        {/* Weather row */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Weather</label>
            <input
              type="text"
              value={formData.weather_description}
              onChange={set("weather_description")}
              placeholder="Sunny, Cloudy, Rainy, etc."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Temperature (°F)</label>
            <input type="number" value={formData.temperature} onChange={set("temperature")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Wind Speed (mph)</label>
            <input type="number" step="0.5" value={formData.wind_speed} onChange={set("wind_speed")} style={inputStyle} />
          </div>
        </div>

        {/* Manning grid (B2) */}
        <ManningSection
          manning={manning}
          totals={manningTotals}
          setManningField={setManningField}
        />

        {/* Headline crew & hours — backed by manning totals when filled */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Crew Name</label>
            <input type="text" value={formData.crew_name} onChange={set("crew_name")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Total Headcount</label>
            <input type="number" value={formData.headcount} onChange={set("headcount")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Total Man-Hours</label>
            <input type="number" step="0.5" value={formData.hours_worked} onChange={set("hours_worked")} style={inputStyle} />
          </div>
        </div>

        {/* Activities */}
        <div>
          <label style={labelStyle}>Activities Performed</label>
          <textarea
            value={formData.activities}
            onChange={set("activities")}
            placeholder="Describe work performed, progress, accomplishments..."
            style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
          />
        </div>

        {/* Equipment & Materials */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Equipment Used</label>
            <textarea value={formData.equipment_used} onChange={set("equipment_used")} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>
          <div>
            <label style={labelStyle}>Materials Received</label>
            <textarea value={formData.materials_received} onChange={set("materials_received")} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>
        </div>

        {/* Delays */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Delays / Issues</label>
            <textarea value={formData.delays} onChange={set("delays")} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>
          <div>
            <label style={labelStyle}>Delay Hours</label>
            <input type="number" step="0.5" value={formData.delay_hours} onChange={set("delay_hours")} style={inputStyle} />
          </div>
        </div>

        {/* Safety */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Safety Incidents</label>
            <input type="number" min="0" value={formData.safety_incidents} onChange={set("safety_incidents")} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Safety Notes</label>
            <input type="text" value={formData.safety_notes} onChange={set("safety_notes")} style={inputStyle} />
          </div>
        </div>

        {/* Related links — Action Items + RFIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <MultiSelectChips
            label="Related Action Items"
            value={formData.related_action_item_ids}
            options={actionItemOptions}
            onChange={(v) => setField("related_action_item_ids", v)}
            placeholder={actionItemOptions.length === 0 ? "No items in project" : "Add action item..."}
          />
          <MultiSelectChips
            label="Related RFIs"
            value={formData.related_rfi_ids}
            options={rfiOptions}
            onChange={(v) => setField("related_rfi_ids", v)}
            placeholder={rfiOptions.length === 0 ? "No RFIs in project" : "Add RFI..."}
          />
        </div>

        {/* Photos */}
        <PhotoStripUploader
          label="Photos"
          value={formData.photos}
          onChange={(v) => setField("photos", v)}
          disabled={isSaving}
        />

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "var(--bg-surface-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              padding: "8px 16px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 700,
              cursor: isSaving ? "not-allowed" : "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            {isSaving ? "Saving..." : isEditing ? "Update Log" : "Save Log"}
          </button>
        </div>
      </form>
    </div>
  );
}

function WeatherBanner({ banner, loading, address }) {
  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "color-mix(in srgb, var(--status-info) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--status-info) 30%, transparent)",
        borderRadius: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-secondary)",
        letterSpacing: "0.06em",
      }}>
        <RefreshCw size={12} className="spin" style={{ animation: "spin 1s linear infinite" }} />
        Pulling weather for {address}…
        <style>{"@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }
  if (!banner) return null;
  if (banner.failed) {
    return (
      <div style={{
        padding: "8px 12px",
        background: "color-mix(in srgb, var(--status-warning) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)",
        borderRadius: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--status-warning)",
        letterSpacing: "0.06em",
      }}>
        Weather auto-fill skipped · {banner.reason}. Fill the fields below manually.
      </div>
    );
  }
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 12px",
      background: "color-mix(in srgb, var(--accent) 8%, transparent)",
      border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
      borderRadius: 8,
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--text-secondary)",
      letterSpacing: "0.06em",
    }}>
      <Cloud size={12} color="var(--accent)" />
      Weather auto-filled from Open-Meteo · click any field below to override
    </div>
  );
}

function ManningSection({ manning, totals, setManningField }) {
  return (
    <div>
      <label style={labelStyle}>
        Manning Breakdown · Total {totals.totalCount} crew · {totals.totalHours} man-hrs
      </label>
      <div style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: 8,
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
        gap: "6px 10px",
        alignItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
      }}>
        <div style={{ color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.06em" }}>Trade</div>
        <div style={{ color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.06em", textAlign: "right" }}>Count</div>
        <div style={{ color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.06em", textAlign: "right" }}>Hrs each</div>
        <div style={{ color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.06em", textAlign: "right" }}>Man-hrs</div>

        {MANNING_TRADES.map((trade) => {
          const row = manning[trade] || { count: 0, hours: 0 };
          const subtotal = (Number(row.count) || 0) * (Number(row.hours) || 0);
          return (
            <React.Fragment key={trade}>
              <div style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{trade}</div>
              <input
                type="number"
                min="0"
                value={row.count || ""}
                onChange={(e) => setManningField(trade, "count", parseInt(e.target.value) || 0)}
                placeholder="0"
                style={{ ...inputStyle, padding: "4px 6px", textAlign: "right" }}
              />
              <input
                type="number"
                min="0"
                step="0.5"
                value={row.hours || ""}
                onChange={(e) => setManningField(trade, "hours", parseFloat(e.target.value) || 0)}
                placeholder="0"
                style={{ ...inputStyle, padding: "4px 6px", textAlign: "right" }}
              />
              <div style={{ textAlign: "right", color: "var(--text-primary)", fontWeight: 600 }}>
                {subtotal || ""}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
