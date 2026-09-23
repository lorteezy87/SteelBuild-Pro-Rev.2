/**
 * CraneLibraryPanel — manage the company's crane fleet and each crane's load
 * charts.
 *
 * A crane has one CONFIGURATION per chart in its chart book (counterweight,
 * outriggers, area of operation, boom type). Each configuration holds the
 * chart grid, pasted from a spreadsheet or typed, and shown back as a preview
 * grid before it can be saved — a paste that shifted a column is the most
 * likely way a wrong number gets in, and seeing the grid is how a person
 * catches it.
 *
 * Custom fixed overlay (no Radix Dialog), no <form> elements — per CLAUDE.md.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AREA_LABELS,
  OUTRIGGER_LABELS,
  configurationSummary,
  craneDisplayName,
  exportLibrary,
  importLibrary,
  newId,
  removeCrane,
  upsertCrane,
  validateCrane,
  type AreaOfOperation,
  type CraneConfiguration,
  type CraneRecord,
  type OutriggerSetup,
} from "@/lib/crane/craneLibrary";
import { chartToText, parseChartText, validateLoadChart, type BoomType, type LoadChart } from "@/lib/crane/loadChart";
import { buttonStyle, hintStyle, inputStyle, labelStyle, mono, noticeStyle, selectStyle } from "./craneUi";

interface Props {
  open: boolean;
  cranes: CraneRecord[];
  onChange: (next: CraneRecord[]) => void;
  onClose: () => void;
  /** Select a configuration for the current pick. */
  onUse?: (craneId: string, configId: string) => void;
  /** True when the browser refused the last save. */
  saveFailed?: boolean;
  /** False with no active organization — the library is kept per company workspace. */
  hasOrg?: boolean;
}

type View = { kind: "list" } | { kind: "crane" } | { kind: "config"; configId: string };

const CHART_PLACEHOLDER = [
  "Paste from a spreadsheet, or type. First row = radii (ft); each row after = boom length (ft), then capacities (lb).",
  "Leave a cell blank or use - where the chart is blank (not rated).",
  "",
  "Boom\\Radius\t20\t30\t40",
  "60\t60000\t40000\t28000",
  "80\t52000\t36000\t-",
].join("\n");

function emptyConfig(): CraneConfiguration {
  return {
    id: newId(),
    label: "",
    boomType: "telescopic",
    counterweight: "",
    outriggers: "full",
    areaOfOperation: "360",
    chartSource: "",
    chart: { boomLengths: [], radii: [], capacities: [] },
  };
}

function emptyCrane(): CraneRecord {
  return { id: newId(), unit: "", makeModel: "", serial: "", configurations: [], updatedAt: "" };
}

