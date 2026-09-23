/**
 * CraneChartSource — pick the crane and configuration, and show the rated
 * capacity read off its chart WITH its provenance: which cell governed, and
 * why that one. An operator should be able to put a finger on the same cell in
 * the chart book and see the same number.
 */
import { configurationSummary, craneDisplayName, type CraneRecord } from "@/lib/crane/craneLibrary";
import type { ChartLookup } from "@/lib/crane/loadChart";
import { buttonStyle, hintStyle, labelStyle, mono, noticeStyle, selectStyle } from "./craneUi";

interface Props {
  cranes: CraneRecord[];
  craneId: string;
  configId: string;
  onSelect: (craneId: string, configId: string) => void;
  /** Result for the entered boom length and radius; null until both are entered. */
  lookup: ChartLookup | null;
  onManage: () => void;
}

export default function CraneChartSource({ cranes, craneId, configId, onSelect, lookup, onManage }: Props) {
  const crane = cranes.find((c) => c.id === craneId) ?? null;
  const config = crane?.configurations.find((c) => c.id === configId) ?? null;

  if (cranes.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={noticeStyle("info")}>
          No cranes in the library yet. Add your crane and paste its load chart once — every pick after that reads rated capacity straight off the chart.
        </div>
        <div><button type="button" style={buttonStyle("accent")} onClick={onManage}>Open crane library</button></div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "block" }}>
          <span style={labelStyle}>Crane</span>
          <select
            value={crane ? craneId : ""}
            onChange={(e) => {
              const next = cranes.find((c) => c.id === e.target.value);
              onSelect(e.target.value, next?.configurations[0]?.id ?? "");
            }}
            style={selectStyle}
          >
            {!crane && <option value="">Choose a crane…</option>}
            {cranes.map((c) => <option key={c.id} value={c.id}>{craneDisplayName(c)}</option>)}
          </select>
        </label>
        <label style={{ display: "block" }}>
          <span style={labelStyle}>Configuration / chart</span>
          <select
            value={config ? configId : ""}
            onChange={(e) => onSelect(craneId, e.target.value)}
            style={selectStyle}
            disabled={!crane}
          >
            {!config && <option value="">Choose a chart…</option>}
            {(crane?.configurations ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>

      {config && (
        <div style={{ ...hintStyle, marginTop: -4 }}>
          {configurationSummary(config)}
          {crane?.serial ? ` · S/N ${crane.serial}` : ""}
          <br />Chart source: {config.chartSource}
        </div>
      )}

      {config && !lookup && (
        <div style={{ ...hintStyle, marginTop: 0 }}>Enter the boom length and working radius below to read the rated capacity.</div>
      )}

      {lookup && lookup.ok === true && (
        <div data-testid="chart-capacity" style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 12px" }}>
          <div style={labelStyle}>Rated capacity from chart</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...mono, fontSize: 22, fontWeight: 800 }}>{Math.round(lookup.capacity).toLocaleString("en-US")} lb</span>
            <span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: lookup.exact ? "var(--text-secondary)" : "var(--status-warning)" }}>
              {lookup.exact ? "EXACT CELL" : "LOWER BRACKETING CELL"}
            </span>
          </div>
          <div style={{ ...hintStyle, fontSize: 10 }}>{lookup.basis}</div>
        </div>
      )}

      {lookup && lookup.ok === false && (
        <div role="alert" data-testid="chart-refusal" style={noticeStyle("red")}>
          <strong>NOT RATED.</strong> {lookup.message}
        </div>
      )}

      <div><button type="button" style={buttonStyle()} onClick={onManage}>Manage crane library</button></div>
    </div>
  );
}
