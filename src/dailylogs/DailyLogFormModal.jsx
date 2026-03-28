import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";

const ACTIVITY_CHIPS = [
  "Set columns",
  "Bolt-up",
  "Decking",
  "Welding",
  "Plumb & align",
  "Crane picks",
  "Delivery received",
];

const nativeSelectStyle = {
  width: "100%",
  background: "var(--bg-sidebar)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  minHeight: 44,
  outline: "none",
};

export default function DailyLogFormModal({
  open,
  onClose,
  onSave,
  log,
  projects,
  nextId,
  lastLog,
  activeProject,
  workPackages = [],
}) {
  const today = new Date().toISOString().split('T')[0];
  const isMobile = window.innerWidth < 640;
  const gridStyle = isMobile
    ? { display: "flex", flexDirection: "column", gap: 12 }
    : { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };

  const [form, setForm] = useState({
    date: today,
    project_id: activeProject?.id || "",
    project_name: activeProject?.name || "",
    superintendent: lastLog?.superintendent || "",
    crew_name: lastLog?.crew_name || "",
    headcount: lastLog?.headcount || 0,
    hours_worked: 0,
    weather_description: "",
    temperature: "",
    wind_speed: "",
    activities: "",
    equipment_used: "",
    delays: "",
    delay_hours: 0,
    safety_incidents: 0,
    safety_notes: "",
    toolbox_talk_completed: false,
    status: "Draft",
    photos: [],
    wp_progress: [],
  });

  const [weatherLoading, setWeatherLoading] = useState(false);
  const [expandDelays, setExpandDelays] = useState(false);
  const [expandPhotos, setExpandPhotos] = useState(false);

  useEffect(() => {
    if (log) {
      setForm({
        ...log,
        wp_progress: log.wp_progress
          ? (typeof log.wp_progress === "string" ? JSON.parse(log.wp_progress) : log.wp_progress)
          : [],
      });
    } else {
      setForm(prev => ({
        ...prev,
        date: today,
        project_id: activeProject?.id || "",
        project_name: activeProject?.name || "",
        superintendent: lastLog?.superintendent || "",
        crew_name: lastLog?.crew_name || "",
        headcount: lastLog?.headcount || 0,
        wp_progress: [],
      }));
    }
  }, [log, open, activeProject, lastLog, today]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const fetchWeather = async () => {
    setWeatherLoading(true);
    try {
      const now = new Date();
      const lat = 33.4484; // Phoenix, AZ default
      const lon = -112.0742;
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`
      );
      const data = await res.json();
      const current = data.current;

      const weatherCodes = {
        0: "Clear",
        1: "Mostly Clear",
        2: "Partly Cloudy",
        3: "Overcast",
        45: "Foggy",
        48: "Foggy",
        51: "Light Drizzle",
        53: "Moderate Drizzle",
        55: "Heavy Drizzle",
        61: "Slight Rain",
        63: "Moderate Rain",
        65: "Heavy Rain",
        71: "Slight Snow",
        73: "Moderate Snow",
        75: "Heavy Snow",
        80: "Slight Rain Showers",
        81: "Moderate Rain Showers",
        82: "Violent Rain Showers",
      };

      set("temperature", Math.round(current.temperature_2m));
      set("wind_speed", Math.round(current.wind_speed_10m));
      set("weather_description", weatherCodes[current.weather_code] || "Clear");
    } catch (err) {
      console.error("Weather fetch failed:", err);
    } finally {
      setWeatherLoading(false);
    }
  };

  const addActivityChip = (activity) => {
    const updated = form.activities ? form.activities + `, ${activity}` : activity;
    set("activities", updated);
  };

  const addWPRow = () => {
    set("wp_progress", [...(form.wp_progress || []), { wp_id: "", percent_complete: "", field_hours: "" }]);
  };

  const updateWPRow = (idx, field, value) => {
    const updated = [...(form.wp_progress || [])];
    updated[idx] = { ...updated[idx], [field]: value };
    // When WP is selected, pre-fill current percent_complete
    if (field === "wp_id") {
      const wp = workPackages.find(w => w.id === value);
      if (wp) updated[idx].percent_complete = wp.percent_complete ?? "";
      updated[idx].wp_number = wp?.wp_number || "";
      updated[idx].wp_name = wp?.name || "";
    }
    set("wp_progress", updated);
  };

  const removeWPRow = (idx) => {
    set("wp_progress", (form.wp_progress || []).filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!form.date || !form.project_id) {
      alert("Please fill in Date and Project");
      return;
    }
    const payload = {
      ...form,
      log_id: log?.log_id || nextId,
      wp_progress: JSON.stringify(form.wp_progress || []),
    };
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{
        maxWidth: 600,
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Sticky header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: "var(--bg-surface-low)", borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "12px 0 10px", marginBottom: 4,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            {log ? "Edit Daily Log" : "Create Daily Log"}
          </div>
          {activeProject?.name && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", letterSpacing: "0.10em", marginTop: 2 }}>
              {activeProject.name} · {form.date}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* BASICS */}
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-muted)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              Basics
            </div>
            <div style={gridStyle}>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} style={{ minHeight: 44 }} />
              </div>
              <div>
                <Label>Project *</Label>
                <select style={nativeSelectStyle} value={form.project_id} onChange={e => {
                  const proj = projects.find(p => p.id === e.target.value);
                  set("project_id", e.target.value);
                  set("project_name", proj?.name || "");
                }}>
                  <option value="">Select project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Superintendent</Label>
                <Input value={form.superintendent} onChange={(e) => set("superintendent", e.target.value)} placeholder="Name" style={{ minHeight: 44 }} />
              </div>
              <div>
                <Label>Crew Name</Label>
                <Input value={form.crew_name} onChange={(e) => set("crew_name", e.target.value)} placeholder="Crew name" style={{ minHeight: 44 }} />
              </div>
              <div>
                <Label>Headcount</Label>
                <Input type="number" value={form.headcount} onChange={(e) => set("headcount", Number(e.target.value))} min="0" style={{ minHeight: 44 }} />
              </div>
              <div>
                <Label>Hours Worked</Label>
                <Input type="number" value={form.hours_worked} onChange={(e) => set("hours_worked", Number(e.target.value))} min="0" step="0.5" style={{ minHeight: 44 }} />
              </div>
            </div>
          </div>

          {/* WEATHER */}
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-muted)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              Weather
              <Button
                size="sm"
                onClick={fetchWeather}
                disabled={weatherLoading}
                style={{
                  background: 'var(--accent-border)',
                  color: 'var(--accent)',
                  fontSize: 9,
                  padding: '4px 8px',
                  minHeight: 36,
                }}
              >
                {weatherLoading ? "Loading..." : "🌤 Get Weather"}
              </Button>
            </div>
            <div style={isMobile ? { display: "flex", flexDirection: "column", gap: 10 } : { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <Label>Conditions</Label>
                <Input value={form.weather_description} onChange={(e) => set("weather_description", e.target.value)} placeholder="Clear, Rainy, etc" />
              </div>
              <div>
                <Label>Temperature (°F)</Label>
                <Input type="number" value={form.temperature} onChange={(e) => set("temperature", e.target.value)} />
              </div>
              <div>
                <Label>Wind Speed (mph)</Label>
                <Input type="number" value={form.wind_speed} onChange={(e) => set("wind_speed", e.target.value)} />
              </div>
            </div>
          </div>

          {/* WORK PERFORMED */}
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'rgba(160,175,210,0.40)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              Work Performed
            </div>
            <Label>Activities</Label>
            <Textarea
              value={form.activities}
              onChange={(e) => set("activities", e.target.value)}
              placeholder="Describe work completed today..."
              style={{ minHeight: 80 }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {ACTIVITY_CHIPS.map(activity => (
                <button
                  key={activity}
                  onClick={() => addActivityChip(activity)}
                  style={{
                    padding: '8px 12px',
                    minHeight: 36,
                    background: 'var(--accent-border)',
                    border: '1px solid var(--accent-border)',
                    borderRadius: 6,
                    color: 'var(--accent)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    cursor: 'pointer',
                  }}
                >
                  + {activity}
                </button>
              ))}
            </div>
            <div>
              <Label style={{ marginTop: 10 }}>Equipment Used</Label>
              <Input value={form.equipment_used} onChange={(e) => set("equipment_used", e.target.value)} placeholder="Equipment used" />
            </div>
          </div>

          {/* WORK PACKAGE PROGRESS */}
          {workPackages.length > 0 && (
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'rgba(160,175,210,0.40)', letterSpacing: '0.12em',
                textTransform: 'uppercase', marginBottom: 10,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                Work Package Progress
                <button
                  onClick={addWPRow}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", minHeight: 36,
                    background: "var(--success-muted)", border: "1px solid var(--success-border)",
                    borderRadius: 6, color: "var(--status-success)", fontFamily: "var(--font-mono)", fontSize: 9,
                    cursor: "pointer", fontWeight: 700,
                  }}
                >
                  <Plus style={{ width: 12, height: 12 }} /> ADD WP
                </button>
              </div>
              {(form.wp_progress || []).map((row, idx) => {
                const wp = workPackages.find(w => w.id === row.wp_id);
                return (
                  <div key={idx} style={{
                    display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr auto",
                    gap: 8, marginBottom: 8, padding: "10px 12px",
                    background: "var(--success-muted)", border: "1px solid var(--success-border)",
                    borderRadius: 8,
                  }}>
                    <div>
                      <label style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(160,175,210,0.40)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Work Package</label>
                      <select style={{ ...nativeSelectStyle, fontSize: 11 }} value={row.wp_id} onChange={e => updateWPRow(idx, "wp_id", e.target.value)}>
                        <option value="">— Select WP —</option>
                        {workPackages.map(w => <option key={w.id} value={w.id}>{w.wp_number} — {w.name}</option>)}
                      </select>
                      {wp && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(160,175,210,0.35)", marginTop: 3 }}>Was: {wp.percent_complete ?? 0}%</div>}
                    </div>
                    <div>
                      <label style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(160,175,210,0.40)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>% Complete</label>
                      <input type="number" style={nativeSelectStyle} value={row.percent_complete} onChange={e => updateWPRow(idx, "percent_complete", e.target.value)} min="0" max="100" />
                    </div>
                    <div>
                      <label style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(160,175,210,0.40)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Field Hours</label>
                      <input type="number" style={nativeSelectStyle} value={row.field_hours} onChange={e => updateWPRow(idx, "field_hours", e.target.value)} min="0" step="0.5" />
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                      <button onClick={() => removeWPRow(idx)} style={{ background: "rgba(255,23,68,0.10)", border: "1px solid rgba(255,23,68,0.25)", borderRadius: 6, color: "#FF1744", padding: "10px", minHeight: 44, cursor: "pointer" }}>
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {(form.wp_progress || []).length === 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(160,175,210,0.25)", padding: "10px 0" }}>No WP progress entries. Click + ADD WP to track progress.</div>
              )}
            </div>
          )}

          {/* DELAYS */}
          <div style={{
            background: 'rgba(255,176,32,0.08)',
            border: '1px solid rgba(255,176,32,0.20)',
            borderRadius: 8,
            padding: 12,
          }}>
            <button
              onClick={() => setExpandDelays(!expandDelays)}
              style={{
                width: '100%',
                textAlign: 'left',
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--status-warning)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {expandDelays ? "▼" : "▶"} Issues & Delays
            </button>
            {expandDelays && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <Label>Delays Description</Label>
                  <Textarea value={form.delays} onChange={(e) => set("delays", e.target.value)} placeholder="Any delays encountered..." style={{ minHeight: 60 }} />
                </div>
                <div>
                  <Label>Delay Hours</Label>
                  <Input type="number" value={form.delay_hours} onChange={(e) => set("delay_hours", Number(e.target.value))} min="0" />
                </div>
              </div>
            )}
          </div>

          {/* SAFETY */}
          <div style={{
            background: 'rgba(0,214,143,0.08)',
            border: '1px solid rgba(0,214,143,0.20)',
            borderRadius: 8,
            padding: 12,
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--status-success)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              Safety
            </div>
            <div style={gridStyle}>
              <div>
                <Label>Safety Incidents</Label>
                <Input type="number" value={form.safety_incidents} onChange={(e) => set("safety_incidents", Number(e.target.value))} min="0" style={{ minHeight: 44 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <Checkbox checked={form.toolbox_talk_completed} onCheckedChange={(v) => set("toolbox_talk_completed", v)} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11 }}>Toolbox talk completed</span>
                </label>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <Label>Safety Notes</Label>
              <Textarea value={form.safety_notes} onChange={(e) => set("safety_notes", e.target.value)} placeholder="Any safety concerns or notes..." style={{ minHeight: 60 }} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() => {
              set("status", "Draft");
              handleSave();
            }}
            style={{
              color: 'var(--accent)',
              borderColor: 'var(--accent-border)',
            }}
          >
            Save Draft
          </Button>
          <Button
            onClick={() => {
              set("status", "Submitted");
              handleSave();
            }}
            style={{
              background: 'var(--accent)',
              color: '#fff',
            }}
          >
            Submit Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}