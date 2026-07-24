/**
 * fabRelease.js — Pure helpers for the "Export Fab Release" package.
 *
 * Pulls every drawing with a stamp/stage indicating it's released for
 * fabrication, groups by drawing-set, and produces the tabular manifest
 * + README that ship inside the export.
 *
 * No third-party deps — everything here is string / array manipulation
 * so the helpers can be tested without a DOM. The React modal in
 * components/drawings/ExportFabReleaseModal.jsx wires user options to
 * these helpers and triggers the actual download.
 *
 * Note on packaging: jszip is NOT in package.json (verified 2026-05-03),
 * so the modal falls back to delivering a manifest CSV + a README text
 * file + a list of signed file URLs the user downloads manually. This
 * is documented in the modal UI and the README header.
 */

// ── Pure filtering helpers ───────────────────────────────────────────────

/**
 * A drawing is "approved for fabrication" if any of these is true:
 *  - stage === "Released" (canonical IFC/released for construction)
 *  - set_approval_status === "approved" or "approved_as_noted"
 *  - ifc_status === "Approved" or "Approved as Noted"
 *
 * (set_approval_status check values come from migration 074 — see the
 * supabase_drawings_constraints memory.)
 */
export function isApprovedForFab(d) {
  if (!d || d.is_deleted) return false;
  if (d.is_superseded) return false;
  // Never treat a non-current / unresolved revision as fabrication-ready.
  const releaseStatus = String(d.current_release_status || d.current_revision_status || "").toLowerCase();
  if (releaseStatus === "superseded" || releaseStatus === "void" || releaseStatus === "on_hold") {
    return false;
  }
  if (d.stage === "Released") return true;
  const setStatus = (d.set_approval_status || "").toLowerCase();
  if (setStatus === "approved" || setStatus === "approved_as_noted") return true;
  const ifcStatus = (d.ifc_status || "").toLowerCase();
  if (ifcStatus === "approved" || ifcStatus === "approved as noted") return true;
  return false;
}

/**
 * Turnover scope: drawings with construction-ready stamps only.
 * Per requirements: "approved_for_construction" or
 * "approved_for_fabrication". We map those onto the stage / status
 * fields we actually persist:
 *   - stage === "Released" (IFC)  → approved for construction
 *   - set_approval_status approved / approved_as_noted → approved for fab
 */
export function isApprovedForTurnover(d) {
  return isApprovedForFab(d);
}

/**
 * Claims scope: include EVERYTHING that isn't soft-deleted. Even
 * superseded revisions get pulled in for legal/insurance.
 */
export function isClaimable(d) {
  return !!d && d.is_deleted !== true;
}

/**
 * Group a list of drawings by `drawing_set_name`. Sheets with no
 * set name fall into an "(Ungrouped)" bucket so the manifest never
 * silently drops them.
 *
 * Returns `[{ setName, sheets }]` sorted alphabetically by setName,
 * with the ungrouped bucket pinned to the end.
 */
export function groupBySet(drawings) {
  const map = new Map();
  for (const d of drawings || []) {
    const name = (d.drawing_set_name && d.drawing_set_name.trim()) || "(Ungrouped)";
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(d);
  }
  const out = [];
  for (const [setName, sheets] of map.entries()) {
    sheets.sort((a, b) => String(a.sheet_number || "").localeCompare(String(b.sheet_number || "")));
    out.push({ setName, sheets });
  }
  out.sort((a, b) => {
    if (a.setName === "(Ungrouped)") return 1;
    if (b.setName === "(Ungrouped)") return -1;
    return a.setName.localeCompare(b.setName);
  });
  return out;
}

/**
 * Group items by ISO date (YYYY-MM-DD) of `dateField`. Used by claims
 * exports which group everything chronologically.
 */
