/**
 * ExportFabReleaseModal — Options dialog for the Fab Release / Turnover /
 * Claims package exports.
 *
 * One component, three modes (controlled by `kind`):
 *   - "fab_release"  → drawings approved for fabrication (manifest CSV + README)
 *   - "turnover"     → same approval filter but framed as "turnover package"
 *   - "claims"       → everything (drawings + RFIs + change orders + photos)
 *                      grouped by date for legal/insurance.
 *
 * jszip is NOT in package.json (verified 2026-05-03). The fallback
 * delivers:
 *   - manifest.csv  (downloaded directly via Blob)
 *   - README.md     (downloaded directly via Blob)
 *   - URLS.txt      (one signed URL per drawing for manual download)
 * The user is told this in the modal.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { resolveFileUrl } from "@/api/supabaseClient";
import { computeFabReleaseGate, linkedRfiNumbers } from "@/lib/fabReleaseGate";
import { recordFabRelease, FabReleaseBlockedError } from "@/lib/fabRelease/releaseStatus";
import {
  isApprovedForFab,
  isClaimable,
  groupBySet,
  buildFabManifestCsv,
  buildClaimsManifestCsv,
  buildReadme,
  suggestPackageName,
  downloadTextFile,
} from "@/lib/exports/fabRelease";

/** Slice 8 — submittal + signoff evidence for IFC/Released readiness. */
function useFabApprovalEvidence(open, projectId, drawings) {
  const [evidence, setEvidence] = useState({
    submittals: [],
    drawingSignoffs: [],
    drawingRevisions: [],
  });

  useEffect(() => {
    if (!open || !projectId) {
      setEvidence({ submittals: [], drawingSignoffs: [], drawingRevisions: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const drawingIds = (drawings || []).map((d) => d?.id).filter(Boolean);
        const [subs, signoffs, revisions] = await Promise.all([
          supabase
            .from("submittals")
            .select("id, status, ball_in_court, drawing_set_ids, submitted_date, updated_at, round_number, is_deleted, deleted_at")
            .eq("project_id", projectId)
            .eq("is_deleted", false),
          drawingIds.length
            ? supabase
                .from("drawing_signoffs")
                .select("drawing_id, drawing_revision_id, stamp_type, is_voided")
                .in("drawing_id", drawingIds)
                .eq("is_voided", false)
            : Promise.resolve({ data: [], error: null }),
          drawingIds.length
            ? supabase
                .from("drawing_revisions")
                .select("id, drawing_id, is_current, archived_at")
                .in("drawing_id", drawingIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (cancelled) return;
        setEvidence({
          submittals: subs.data || [],
          drawingSignoffs: signoffs.data || [],
          drawingRevisions: revisions.data || [],
        });
      } catch (err) {
        console.warn("[ExportFabReleaseModal] approval evidence fetch failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [open, projectId, drawings]);

  return evidence;
}

const mono = { fontFamily: "var(--font-mono, ui-monospace, monospace)" };

const labelStyle = {
  ...mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.15em", color: "var(--text-muted)", display: "block", marginBottom: 6,
};

const btnBase = {
  ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
  padding: "8px 16px", borderRadius: 2, border: "1px solid var(--border-default)",
  cursor: "pointer", textTransform: "uppercase",
};

const KIND_CONFIG = {
  fab_release: {
    title: "Export Fab Release Package",
    eyebrow: "FABRICATION RELEASE",
    description: "IFC / Released drawings (submittal-derived) bundled with a manifest CSV and a README listing the contents, ready to hand to the fabricator.",
    filterLabel: "IFC / Released for fabrication",
  },
  turnover: {
    title: "Export Turnover Package",
    eyebrow: "TURNOVER",
    description: "IFC / Released drawings with manifest and README, ready for owner turnover.",
    filterLabel: "IFC / Released",
  },
  claims: {
    title: "Export Claims Package",
    eyebrow: "CLAIMS · LEGAL / INSURANCE",
    description: "Everything in scope (drawings, RFIs, change orders, photos linked to drawings) grouped by date for legal / insurance documentation.",
    filterLabel: "All (chronological)",
  },
};

// Leading glyph per gate-reason kind for the "not ready for fab" panel.
const GATE_REASON_ICON = {
  open_rfis: "❓",
  rejected_sheets: "⊘",
  revision_conflict: "⟳",
  unresolved_revision: "◎",
  not_ifc_ready: "⊘",
  missing_signoffs: "✍",
};

export default function ExportFabReleaseModal({
  open,
  onClose,
  kind = "fab_release",
  project,
  drawings = [],
}) {
  const cfg = KIND_CONFIG[kind] || KIND_CONFIG.fab_release;
  const [busy, setBusy] = useState(false);
  const approvalEvidence = useFabApprovalEvidence(open, project?.id, drawings);

  // For fab_release / turnover the filter is identical (IFC/Released).
  // For claims we include everything not soft-deleted.
  const filteredDrawings = useMemo(() => {
    const list = drawings || [];
    if (kind === "claims") return list.filter(isClaimable);
    return list.filter((d) => isApprovedForFab(d, approvalEvidence));
  }, [drawings, kind, approvalEvidence]);

  const groups = useMemo(() => groupBySet(filteredDrawings), [filteredDrawings]);

  // The "Ready for Fab?" gate evaluates the full sheet membership of the sets
  // being released (not just the approved subset that ships), so it can see
  // rejected / superseded / RFI'd sheets sitting in those sets. Keyed by set id
  // (or name as a fallback). Required sign-offs are opt-in per project.
  const requireSignoffs = !!project?.metadata?.require_fab_signoffs;
  const packageDrawings = useMemo(() => {
    if (kind === "claims") return filteredDrawings;
    const setKey = (d) => d?.drawing_set_id || d?.drawing_set_name || null;
    const releasedSets = new Set(filteredDrawings.map(setKey).filter(Boolean));
    if (releasedSets.size === 0) return filteredDrawings;
    return (drawings || []).filter((d) => d && !d.is_deleted && releasedSets.has(setKey(d)));
  }, [drawings, filteredDrawings, kind]);

  // ── Fab Release gate ─────────────────────────────────────────────────
  // Don't let a package ship to the shop while an open RFI references one of
  // its sheets. Fetch the RFIs linked from the matched drawings and compute a
  // deterministic gate; a PM can override with an explicit acknowledgement.
  // (Gate applies to fab_release / turnover; claims packages bundle everything
  // by design, so they're never gated.)
  const gated = kind !== "claims";
  const [linkedRfis, setLinkedRfis] = useState([]);
  const [gateSignoffs, setGateSignoffs] = useState([]);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setOverride(false);
    setOverrideReason("");
    setLinkedRfis([]);
    setGateSignoffs([]);
    if (!gated || !project?.id) return;
    let cancelled = false;
    (async () => {
      // RFIs — linked_rfi_ids is a CSV of RFI *numbers*, so we can't query by id;
      // fetch the project's (non-deleted) RFIs and let the gate match by number.
      if (packageDrawings.some((d) => linkedRfiNumbers(d).length > 0)) {
        try {
          const { data, error } = await supabase
            .from("rfis")
            .select("id, rfi_number, title, status, is_deleted, ball_in_court")
            .eq("project_id", project.id)
            .eq("is_deleted", false);
          if (!cancelled && !error) setLinkedRfis(data || []);
        } catch (err) {
          console.warn("[ExportFabReleaseModal] RFI fetch for fab gate failed:", err);
        }
      }
      // Sign-offs — only when the project requires them for release.
      if (requireSignoffs) {
        try {
          const ids = packageDrawings.map((d) => d.id).filter(Boolean);
          if (ids.length) {
            const { data, error } = await supabase
              .from("drawing_signoffs")
              .select("drawing_id, stamp_type, status, is_voided")
              .in("drawing_id", ids)
              .eq("is_voided", false);
            if (!cancelled && !error) setGateSignoffs(data || []);
          }
        } catch (err) {
          console.warn("[ExportFabReleaseModal] sign-off fetch for fab gate failed:", err);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, gated, project?.id, packageDrawings, requireSignoffs]);

  const gate = useMemo(
    () => (gated
      ? computeFabReleaseGate({
          drawings: packageDrawings,
          rfis: linkedRfis,
          signoffs: gateSignoffs,
          requireSignoffs,
          submittals: approvalEvidence.submittals,
          drawingRevisions: approvalEvidence.drawingRevisions,
        })
      : { blocked: false, reasons: [], blockingRfis: [], affectedSheets: [], blockingCount: 0 }),
    [gated, packageDrawings, linkedRfis, gateSignoffs, requireSignoffs, approvalEvidence],
  );
  // Override now requires a written reason (the server records it and refuses an
  // empty-reason override). The button stays locked until the reason is filled.
  const overrideReady = override && overrideReason.trim().length > 0;
  const exportLocked = gate.blocked && !overrideReady;

  if (!open) return null;

  const handleExport = async () => {
    if (!project?.id) {
      toast.error("No active project.");
      return;
    }
    if (filteredDrawings.length === 0 && kind !== "claims") {
      toast.error(`No drawings match: ${cfg.filterLabel}.`);
      return;
    }
    if (exportLocked) {
      toast.error(`This package isn't ready for fab (${gate.reasons.length} issue${gate.reasons.length === 1 ? "" : "s"}) — resolve them or check the PM override.`);
      return;
    }

    setBusy(true);
    try {
      const stem = suggestPackageName({ kind, project });

      // ── Server-arbitrated fab-release gate (fab_release / turnover only) ──
      // The exported files are a convenience artifact; the AUTHORITATIVE release
      // is the server record in fab_release_log, whose trigger REFUSES a release
      // while open RFIs reference the package's sheets unless a PM override
      // reason is supplied (and it snapshots which RFIs were open). This is what
      // makes the server the single arbiter — a bypassed client gate still can't
      // record a release. We record it BEFORE generating the package.
      if (gated) {
        try {
          await recordFabRelease(supabase, {
            projectId: project.id,
            packageKind: kind,
            packageName: stem,
            drawingIds: filteredDrawings.map((d) => d.id).filter(Boolean),
            packageDrawingIds: packageDrawings.map((d) => d.id).filter(Boolean),
            overrideReason: override ? overrideReason : null,
          });
        } catch (err) {
          if (err instanceof FabReleaseBlockedError) {
            const detail = err.blockers?.length
              ? err.blockers.map((b) => {
                  const sheets = (b.sheet_numbers || []).filter(Boolean);
                  const rfis = (b.rfi_numbers || []).filter(Boolean);
                  if (rfis.length) return `${b.title} (${rfis.join(", ")})`;
                  if (sheets.length) return `${b.title}: ${sheets.join(", ")}`;
                  return b.title;
                }).join(" · ")
              : (err.blockingRfiNumbers.length
                ? `open RFI${err.blockingRfiNumbers.length === 1 ? "" : "s"} (${err.blockingRfiNumbers.join(", ")})`
                : err.message);
            toast.error(`Release blocked: ${detail}. Resolve each blocker or check the PM override and give a reason.`);
          } else {
            toast.error(`Could not record the release: ${err?.message || "Unknown error"}`);
          }
          setBusy(false);
          return;
        }
      }

      // ── Resolve drawing file URLs (best-effort — non-fatal) ───────────
      const urlLines = [];
      for (const d of filteredDrawings) {
        if (!d.file_url) continue;
        try {
          const u = await resolveFileUrl(d.file_url);
          urlLines.push(`${d.drawing_set_name || ""} | ${d.sheet_number || ""} | ${d.title || ""} | ${u || d.file_url}`);
        } catch {
          urlLines.push(`${d.drawing_set_name || ""} | ${d.sheet_number || ""} | ${d.title || ""} | ${d.file_url}`);
        }
      }

      // ── Sign-offs (only meaningful for fab_release / turnover) ────────
      let signoffs = [];
      if (kind !== "claims" && filteredDrawings.length > 0) {
        try {
          const ids = filteredDrawings.map((d) => d.id).filter(Boolean);
          if (ids.length) {
            const { data, error } = await supabase
              .from("drawing_signoffs")
              .select("drawing_id, signed_by, signed_at, status")
              .in("drawing_id", ids)
              .eq("is_voided", false);
            if (error) console.warn("[ExportFabReleaseModal] signoffs fetch failed:", error);
            else signoffs = data || [];
          }
        } catch (err) {
          console.warn("[ExportFabReleaseModal] signoffs fetch threw:", err);
        }
      }

      // ── For claims, also pull RFIs / COs / photos for the project ────
      let claimsExtras = { rfis: [], changeOrders: [], photos: [] };
      if (kind === "claims") {
        try {
          const [rfisQ, cosQ, photosQ] = await Promise.allSettled([
            // NOTE: rfis has NO `subject` column (use title) — selecting it made
            // PostgREST reject the whole query, and allSettled swallowed the
            // error, so claims packages silently shipped ZERO RFIs.
            supabase.from("rfis").select("id, rfi_number, title, question, status, submitted_date, created_at, author, created_by").eq("project_id", project.id).eq("is_deleted", false),
            supabase.from("change_orders").select("id, co_number, title, description, status, issued_date, created_at, issued_by, created_by").eq("project_id", project.id).eq("is_deleted", false),
            supabase.from("photos").select("id, caption, file_name, taken_at, created_at, uploaded_by, linked_drawing_id").eq("project_id", project.id).eq("is_deleted", false),
          ]);
          if (rfisQ.status === "fulfilled" && !rfisQ.value.error) claimsExtras.rfis = rfisQ.value.data || [];
          if (cosQ.status === "fulfilled" && !cosQ.value.error) claimsExtras.changeOrders = cosQ.value.data || [];
          if (photosQ.status === "fulfilled" && !photosQ.value.error) claimsExtras.photos = photosQ.value.data || [];
        } catch (err) {
          console.warn("[ExportFabReleaseModal] claims extras fetch threw:", err);
        }
      }

      // ── Build manifest CSV ────────────────────────────────────────────
      const manifestCsv = kind === "claims"
        ? buildClaimsManifestCsv({ drawings: filteredDrawings, ...claimsExtras })
        : buildFabManifestCsv(filteredDrawings, signoffs);

      // ── Build README ──────────────────────────────────────────────────
      const totalCount = kind === "claims"
        ? filteredDrawings.length + claimsExtras.rfis.length + claimsExtras.changeOrders.length + claimsExtras.photos.length
        : filteredDrawings.length;
      const readme = buildReadme({
        kind: cfg.eyebrow.split("·")[0].trim() || cfg.title,
        project,
        groups,
        totalCount,
        zipped: false,
      });

      downloadTextFile(manifestCsv, `${stem}_manifest.csv`, "text/csv;charset=utf-8");
      downloadTextFile(readme, `${stem}_README.md`, "text/markdown;charset=utf-8");
      if (urlLines.length > 0) {
        downloadTextFile(
          ["set_name | sheet_number | title | file_url", ...urlLines].join("\n"),
          `${stem}_URLS.txt`,
          "text/plain;charset=utf-8"
        );
      }

      // (The release + any override are recorded server-side via recordFabRelease
      // above — the old best-effort fab_release_overrides insert is superseded.)
      toast.success(`Package exported (${totalCount} item${totalCount === 1 ? "" : "s"})`);
      onClose?.();
    } catch (err) {
      console.error("[ExportFabReleaseModal] export failed:", err);
      toast.error(`Export failed: ${err?.message || "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="sbd-card-strong"
        style={{
          background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card, 4px)", width: 540, maxWidth: "92vw",
          padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--accent)", marginBottom: 6 }}>
          {cfg.eyebrow}
        </div>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: 18, color: "var(--text-primary)" }}>
          {cfg.title}
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, marginBottom: 18, lineHeight: 1.5 }}>
          {cfg.description}
        </p>

        <div style={{
          background: "var(--bg-page)", border: "1px solid var(--border-default)",
          borderRadius: 2, padding: "12px 14px", marginBottom: 14,
        }}>
          <span style={labelStyle}>Filter</span>
          <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 8 }}>{cfg.filterLabel}</div>
          <span style={labelStyle}>Drawings matched</span>
          <div style={{ ...mono, fontSize: 18, color: "var(--accent)", fontWeight: 700 }}>
            {filteredDrawings.length}
          </div>
          {groups.length > 0 && (
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
              Across {groups.length} drawing set{groups.length === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {gated && gate.blocked && (
          <div style={{
            background: "color-mix(in srgb, var(--status-error) 12%, transparent)",
            border: "1px solid var(--status-error)",
            borderRadius: 2, padding: "12px 14px", marginBottom: 14,
          }}>
            <div style={{ ...mono, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "var(--status-error)", textTransform: "uppercase", marginBottom: 8 }}>
              ⚠ Not ready for fab — {gate.reasons.length} issue{gate.reasons.length === 1 ? "" : "s"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
              {gate.reasons.map((reason) => {
                const items = reason.rfis || reason.sheets || [];
                return (
                  <div key={reason.kind}>
                    <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>
                      {GATE_REASON_ICON[reason.kind] || "•"} {reason.title}
                    </div>
                    {reason.action && (
                      <div style={{ ...mono, fontSize: 10.5, color: "var(--status-warning)", paddingLeft: 16, marginBottom: 3 }}>
                        Next: {reason.action}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 16 }}>
                      {items.slice(0, 4).map((item, i) => (
                        <div key={item.id || i} style={{ ...mono, fontSize: 10.5, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {reason.kind === "open_rfis"
                            ? `${item.rfi_number || "RFI"} — ${item.title || "—"}${item.status ? ` · ${item.status}` : ""}`
                            : `${item.sheet_number || item.id}${item.title ? ` — ${item.title}` : ""}`}
                        </div>
                      ))}
                      {items.length > 4 && (
                        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>+ {items.length - 4} more…</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              <span><strong style={{ color: "var(--text-primary)" }}>PM override</strong> — release despite these issues (I accept the risk; this is recorded).</span>
            </label>
            {override && (
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                placeholder="Override reason (required) — why release despite these issues?"
                style={{
                  ...mono, marginTop: 8, width: "100%", boxSizing: "border-box",
                  fontSize: 11, padding: "8px 10px", borderRadius: 2,
                  background: "var(--bg-input, var(--bg-surface-low))",
                  border: `1px solid ${overrideReason.trim() ? "var(--border-default)" : "var(--status-error)"}`,
                  color: "var(--text-primary)", outline: "none", resize: "vertical",
                }}
              />
            )}
          </div>
        )}

        <div style={{
          background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.3)",
          borderRadius: 2, padding: "10px 12px", marginBottom: 18,
          fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5,
        }}>
          <strong style={{ color: "#60A5FA" }}>Note:</strong> Zip packaging isn't enabled in this build.
          You'll receive separate <code>manifest.csv</code>, <code>README.md</code>, and <code>URLS.txt</code> files.
          Use the URLs file to download each drawing PDF directly.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ ...btnBase, background: "var(--bg-page)", color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={busy || (kind !== "claims" && filteredDrawings.length === 0) || exportLocked}
            title={exportLocked ? "Resolve the blocking issues or check the PM override to release" : undefined}
            style={{
              ...btnBase,
              background: exportLocked ? "var(--bg-page)" : "rgba(200,155,32,0.2)",
              borderColor: exportLocked ? "var(--border-default)" : "var(--accent)",
              color: exportLocked ? "var(--text-muted)" : "var(--accent)",
              opacity: busy || exportLocked ? 0.6 : 1,
              cursor: exportLocked ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Exporting…" : exportLocked ? "Not ready for fab" : "Export Package"}
          </button>
        </div>
      </div>
    </div>
  );
}
