/**
 * DrawingRegisterGrid — register-first document-control view. One row per active
 * sheet: current revision + release status + open-impact / pending-review / RFI /
 * work-package counts, sourced from `drawing_register_view`. Read-only for this
 * MVP slice; review gates, field-release, and publish actions land in later
 * phases of the Drawing Control module.
 */
import { useMemo, useState } from "react";
import { useDrawingRegister, type DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import { fmtDate } from "@/pages/drawingSubmittalHub/format";

const STATUS_TONE: Record<string, string> = {
  received: "var(--text-muted)",
  pending_review: "var(--status-warning)",
  reviewed: "var(--status-info)",
  released_for_estimate: "var(--status-info)",
  released_for_shop: "var(--status-warning)",
  released_for_field: "var(--status-success)",
  on_hold: "var(--status-warning)",
  superseded: "var(--text-muted)",
  void: "var(--status-error)",
};

const muted = "var(--text-muted)";
const primary = "var(--text-primary)";
const mono = "var(--font-mono)";

function StatusChip({ status }: { status: string | null }) {
  const tone = (status && STATUS_TONE[status]) || muted;
  const label = status ? status.replace(/_/g, " ") : "no revision";
  return (
    <span style={{
      fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
      color: tone, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
      background: `color-mix(in srgb, ${tone} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)`,
    }}>
      {label}
    </span>
  );
}

function Count({ n, tone }: { n: number | null; tone?: string }) {
  const v = n ?? 0;
  return (
    <span className="sbd-num" style={{ fontFamily: mono, fontSize: 12, color: v > 0 ? (tone || primary) : muted }}>
      {v}
    </span>
  );
}

export function DrawingRegisterGrid({ projectId }: { projectId: string | null }) {
  const { data = [], isLoading, error } = useDrawingRegister(projectId);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((r: DrawingRegisterRow) =>
      [r.sheet_number, r.sheet_title, r.discipline, r.drawing_set_name, r.current_status]
        .some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [data, query]);

  if (!projectId) {
    return <div style={{ padding: 24, color: muted, fontSize: 13 }}>Select a project to view its drawing register.</div>;
  }
  if (isLoading) {
    return <div style={{ padding: 24, color: muted, fontSize: 13 }}>Loading register…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--status-error)", fontSize: 13 }}>
        Failed to load the drawing register: {(error as Error)?.message || "Unknown error"}
      </div>
    );
  }

  return (
    <section className="sbd-card" style={{ padding: 16, borderRadius: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: primary, fontSize: 16 }}>Drawing Register</h3>
          <p style={{ margin: "4px 0 0", color: muted, fontSize: 12 }}>
            Current revision + release status + downstream counts per sheet. One source of truth.
          </p>
        </div>
        <input
          className="sbd-input"
          placeholder="Filter sheet, title, discipline, set…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 240, maxWidth: 360 }}
        />
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: muted, fontSize: 13 }}>
          {data.length === 0 ? "No drawings in the register yet." : "No sheets match the filter."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: muted, fontFamily: mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                <th style={{ padding: "6px 8px" }}>Sheet</th>
                <th style={{ padding: "6px 8px" }}>Title</th>
                <th style={{ padding: "6px 8px" }}>Disc.</th>
                <th style={{ padding: "6px 8px" }}>Set</th>
                <th style={{ padding: "6px 8px" }}>Rev</th>
                <th style={{ padding: "6px 8px" }}>Status</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>Impacts</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>Reviews</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>RFIs</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>WPs</th>
                <th style={{ padding: "6px 8px" }}>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.drawing_id} style={{ borderTop: "1px solid var(--border-default)" }}>
                  <td style={{ padding: "8px", fontWeight: 700, color: primary, whiteSpace: "nowrap" }}>{r.sheet_number || "—"}</td>
                  <td style={{ padding: "8px", color: primary, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sheet_title || "—"}</td>
                  <td style={{ padding: "8px", color: muted }}>{r.discipline || "—"}</td>
                  <td style={{ padding: "8px", color: muted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.drawing_set_name || "—"}</td>
                  <td style={{ padding: "8px", fontFamily: mono, color: primary, whiteSpace: "nowrap" }}>{r.current_revision || "—"}</td>
                  <td style={{ padding: "8px" }}><StatusChip status={r.current_status} /></td>
                  <td style={{ padding: "8px", textAlign: "center" }}><Count n={r.open_impact_count} tone="var(--status-warning)" /></td>
                  <td style={{ padding: "8px", textAlign: "center" }}><Count n={r.pending_review_count} tone="var(--status-info)" /></td>
                  <td style={{ padding: "8px", textAlign: "center" }}><Count n={r.rfi_count} /></td>
                  <td style={{ padding: "8px", textAlign: "center" }}><Count n={r.work_package_count} /></td>
                  <td style={{ padding: "8px", color: muted, whiteSpace: "nowrap" }}>{r.last_activity ? fmtDate(r.last_activity) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