export default function CraneLibraryPanel({ open, cranes, onChange, onClose, onUse, saveFailed, hasOrg = true }: Props) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [draft, setDraft] = useState<CraneRecord | null>(null);
  const [cfgDraft, setCfgDraft] = useState<CraneConfiguration | null>(null);
  const [chartText, setChartText] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "red" | "yellow" | "info"; text: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const parsed = useMemo(() => parseChartText(chartText), [chartText]);
  const chartWarnings = useMemo(
    () => (parsed.chart ? validateLoadChart(parsed.chart).warnings.map((w) => w.message) : []),
    [parsed.chart],
  );

  if (!open) return null;

  // ── navigation ──
  const toList = () => { setView({ kind: "list" }); setDraft(null); setCfgDraft(null); setProblems([]); setConfirm(null); };
  const editCrane = (c: CraneRecord | null) => {
    setDraft(c ? structuredClone(c) : emptyCrane());
    setProblems([]); setConfirm(null); setNotice(null);
    setView({ kind: "crane" });
  };
  const editConfig = (cfg: CraneConfiguration | null) => {
    const next = cfg ? structuredClone(cfg) : emptyConfig();
    setCfgDraft(next);
    setChartText(cfg ? chartToText(cfg.chart) : "");
    setProblems([]); setConfirm(null);
    setView({ kind: "config", configId: next.id });
  };

  // ── saves ──
  const saveConfig = () => {
    if (!draft || !cfgDraft) return;
    const errs: string[] = [];
    if (!cfgDraft.label.trim()) errs.push("Give this configuration a name the operator will recognise.");
    if (!cfgDraft.chartSource.trim()) errs.push("Record where the chart came from (chart book, page, revision) — it is printed on every pick.");
    if (!parsed.chart) errs.push(...(parsed.errors.length ? parsed.errors : ["Paste the load chart."]));
    if (errs.length) { setProblems(errs); return; }
    const cfg: CraneConfiguration = { ...cfgDraft, label: cfgDraft.label.trim(), chart: parsed.chart as LoadChart };
    const i = draft.configurations.findIndex((c) => c.id === cfg.id);
    const configurations = i === -1
      ? [...draft.configurations, cfg]
      : draft.configurations.map((c) => (c.id === cfg.id ? cfg : c));
    setDraft({ ...draft, configurations });
    setCfgDraft(null); setProblems([]);
    setView({ kind: "crane" });
  };

  const saveCrane = () => {
    if (!draft) return;
    const trimmed = { ...draft, unit: draft.unit.trim(), makeModel: draft.makeModel.trim(), serial: draft.serial.trim() };
    const errs = validateCrane(trimmed);
    if (trimmed.configurations.length === 0) errs.push("Add at least one configuration with its load chart.");
    if (errs.length) { setProblems(errs); return; }
    onChange(upsertCrane(cranes, trimmed));
    setNotice({ tone: "info", text: `Saved ${craneDisplayName(trimmed)}.` });
    toList();
  };

  // ── import / export ──
  const doExport = () => {
    const blob = new Blob([exportLibrary(cranes)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crane-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const res = importLibrary(await file.text(), cranes);
    if (res.fatal) { setNotice({ tone: "red", text: res.fatal }); return; }
    onChange(res.cranes);
    const parts = [`Imported: ${res.added} added, ${res.updated} updated.`];
    if (res.rejected.length) parts.push(`Refused ${res.rejected.length}: ${res.rejected.join(" · ")}`);
    setNotice({ tone: res.rejected.length ? "yellow" : "info", text: parts.join(" ") });
  };

  const title = view.kind === "list" ? "Crane Library" : view.kind === "crane" ? (draft?.unit.trim() || "New crane") : (cfgDraft?.label.trim() || "New configuration");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        background: "color-mix(in srgb, var(--bg-page) 78%, transparent)", backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crane-library-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(860px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column",
          background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border-strong)",
          borderRadius: 10, overflow: "hidden", boxShadow: "var(--shadow-lg)", outline: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border-default)" }}>
          {view.kind !== "list" && (
            <button type="button" style={buttonStyle()} onClick={() => (view.kind === "config" ? setView({ kind: "crane" }) : toList())}>← Back</button>
          )}
          <h2 id="crane-library-title" style={{ ...mono, margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", flex: 1 }}>
            {title}
          </h2>
          <button type="button" style={buttonStyle()} onClick={onClose} aria-label="Close crane library">Close</button>
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {!hasOrg && (
            <div role="alert" style={noticeStyle("red")}>
              No company workspace is active. The crane library is kept per workspace, so nothing here can be saved until one is selected.
            </div>
          )}
          {hasOrg && saveFailed && (
            <div role="alert" style={noticeStyle("red")}>
              This browser refused to save the library (storage full or private mode). Changes will be lost when the page closes — export them now.
            </div>
          )}
          {notice && <div role="status" style={noticeStyle(notice.tone)}>{notice.text}</div>}
          {problems.length > 0 && (
            <div role="alert" style={noticeStyle("red")}>
              {problems.map((p) => <div key={p}>• {p}</div>)}
            </div>
          )}

          {view.kind === "list" && (
            <>
              <div style={noticeStyle("info")}>
                Enter each crane's charts from ITS chart book — the capacities belong to that machine, its configuration and its serial number.
                The library is stored on this device; export it to share with the crew or back it up.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={buttonStyle("accent")} onClick={() => editCrane(null)}>+ Add crane</button>
                <button type="button" style={buttonStyle()} onClick={doExport} disabled={cranes.length === 0}>Export library</button>
                <button type="button" style={buttonStyle()} onClick={() => fileRef.current?.click()}>Import library</button>
                <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: "none" }} aria-label="Import crane library file" />
              </div>

              {cranes.length === 0 && (
                <div style={{ ...hintStyle, fontSize: 11 }}>No cranes yet. Add one, then add a configuration for each load chart you lift from.</div>
              )}

              {cranes.map((c) => (
                <div key={c.id} style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ ...mono, fontSize: 13, fontWeight: 800, flex: 1 }}>{craneDisplayName(c)}</div>
                    {c.serial && <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>S/N {c.serial}</div>}
                    <button type="button" style={buttonStyle()} onClick={() => editCrane(c)}>Edit</button>
                    {confirm === c.id ? (
                      <>
                        <button type="button" style={buttonStyle("danger")} onClick={() => { onChange(removeCrane(cranes, c.id)); setConfirm(null); }}>Confirm delete</button>
                        <button type="button" style={buttonStyle()} onClick={() => setConfirm(null)}>Keep</button>
                      </>
                    ) : (
                      <button type="button" style={buttonStyle("danger")} onClick={() => setConfirm(c.id)}>Delete</button>
                    )}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {c.configurations.map((cfg) => (
                      <div key={cfg.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ ...mono, fontSize: 11, fontWeight: 700 }}>{cfg.label}</div>
                          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                            {configurationSummary(cfg)} · {cfg.chart.boomLengths.length} boom × {cfg.chart.radii.length} radius
                          </div>
                        </div>
                        {onUse && (
                          <button type="button" style={buttonStyle("accent")} onClick={() => { onUse(c.id, cfg.id); onClose(); }}>Use for this pick</button>
                        )}
                      </div>
                    ))}
                  </div>
                  {confirm === c.id && (
                    <div style={{ ...noticeStyle("red"), marginTop: 8 }}>
                      Delete {c.unit} and its {c.configurations.length} chart{c.configurations.length === 1 ? "" : "s"} from this device? Export first if you have no other copy.
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {view.kind === "crane" && draft && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                <TextField label="Unit / name" value={draft.unit} placeholder="e.g. Crane 14" onChange={(v) => setDraft({ ...draft, unit: v })} />
                <TextField label="Make / model" value={draft.makeModel} placeholder="As on the chart book" onChange={(v) => setDraft({ ...draft, makeModel: v })} />
                <TextField label="Serial number" value={draft.serial} placeholder="Charts are serial-specific" onChange={(v) => setDraft({ ...draft, serial: v })} />
              </div>

              <div style={{ ...labelStyle, marginTop: 6 }}>Configurations — one per chart</div>
              {draft.configurations.length === 0 && <div style={{ ...hintStyle, fontSize: 11 }}>None yet.</div>}
              {draft.configurations.map((cfg) => (
                <div key={cfg.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", border: "1px solid var(--border-default)", borderRadius: 8, padding: 10 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ ...mono, fontSize: 11, fontWeight: 700 }}>{cfg.label}</div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{configurationSummary(cfg)}</div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>Source: {cfg.chartSource}</div>
                  </div>
                  <button type="button" style={buttonStyle()} onClick={() => editConfig(cfg)}>Edit chart</button>
                  {confirm === cfg.id ? (
                    <button type="button" style={buttonStyle("danger")} onClick={() => { setDraft({ ...draft, configurations: draft.configurations.filter((x) => x.id !== cfg.id) }); setConfirm(null); }}>Confirm remove</button>
                  ) : (
                    <button type="button" style={buttonStyle("danger")} onClick={() => setConfirm(cfg.id)}>Remove</button>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={buttonStyle()} onClick={() => editConfig(null)}>+ Add configuration</button>
                <div style={{ flex: 1 }} />
                <button type="button" style={buttonStyle("accent")} onClick={saveCrane}>Save crane</button>
              </div>
            </>
          )}

          {view.kind === "config" && cfgDraft && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                <TextField label="Configuration name" value={cfgDraft.label} placeholder="e.g. Main boom · 58k CWT · full OR" onChange={(v) => setCfgDraft({ ...cfgDraft, label: v })} />
                <TextField label="Counterweight" value={cfgDraft.counterweight} placeholder="As on the chart, e.g. 58,000 lb" onChange={(v) => setCfgDraft({ ...cfgDraft, counterweight: v })} />
                <SelectField<OutriggerSetup> label="Outriggers / base" value={cfgDraft.outriggers} options={OUTRIGGER_LABELS} onChange={(v) => setCfgDraft({ ...cfgDraft, outriggers: v })} />
                <SelectField<AreaOfOperation> label="Area of operation" value={cfgDraft.areaOfOperation} options={AREA_LABELS} onChange={(v) => setCfgDraft({ ...cfgDraft, areaOfOperation: v })} />
                <SelectField<BoomType> label="Boom type" value={cfgDraft.boomType} options={{ telescopic: "Telescopic", lattice: "Lattice (sections)" }} onChange={(v) => setCfgDraft({ ...cfgDraft, boomType: v })} />
                <TextField label="Chart source" value={cfgDraft.chartSource} placeholder="Chart book, page, revision" onChange={(v) => setCfgDraft({ ...cfgDraft, chartSource: v })} />
              </div>
              <div style={hintStyle}>
                {cfgDraft.boomType === "lattice"
                  ? "Lattice: a boom length not listed on the chart is refused — lattice booms can only be rigged at listed lengths."
                  : "Telescopic: between listed boom lengths the LOWER rating of the two is used. Check the chart notes permit intermediate lengths."}
              </div>

              <div>
                <label htmlFor="crane-chart-text" style={labelStyle}>Load chart — gross capacities in lb</label>
                <textarea
                  id="crane-chart-text"
                  value={chartText}
                  onChange={(e) => setChartText(e.target.value)}
                  placeholder={CHART_PLACEHOLDER}
                  rows={9}
                  spellCheck={false}
                  style={{ ...inputStyle, fontSize: 12, whiteSpace: "pre", overflowX: "auto", resize: "vertical" }}
                />
                <div style={hintStyle}>
                  Copying the chart from a spreadsheet pastes tab-separated, which allows 12,500-style thousands commas. In typed CSV use 12500.
                  Blank, -, N/A or NR mean not rated.
                </div>
              </div>

              {chartText.trim() !== "" && !parsed.chart && (
                <div role="alert" style={noticeStyle("red")}>{parsed.errors.map((e) => <div key={e}>• {e}</div>)}</div>
              )}
              {chartWarnings.length > 0 && (
                <div style={noticeStyle("yellow")}>{chartWarnings.map((w) => <div key={w}>⚠ {w}</div>)}</div>
              )}
              {parsed.chart && <ChartPreview chart={parsed.chart} />}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" style={buttonStyle()} onClick={() => setView({ kind: "crane" })}>Cancel</button>
                <button type="button" style={buttonStyle("accent")} onClick={saveConfig}>Save configuration</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Read-back of the parsed chart, so the person pasting can check every cell landed where they meant. */
export function ChartPreview({ chart }: { chart: LoadChart }) {
  const rated = chart.capacities.flat().filter((c) => c !== null).length;
  const cell = { ...mono, fontSize: 11, padding: "4px 8px", borderBottom: "1px solid var(--border-default)", textAlign: "right" as const, whiteSpace: "nowrap" as const };
  return (
    <div>
      <div style={labelStyle}>
        Check the grid — {chart.boomLengths.length} boom length{chart.boomLengths.length === 1 ? "" : "s"} × {chart.radii.length} radi{chart.radii.length === 1 ? "us" : "i"}, {rated} rated cell{rated === 1 ? "" : "s"}
      </div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border-default)", borderRadius: 6 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...cell, textAlign: "left", color: "var(--text-muted)" }}>Boom ft \ Radius ft</th>
              {chart.radii.map((r) => <th key={r} scope="col" style={{ ...cell, color: "var(--text-muted)" }}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {chart.boomLengths.map((b, i) => (
              <tr key={b}>
                <th scope="row" style={{ ...cell, textAlign: "left", color: "var(--text-muted)" }}>{b}</th>
                {chart.capacities[i].map((c, j) => (
                  <td key={chart.radii[j]} style={{ ...cell, color: c === null ? "var(--text-muted)" : "var(--text-primary)" }}>
                    {c === null ? "—" : c.toLocaleString("en-US")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} style={selectStyle}>
        {(Object.keys(options) as T[]).map((k) => <option key={k} value={k}>{options[k]}</option>)}
      </select>
    </label>
  );
}