export function groupByDate(items, dateField = "created_at") {
  const map = new Map();
  for (const it of items || []) {
    const raw = it && it[dateField];
    let key = "Undated";
    if (raw) {
      const d = raw instanceof Date ? raw : new Date(raw);
      if (!Number.isNaN(d.getTime())) key = d.toISOString().slice(0, 10);
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  const out = [];
  for (const [date, list] of map.entries()) out.push({ date, items: list });
  // Newest first; "Undated" pinned to end
  out.sort((a, b) => {
    if (a.date === "Undated") return 1;
    if (b.date === "Undated") return -1;
    return b.date.localeCompare(a.date);
  });
  return out;
}

// ── CSV manifest ─────────────────────────────────────────────────────────

const CSV_QUOTE = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;

/**
 * Build the fab-release manifest CSV. One row per drawing.
 *
 * @param {Array} drawings   already-filtered approved drawings
 * @param {Array} signoffs   optional [{ drawing_id, signed_by, signed_at, status }]
 * @returns {string}         CSV content
 */
export function buildFabManifestCsv(drawings, signoffs = []) {
  const signMap = new Map();
  for (const s of signoffs || []) {
    if (!s?.drawing_id) continue;
    const prev = signMap.get(s.drawing_id);
    // Keep the most recent (latest signed_at) signoff per drawing.
    if (!prev || (s.signed_at && (!prev.signed_at || s.signed_at > prev.signed_at))) {
      signMap.set(s.drawing_id, s);
    }
  }
  const headers = [
    "set_name",
    "sheet_number",
    "title",
    "discipline",
    "revision",
    "stage",
    "set_approval_status",
    "last_signed_off",
    "signed_by",
    "status",
  ];
  const rows = (drawings || []).map((d) => {
    const sign = signMap.get(d.id) || {};
    return [
      d.drawing_set_name || "",
      d.sheet_number || "",
      d.title || "",
      d.discipline || "",
      d.revision_number ?? "",
      d.stage || "",
      d.set_approval_status || "",
      sign.signed_at || "",
      sign.signed_by || "",
      sign.status || d.stage || "",
    ];
  });
  const lines = [headers.map(CSV_QUOTE).join(","), ...rows.map((r) => r.map(CSV_QUOTE).join(","))];
  return lines.join("\n");
}

/**
 * Generic helpers for the claims / turnover packages so each can have
 * its own row shape without duplicating CSV plumbing.
 */
export function buildCsv(headers, rows) {
  const lines = [headers.map(CSV_QUOTE).join(","), ...rows.map((r) => r.map(CSV_QUOTE).join(","))];
  return lines.join("\n");
}

// ── README content ───────────────────────────────────────────────────────

/**
 * Format a Date (or anything Date can parse) as ISO yyyy-mm-dd.
 */
export function formatIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Build the README markdown shipped at the root of the export package.
 *
 * @param {object} opts
 * @param {string} opts.kind          "Fab Release" | "Turnover" | "Claims"
 * @param {object} opts.project       { id, name }
 * @param {Array}  opts.groups        groupBySet output
 * @param {number} [opts.totalCount]  total item count (overrides default count)
 * @param {boolean} [opts.zipped]     was a zip generated, or are we in fallback?
 * @param {Date}   [opts.now]
 */
export function buildReadme({
  kind = "Fab Release",
  project = {},
  groups = [],
  totalCount = null,
  zipped = false,
  now = new Date(),
} = {}) {
  const total = totalCount != null ? totalCount : groups.reduce((acc, g) => acc + (g.sheets?.length || 0), 0);
  const lines = [];
  lines.push(`# ${kind} Package`);
  lines.push("");
  lines.push(`- **Project:** ${project.name || "(unnamed)"}`);
  if (project.id) lines.push(`- **Project ID:** ${project.id}`);
  lines.push(`- **Generated:** ${formatIsoDate(now)}`);
  lines.push(`- **Items:** ${total}`);
  lines.push("");
  if (!zipped) {
    lines.push("> **Note:** This export was generated in fallback mode (no zip support detected).");
    lines.push("> The manifest CSV is downloaded directly and lists the signed download URLs you can fetch manually.");
    lines.push("");
  }
  lines.push("## Contents");
  lines.push("");
  if (groups.length === 0) {
    lines.push("_No items match the export criteria._");
  } else {
    for (const g of groups) {
      lines.push(`### ${g.setName} (${(g.sheets || []).length})`);
      for (const s of g.sheets || []) {
        const label = [s.sheet_number, s.title].filter(Boolean).join(" — ");
        const meta = [
          s.revision_number ? `R${s.revision_number}` : null,
          s.stage || null,
        ].filter(Boolean).join(" · ");
        lines.push(`- ${label}${meta ? `  _(${meta})_` : ""}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

/**
 * Suggest a folder / filename stem for the package.
 */
export function suggestPackageName({ kind = "fab_release", project = {}, now = new Date() } = {}) {
  const safeProj = String(project.name || "project").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "project";
  const stamp = formatIsoDate(now);
  const safeKind = String(kind).replace(/[^A-Za-z0-9._-]+/g, "_").toLowerCase();
  return `${safeProj}_${safeKind}_${stamp}`;
}

// ── Claims helpers ──────────────────────────────────────────────────────

/**
 * Build the claims manifest CSV — multi-entity rows so legal/insurance
 * gets every artifact in one chronological table.
 *
 * @param {object} opts
 * @param {Array} opts.drawings
 * @param {Array} [opts.rfis]
 * @param {Array} [opts.changeOrders]
 * @param {Array} [opts.photos]   photos linked to drawings
 */
export function buildClaimsManifestCsv({ drawings = [], rfis = [], changeOrders = [], photos = [] } = {}) {
  const headers = ["date", "kind", "id", "label", "status", "author", "notes"];
  const rows = [];
  for (const d of drawings) {
    rows.push([
      formatIsoDate(d.created_at || d.updated_at || Date.now()),
      "drawing",
      d.id || "",
      [d.sheet_number, d.title].filter(Boolean).join(" — "),
      d.stage || "",
      d.reviewer || "",
      d.notes || "",
    ]);
  }
  for (const r of rfis) {
    rows.push([
      formatIsoDate(r.submitted_date || r.created_at || Date.now()),
      "rfi",
      r.id || "",
      `${r.rfi_number || ""} ${r.title || ""}`.trim(),
      r.status || "",
      r.author || r.created_by || "",
      r.question || "",
    ]);
  }
  for (const c of changeOrders) {
    rows.push([
      formatIsoDate(c.issued_date || c.created_at || Date.now()),
      "change_order",
      c.id || "",
      `${c.co_number || ""} ${c.title || c.description || ""}`.trim(),
      c.status || "",
      c.issued_by || c.created_by || "",
      c.description || "",
    ]);
  }
  for (const p of photos) {
    rows.push([
      formatIsoDate(p.taken_at || p.created_at || Date.now()),
      "photo",
      p.id || "",
      p.caption || p.file_name || "",
      "",
      p.uploaded_by || "",
      p.linked_drawing_id ? `drawing:${p.linked_drawing_id}` : "",
    ]);
  }
  rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  return buildCsv(headers, rows);
}

/**
 * Trigger a browser download of a Blob. Pure-ish helper — uses DOM but
 * isolated so the export module can stub it out in tests.
 */
export function downloadBlob(blob, filename) {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Trigger download of a UTF-8 text Blob (CSV / md / txt).
 */
export function downloadTextFile(content, filename, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  downloadBlob(blob, filename);
}
