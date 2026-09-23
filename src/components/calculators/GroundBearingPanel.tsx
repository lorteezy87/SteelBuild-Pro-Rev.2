/**
 * GroundBearingPanel — outrigger pad / crane mat check.
 *
 * Self-contained: its inputs do not feed the pick math, and the pick math does
 * not feed it. The outrigger reaction is deliberately NOT derived from the
 * pick — it depends on the crane's own weight, counterweight and slew angle,
 * which only the manufacturer's outrigger-load data gives.
 */
import { useState } from "react";
import { IBC_PRESUMPTIVE_BEARING, groundBearing } from "@/lib/crane/groundBearing";
import { isBlankInput, parseNumericInput } from "@/utils/cranePickMath";
import { STATUS_COLOR, hintStyle, inputStyle, labelStyle, mono, noticeStyle, selectStyle } from "./craneUi";

const STATUS_TEXT = { green: "OK", yellow: "LITTLE MARGIN", red: "OVER ALLOWABLE" } as const;

export default function GroundBearingPanel() {
  const [reaction, setReaction] = useState("");
  const [matWeight, setMatWeight] = useState("");
  const [len, setLen] = useState("");
  const [wid, setWid] = useState("");
  const [allowable, setAllowable] = useState("");

  const n = (raw: string) => parseNumericInput(raw);
  const bad = (raw: string) => !isBlankInput(raw) && !Number.isFinite(n(raw));
  const invalid = [
    [reaction, "Outrigger reaction"], [matWeight, "Mat weight"], [len, "Mat length"], [wid, "Mat width"], [allowable, "Allowable bearing"],
  ].filter(([raw]) => bad(raw)).map(([, label]) => `${label} isn't a number.`);

  const result = invalid.length === 0
    ? groundBearing({
        outriggerReaction: n(reaction),
        matWeight: isBlankInput(matWeight) ? 0 : n(matWeight),
        padLength: n(len),
        padWidth: n(wid),
        allowableBearing: n(allowable),
      })
    : null;

  const presetValue = IBC_PRESUMPTIVE_BEARING.find((p) => String(p.psf) === allowable.replace(/,/g, "").trim())?.psf ?? "";

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, hint?: string) => (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      <input type="text" inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} style={inputStyle} />
      {hint && <span style={{ ...hintStyle, display: "block" }}>{hint}</span>}
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {field("Max outrigger reaction (lb)", reaction, setReaction, "e.g. 85,000",
        "From the manufacturer's outrigger-load chart or calculator — the MAXIMUM single float for the lift's slew range, not the average.")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {field("Mat length (ft)", len, setLen, "e.g. 4")}
        {field("Mat width (ft)", wid, setWid, "e.g. 4")}
        {field("Mat weight (lb)", matWeight, setMatWeight, "0")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
        {field("Allowable bearing (psf)", allowable, setAllowable, "From the geotech report")}
        <label style={{ display: "block" }}>
          <span style={labelStyle}>Or presumptive (IBC 1806.2)</span>
          <select value={presetValue} onChange={(e) => setAllowable(e.target.value)} style={selectStyle}>
            <option value="">Choose soil class…</option>
            {IBC_PRESUMPTIVE_BEARING.map((p) => <option key={p.psf} value={p.psf}>{p.soil} — {p.psf.toLocaleString("en-US")} psf</option>)}
          </select>
        </label>
      </div>
      <div style={{ ...hintStyle, marginTop: -4 }}>
        Presumptive values assume undisturbed native soil. Fill, backfill, trench lines, soft or wet ground have NO presumptive value — get a geotechnical allowable for the set-up location.
      </div>

      {invalid.length > 0 && <div role="alert" style={noticeStyle("red")}>{invalid.map((m) => <div key={m}>• {m}</div>)}</div>}

      {result && (
        <div data-testid="ground-bearing-result" style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: STATUS_COLOR[result.status] }}>
              {Math.round(result.pressure).toLocaleString("en-US")} psf
            </span>
            <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: STATUS_COLOR[result.status] }}>
              {result.utilization.toFixed(0)}% of allowable · {STATUS_TEXT[result.status]}
            </span>
          </div>
          <div style={{ ...mono, fontSize: 11, color: "var(--text-secondary)" }}>
            {Math.round(result.totalLoad).toLocaleString("en-US")} lb over {result.area.toFixed(1)} ft².
            {" "}Needs {result.requiredArea.toFixed(1)} ft² at this allowable — a {result.requiredSquareSide.toFixed(1)} ft × {result.requiredSquareSide.toFixed(1)} ft mat or larger.
          </div>
          <div style={{ ...hintStyle, marginTop: 0 }}>
            Assumes the mat is stiff enough to spread the load over its whole footprint. A flexible or oversized timber mat under a small float does not — have its effective bearing area checked.
          </div>
        </div>
      )}
    </div>
  );
}
