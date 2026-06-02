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
import { computeFabReleaseGate } from "@/lib/fabReleaseGate";
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
    description: "Approved drawings (Released / approved sets) bundled with a manifest CSV and a README listing the contents, ready to hand to the fabricator.",
    filterLabel: "Approved for fabrication",
  },
  turnover: {
    title: "Export Turnover Package",
    eyebrow: "TURNOVER",
    description: "Approved-for-construction or approved-for-fabrication drawings with manifest and README, ready for owner turnover.",
    filterLabel: "Approved (construction / fab)",
  },
  claims: {
    title: "Export Claims Package",
    eyebrow: "CLAIMS · LEGAL / INSURANCE",
    description: "Everything in scope (drawings, RFIs, change orders, photos linked to drawings) grouped by date for legal / insurance documentation.",
    filterLabel: "All (chronological)",
  },
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

  // For fab_release / turnover the filter is identical (both predicates
  // resolve to the same conditions today). For claims we include
  // everything not soft-deleted.
  const filteredDrawings = useMemo(() => {
    const list = drawings || [];
    if (kind === "claims") return list.filter(isClaimable);
    return list.filter(isApprovedForFab);
  }, [drawings, kind]);

  const groups = useMemo(() => groupBySet(filteredDrawings), [filteredDrawings]);

  // ── Fab Release gate ─────────────────────────────────────────────────
  // Don't let a package ship to the shop while an open RFI references one of
  // its sheets. Fetch the RFIs linked from the matched drawings and compute a
  // deterministic gate; a PM can override with an explicit acknowledgement.
  // (Gate applies to fab_release / turnover; claims packages bundle everything
  // by design, so they're never gated.)
  const gated = kind !== "claims";
  const [linkedRfis, setLinkedRfis] = useState([]);
  const [override, setOverride] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOverride(false);
    if (!gated || !project?.id) {
      setLinkedRfis([]);
      return;
    }
    const linkedIds = Array.from(
      new Set(
        filteredDrawings.flatMap((d) =>
          Array.isArray(d?.linked_rfi_ids) ? d.linked_rfi_ids : [],
        ).filter(Boolean).map(String),
      ),
    );
    if (linkedIds.length === 0) {
      setLinkedRfis([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("rfis")
          .select("id, rfi_number, subject, title, status, is_deleted, ball_in_court")
          .eq("project_id", project.id)
          .eq("is_deleted", false)
          .in("id", linkedIds);
        if (!cancelled && !error) setLinkedRfis(data || []);
      } catch (err) {
        console.warn("[ExportFabReleaseModal] linked-RFI fetch for gate failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [open, gated, project?.id, filteredDrawings]);

  const gate = useMemo(
    () => (gated
      ? computeFabReleaseGate({ drawings: filteredDrawings, rfis: linkedRfis })
      : { blocked: false, blockingRfis: [], affectedSheets: [], blockingCount: 0 }),
    [gated, filteredDrawings, linkedRfis],
  );
  const exportLocked = gate.blocked && !override;

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
      toast.error(`${gate.blockingCount} open RFI${gate.blockingCount === 1 ? "" : "s"} block this release — resolve them or check the PM override.`);
      return;
    }

    setBusy(true);
    try {
      const stem = suggestPackageName({ kind, project });

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
            supabase.from("rfis").select("id, rfi_number, subject, question, status, submitted_date, created_at, author, created_by").eq("project_id", project.id).eq("is_deleted", false),
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
              ⚠ Fab release blocked — {gate.blockingCount} open RFI{gate.blockingCount === 1 ? "" : "s"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 8 }}>
              Open RFIs reference {gate.affectedSheets.length} sheet{gate.affectedSheets.length === 1 ? "" : "s"} in this package. Releasing now risks fabricating to a detail that may change.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {gate.blockingRfis.slice(0, 6).map((r) => (
                <div key={r.id} style={{ ...mono, fontSize: 11, color: "var(--text-primary)", display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--status-error)", fontWeight: 700, flex: "0 0 auto" }}>{r.rfi_number || "RFI"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.subject || r.title || "—"}{r.status ? ` · ${r.status}` : ""}
                  </span>
                </div>
              ))}
              {gate.blockingRfis.length > 6 && (
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>+ {gate.blockingRfis.length - 6} more…</div>
              )}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              <span><strong style={{ color: "var(--text-primary)" }}>PM override</strong> — release despite the open RFI{gate.blockingCount === 1 ? "" : "s"} (I accept the rework risk).</span>
            </label>
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
            title={exportLocked ? "Resolve the open RFIs or check the PM override to release" : undefined}
            style={{
              ...btnBase,
              background: exportLocked ? "var(--bg-page)" : "rgba(200,155,32,0.2)",
              borderColor: exportLocked ? "var(--border-default)" : "var(--accent)",
              color: exportLocked ? "var(--text-muted)" : "var(--accent)",
              opacity: busy || exportLocked ? 0.6 : 1,
              cursor: exportLocked ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Exporting…" : exportLocked ? "Blocked by open RFIs" : "Export Package"}
          </button>
        </div>
      </div>
    </div>
  );
}
