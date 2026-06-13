/**
 * ShippingListImportModal — bulk-import a Tekla EPM / FabSuite "Master Shipping
 * List w/ Pieces" report into Deliveries (Phase 4).
 *
 * Complements the AI single-ticket import: this is the deterministic, no-AI
 * bulk path for the multi-load master report. §30 staged review: parse the
 * .xls/.xlsx (SheetJS) → parseShippingList → classify each load create vs
 * already-imported (by load# + ship date) → the user approves → commit. Each
 * load becomes a delivery + its pieces become delivery_items, mirroring
 * commitShippingTicket's mapping (delivery insert → items insert, with the
 * parent rolled back if the items fail so no orphan delivery is left). RLS: field+.
 */

import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { X, Upload, FileText, CheckCircle2, Truck } from "lucide-react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { parseShippingList, classifyLoads } from "@/lib/importShippingList";
import { listPieceProduction, commitProductionRows } from "@/lib/production/repository";

const mono = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const ACCENT = "var(--accent, #3B82F6)";

export default function ShippingListImportModal({ open, projectId, projectName, onClose, onImported }) {
  const trapRef = useFocusTrap(open);
  const fileInput = useRef(null);

  const [step, setStep] = useState("upload"); // upload | parsing | preview | committing | done
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [staged, setStaged] = useState(null);
  const [excluded, setExcluded] = useState(new Set());
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr] = useState(null);
  const [markShipped, setMarkShipped] = useState(true);

  const { data: existingDeliveries = [] } = useQuery({
    queryKey: ["deliveries", projectId, "shipping-import"],
    queryFn: () => entities.Delivery.filter({ project_id: projectId }, "-scheduled_date", 2000),
    enabled: !!open && !!projectId,
  });
  const { data: existingProduction = [] } = useQuery({
    queryKey: ["piece-production", projectId, "shipping-import"],
    queryFn: () => listPieceProduction(projectId),
    enabled: !!open && !!projectId,
  });

  if (!open) return null;

  const reset = () => {
    setStep("upload"); setFile(null); setParsed(null); setStaged(null);
    setExcluded(new Set()); setLastResult(null); setErr(null);
  };

  const acceptFile = (f) => {
    setErr(null);
    if (!f) return;
    if (!/\.(xls|xlsx|csv)$/i.test(f.name)) { setErr("File must be a shipping list (.xls / .xlsx / .csv)."); return; }
    if (f.size > 16 * 1024 * 1024) { setErr("File exceeds 16 MB limit."); return; }
    setFile(f);
  };

  const runParse = async () => {
    if (!file) return;
    setStep("parsing"); setErr(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
      const res = parseShippingList(rows);
      if (!res.ok) throw new Error(res.error || "Could not parse the shipping list.");
      if (res.loads.length === 0) throw new Error("No loads found in the file.");
      setParsed(res);
      setStaged(classifyLoads(res.loads, existingDeliveries));
      setStep("preview");
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("upload");
    }
  };

  const keyOf = (l) => `${l.load_number}|${l.ship_date}`;
  const toggleExclude = (k) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const commitLoad = async (load) => {
    const weightLbs = load.total_weight_lbs;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isHistorical = load.ship_date && new Date(load.ship_date).getTime() <= today.getTime();
    const deliveryPayload = {
      project_id: projectId,
      project_name: projectName || null,
      load_number: load.load_number || null,
      load_category: load.destination || null,
      receiving_location: load.destination || null,
      carrier: load.carrier || load.trailer || null,
      pieces: load.total_qty ?? null,
      weight_tons: weightLbs != null ? Number((weightLbs / 2000).toFixed(3)) : null,
      description: `${load.job_number ? `${load.job_number} — ` : ""}Load ${load.load_number ?? "?"}`,
      status: isHistorical ? "Delivered" : "Scheduled",
      scheduled_date: isHistorical ? null : load.ship_date,
      actual_date: isHistorical ? load.ship_date : null,
      metadata: {
        source: "shipping_list",
        job_number: load.job_number || null,
        trailer: load.trailer || null,
        tbr: load.tbr || null,
        ready_date: load.ready_date || null,
        destination: load.destination || null,
      },
    };
    const { data: delivery, error: delErr } = await supabase.from("deliveries").insert(deliveryPayload).select().single();
    if (delErr) throw new Error(delErr.message);

    if (load.pieces.length > 0) {
      const itemRows = load.pieces.map((p, i) => ({
        delivery_id: delivery.id,
        line_no: i + 1,
        qty: p.quantity ?? 1,
        assembly_mark: p.mark || null,
        sequence: p.sequence || null,
        profile: p.dimensions || null,
        length_text: p.length || null,
        grade: p.grade || null,
        finish: p.finish || null,
      }));
      const { error: itErr } = await supabase.from("delivery_items").insert(itemRows);
      if (itErr) {
        await supabase.from("deliveries").delete().eq("id", delivery.id); // no orphan
        throw new Error(itErr.message);
      }
    }
    return delivery;
  };

  const runCommit = async () => {
    if (!staged || !projectId) return;
    const kept = staged.rows.filter((l) => l.action === "create" && !excluded.has(keyOf(l)));
    if (kept.length === 0) { setErr("No new loads selected to import."); return; }

    setStep("committing"); setErr(null);
    try {
      let created = 0;
      let items = 0;
      let failed = 0;
      for (let i = 0; i < kept.length; i += 5) {
        const chunk = kept.slice(i, i + 5);
        const results = await Promise.allSettled(chunk.map((l) => commitLoad(l)));
        results.forEach((res, j) => {
          if (res.status === "fulfilled") { created += 1; items += chunk[j].pieces.length; }
          else failed += 1;
        });
      }
      // Mark every shipped piece "Shipped" on Production Status (terminal stage).
      let shipped = 0;
      if (markShipped) {
        try {
          shipped = await markPiecesShipped(kept, existingProduction, projectId);
        } catch (e) {
          console.error("[ShippingListImportModal] mark-shipped failed:", e);
        }
      }

      setLastResult({ created, items, failed, shipped });
      toast.success(
        `${created} load${created === 1 ? "" : "s"} imported (${items} pieces)`
        + (shipped ? `, ${shipped} marked shipped` : "")
        + (failed ? `, ${failed} failed` : ""),
      );
      onImported?.({ created, items, failed, shipped });
      setStep("done");
      setTimeout(() => { reset(); onClose(); }, 1800);
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("preview");
    }
  };

  const rows = staged?.rows || [];
  const newRows = rows.filter((l) => l.action === "create");
  const keptCount = newRows.filter((l) => !excluded.has(keyOf(l))).length;
  const totalPieces = parsed?.stats?.pieces || 0;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        ref={trapRef}
        onKeyDown={(e) => { if (e.key === "Escape" && step !== "committing") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 1000, maxWidth: "96vw", maxHeight: "92vh", background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)", borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 4, zIndex: 1201, outline: "none", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <Truck size={18} style={{ color: ACCENT, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              Import Shipping List{projectName ? ` — ${projectName}` : ""}
            </div>
            <div style={{ ...mono, fontSize: 9, color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload" && "STEP 1 · UPLOAD MASTER SHIPPING LIST"}
              {step === "parsing" && "STEP 2 · PARSING"}
              {step === "preview" && `STEP 2 · REVIEW · ${keptCount} NEW LOAD${keptCount === 1 ? "" : "S"}`}
              {step === "committing" && "STEP 3 · IMPORTING"}
              {step === "done" && "DONE"}
            </div>
          </div>
          <button onClick={onClose} disabled={step === "committing"} aria-label="Close"
                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {err && (
            <div role="alert" style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid color-mix(in srgb, var(--status-error) 45%, transparent)", background: "color-mix(in srgb, var(--status-error) 12%, transparent)", color: "var(--text-primary)", fontSize: 12 }}>
              {err}
            </div>
          )}

          {(step === "upload" || step === "parsing") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6 }}>
                Upload the Tekla EPM / FabSuite <strong>Master Shipping List w/ Pieces</strong> (.xls). Each load
                becomes a delivery (load #, carrier, destination, ship date, qty, weight) and its pieces become the
                delivery's line items. Loads already imported (same load # + ship date) are detected and skipped.
              </p>
              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files?.[0]); }}
                style={{ border: "1.5px dashed var(--border-default)", borderRadius: 10, padding: "34px 20px", textAlign: "center", cursor: "pointer", background: "var(--bg-surface-low)" }}
              >
                <Upload size={22} style={{ color: "var(--text-muted)" }} />
                <div style={{ marginTop: 8, color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>{file ? file.name : "Drop the shipping list here, or click to browse"}</div>
                {file && <div style={{ ...mono, marginTop: 4, color: "var(--text-muted)", fontSize: 10 }}>{(file.size / 1024).toFixed(0)} KB</div>}
                <input ref={fileInput} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(e) => acceptFile(e.target.files?.[0])} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="sbd-btn sbd-btn-ghost" onClick={onClose}>Cancel</button>
                <button className="sbd-btn sbd-btn-primary" disabled={!file || step === "parsing"} onClick={runParse}>{step === "parsing" ? "Parsing…" : "Review loads"}</button>
              </div>
            </div>
          )}

          {(step === "preview" || step === "committing") && staged && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <StatChip label="New loads" value={staged.stats.create} tone="var(--status-success)" />
                <StatChip label="Already imported" value={staged.stats.exists} tone="var(--text-muted)" />
                <StatChip label="Pieces" value={totalPieces} tone={ACCENT} />
              </div>

              <div style={{ border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)", zIndex: 1 }}>
                        <th style={th}> </th>
                        <th style={th}>Load</th>
                        <th style={th}>Destination</th>
                        <th style={th}>Carrier</th>
                        <th style={th}>Ship date</th>
                        <th style={{ ...th, textAlign: "right" }}>Qty</th>
                        <th style={{ ...th, textAlign: "right" }}>Weight</th>
                        <th style={{ ...th, textAlign: "right" }}>Pieces</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((l) => {
                        const isNew = l.action === "create";
                        const off = !isNew || excluded.has(keyOf(l));
                        return (
                          <tr key={keyOf(l)} style={{ opacity: off ? 0.45 : 1 }}>
                            <td style={td}>
                              <input type="checkbox" checked={isNew && !excluded.has(keyOf(l))} disabled={!isNew} onChange={() => toggleExclude(keyOf(l))} aria-label={`Include load ${l.load_number}`} />
                            </td>
                            <td style={{ ...td, fontWeight: 700, color: "var(--text-primary)" }}>
                              {l.load_number}{!isNew && <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginLeft: 6 }}>EXISTS</span>}
                            </td>
                            <td style={td}>{l.destination || "—"}</td>
                            <td style={td}>{l.carrier || l.trailer || "—"}</td>
                            <td style={{ ...td, ...mono, fontSize: 11 }}>{l.ship_date || "—"}</td>
                            <td style={{ ...td, textAlign: "right" }} className="sbd-num">{l.total_qty ?? "—"}</td>
                            <td style={{ ...td, textAlign: "right" }} className="sbd-num">{l.total_weight_lbs != null ? `${l.total_weight_lbs}#` : "—"}</td>
                            <td style={{ ...td, textAlign: "right" }} className="sbd-num">{l.pieces.length}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={markShipped} onChange={(e) => setMarkShipped(e.target.checked)} disabled={step === "committing"} />
                Also mark these pieces <strong style={{ color: "var(--status-success)" }}>Shipped</strong> on Production Status
              </label>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}><FileText size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />{file?.name}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="sbd-btn sbd-btn-ghost" onClick={reset} disabled={step === "committing"}>Back</button>
                  <button className="sbd-btn sbd-btn-primary" onClick={runCommit} disabled={step === "committing" || keptCount === 0}>
                    {step === "committing" ? "Importing…" : `Import ${keptCount} load${keptCount === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "done" && lastResult && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <CheckCircle2 size={32} style={{ color: "var(--status-success)" }} />
              <div style={{ marginTop: 10, color: "var(--text-primary)", fontWeight: 700 }}>
                {lastResult.created} load{lastResult.created === 1 ? "" : "s"} imported · {lastResult.items} pieces{lastResult.shipped ? ` · ${lastResult.shipped} marked shipped` : ""}{lastResult.failed ? ` · ${lastResult.failed} failed` : ""}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Upsert every shipped piece into piece_production as "Shipped" (the terminal
 * fab stage), keyed by mark, using the latest ship date when a mark rode more
 * than one load. Reuses the production repository's create/update path.
 */
async function markPiecesShipped(keptLoads, existingProduction, projectId) {
  const shipByMark = new Map();
  for (const load of keptLoads) {
    for (const p of load.pieces || []) {
      const key = String(p.mark || "").trim().toUpperCase();
      if (!key) continue;
      const prev = shipByMark.get(key);
      if (!prev || (load.ship_date && load.ship_date > prev.ship_date)) {
        shipByMark.set(key, { mark: p.mark, ship_date: load.ship_date || null });
      }
    }
  }
  if (shipByMark.size === 0) return 0;

  const byMark = new Map();
  for (const pp of existingProduction || []) {
    const key = String(pp.piece_mark || "").trim().toUpperCase();
    if (key && !byMark.has(key)) byMark.set(key, pp);
  }

  const rows = [...shipByMark.values()].map(({ mark, ship_date }) => {
    const existing = byMark.get(String(mark).trim().toUpperCase()) || null;
    return {
      action: existing ? "update" : "create",
      existing_id: existing ? existing.id : null,
      piece_mark: mark,
      assembly_mark: null,
      status: "Shipped",
      percent_complete: 100,
      ship_date: ship_date || null,
      stage_data: null,
      quantity: null,
      weight: null,
      sequence_number: null,
      erection_area: null,
      external_ref: null,
    };
  });
  const { created, updated } = await commitProductionRows(projectId, rows);
  return created + updated;
}

const th = { textAlign: "left", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--divider)" };
const td = { padding: "7px 10px", borderBottom: "1px solid var(--divider)", color: "var(--text-secondary)" };

function StatChip({ label, value, tone }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
      {label}<strong style={{ color: tone, fontSize: 12 }}>{value}</strong>
    </span>
  );
}
