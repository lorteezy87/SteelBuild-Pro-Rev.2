/**
 * ExportMarkupPDFModal — Options dialog for "Export Markup PDF".
 *
 * Two scopes:
 *   - Drawing: just the active sheet (caller passes `activeDrawing` and a
 *     pre-loaded sheets list of length 1)
 *   - Set:     every sheet whose drawing_set_name === activeDrawing.drawing_set_name
 *
 * Caller wires this from DrawingViewer's toolbar. Sign-offs are queried
 * here from drawing_signoffs so the helper can stay pure.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { generateMarkupSummaryPdf, suggestMarkupPdfFilename } from "@/lib/exports/markupPDF";

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

export default function ExportMarkupPDFModal({
  open,
  onClose,
  project,
  activeDrawing,
  drawings = [],
}) {
  const [scope, setScope] = useState("drawing"); // "drawing" | "set"
  const [openOnly, setOpenOnly] = useState(false);
  const [includeSignoffs, setIncludeSignoffs] = useState(true);
  const [busy, setBusy] = useState(false);

  // Sheets covered by the current scope.
  const sheets = useMemo(() => {
    if (!activeDrawing) return [];
    if (scope === "drawing") return [activeDrawing];
    const setName = activeDrawing.drawing_set_name;
    if (!setName) return [activeDrawing];
    return (drawings || []).filter((d) => d.drawing_set_name === setName);
  }, [scope, activeDrawing, drawings]);

  if (!open) return null;

  const handleExport = async () => {
    if (!sheets.length) {
      toast.error("No sheets to export.");
      return;
    }
    setBusy(true);
    try {
      // Markup lives in drawing_markups rows (one per item) since the
      // collaborative-redlining migration — drawings.markup is legacy/empty.
      // Resolve each sheet's rows into the legacy item shape the pure PDF
      // helpers expect, with the author attribution the rows now carry.
      let sheetsWithMarkup = sheets;
      try {
        const ids = sheets.map((s) => s.id).filter(Boolean);
        if (ids.length > 0) {
          const { data: markupRows, error: markupError } = await supabase
            .from("drawing_markups")
            .select("id, drawing_id, markup_type, page_number, status, comment, color, payload, author_name, author_email, created_at")
            .in("drawing_id", ids)
            .order("created_at", { ascending: true });
          if (markupError) throw markupError;
          const byDrawing = new Map();
          for (const row of markupRows || []) {
            const item = {
              ...(row.payload && typeof row.payload === "object" ? row.payload : {}),
              id: row.id,
              kind: row.markup_type,
              pdf_page: row.page_number || 1,
              status: row.status || "open",
              text: row.comment ?? "",
              color: row.color || undefined,
              created_at: row.created_at,
              created_by: row.author_name || row.author_email || null,
            };
            if (!byDrawing.has(row.drawing_id)) byDrawing.set(row.drawing_id, []);
            byDrawing.get(row.drawing_id).push(item);
          }
          sheetsWithMarkup = sheets.map((s) => ({ ...s, markup: byDrawing.get(s.id) || [] }));
        }
      } catch (err) {
        console.warn("[ExportMarkupPDFModal] markup rows fetch failed — exporting without markup:", err);
        sheetsWithMarkup = sheets.map((s) => ({ ...s, markup: [] }));
      }

      let signoffs = [];
      if (includeSignoffs) {
        try {
          const ids = sheets.map((s) => s.id).filter(Boolean);
          if (ids.length > 0) {
            const { data, error } = await supabase
              .from("drawing_signoffs")
              .select("drawing_id, signed_by, signed_at, status")
              .in("drawing_id", ids)
              .eq("is_voided", false);
            if (error) {
              // Non-fatal: continue without sign-offs and warn.
              console.warn("[ExportMarkupPDFModal] signoffs fetch failed:", error);
            } else {
              signoffs = data || [];
            }
          }
        } catch (err) {
          console.warn("[ExportMarkupPDFModal] signoffs fetch threw:", err);
        }
      }

      const label = scope === "set"
        ? (activeDrawing?.drawing_set_name || activeDrawing?.sheet_number || "set")
        : (activeDrawing?.sheet_number || "drawing");

      const pdf = generateMarkupSummaryPdf({
        project: { id: project?.id, name: project?.name },
        scope,
        title: scope === "set"
          ? `Set Markups · ${activeDrawing?.drawing_set_name || ""}`.trim()
          : `Sheet Markups · ${activeDrawing?.sheet_number || ""}`.trim(),
        subtitle: project?.name || "",
        sheets: sheetsWithMarkup,
        openOnly,
        signoffs,
      });
      const filename = suggestMarkupPdfFilename({ scope, label });
      pdf.save(filename);
      toast.success("Markup PDF exported");
      onClose?.();
    } catch (err) {
      console.error("[ExportMarkupPDFModal] export failed:", err);
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
          borderRadius: "var(--radius-card, 4px)", width: 480, maxWidth: "90vw",
          padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--accent)", marginBottom: 6 }}>
          MARKUP SUMMARY
        </div>
        <h3 style={{ margin: 0, marginBottom: 18, fontSize: 18, color: "var(--text-primary)" }}>
          Export Markup PDF
        </h3>

        <div style={{ marginBottom: 16 }}>
          <span style={labelStyle}>Scope</span>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { v: "drawing", label: `This Drawing${activeDrawing?.sheet_number ? ` (${activeDrawing.sheet_number})` : ""}` },
              { v: "set",     label: `Whole Set${activeDrawing?.drawing_set_name ? ` (${activeDrawing.drawing_set_name})` : ""}` },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setScope(opt.v)}
                style={{
                  ...btnBase, flex: 1,
                  background: scope === opt.v ? "rgba(200,155,32,0.15)" : "var(--bg-page)",
                  borderColor: scope === opt.v ? "var(--accent)" : "var(--border-default)",
                  color: scope === opt.v ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>Open comments only</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, cursor: "pointer" }}>
          <input type="checkbox" checked={includeSignoffs} onChange={(e) => setIncludeSignoffs(e.target.checked)} />
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>Include sign-offs</span>
        </label>

        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginBottom: 18 }}>
          {sheets.length} sheet{sheets.length === 1 ? "" : "s"} will be included.
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
            disabled={busy || sheets.length === 0}
            style={{
              ...btnBase,
              background: "rgba(200,155,32,0.2)",
              borderColor: "var(--accent)",
              color: "var(--accent)",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
