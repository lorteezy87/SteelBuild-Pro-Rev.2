/**
 * BulkCreateFoldersModal — paste / type a list of folder names, one per
 * line, and create them all in a single click.
 *
 * Supports nested hierarchies via indentation: lines with leading
 * 2-space indent (or a tab) become children of the most recent line
 * with one less level. Lines with no indent become children of the
 * `parentFolderId` the user is currently browsing.
 *
 * Example input:
 *
 *   Specs
 *     Architectural
 *       Sheets
 *     Structural
 *   Drawings
 *
 * → 5 folders created. "Architectural" lives under "Specs", "Sheets"
 * under "Architectural", etc.
 *
 * Empty lines and lines that are just whitespace are skipped.
 *
 * Errors are reported per-line so the user can see which ones failed
 * (typical case: duplicate name at the same level).
 */

import React, { useState } from "react";
import { X, FolderPlus } from "lucide-react";

const overlay = {
  position: "fixed", inset: 0,
  background: "color-mix(in srgb, var(--bg-page) 70%, transparent)",
  zIndex: 2000,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const dialog = {
  background: "var(--bg-surface-secondary)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  width: "min(580px, 92vw)",
  maxHeight: "min(720px, 90vh)",
  display: "flex", flexDirection: "column",
};

const header = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--border-default)",
  display: "flex", alignItems: "center", justifyContent: "space-between",
  flexShrink: 0,
};

const body = {
  padding: 16,
  flex: 1,
  overflowY: "auto",
  display: "flex", flexDirection: "column", gap: 12,
};

const footer = {
  padding: "12px 16px",
  borderTop: "1px solid var(--border-default)",
  display: "flex", justifyContent: "flex-end", gap: 8,
  flexShrink: 0,
};

const btn = (variant = "secondary", disabled = false) => ({
  padding: "8px 14px",
  borderRadius: 6,
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
  border: variant === "primary" ? "1px solid var(--accent)" : "1px solid var(--border-default)",
  background: variant === "primary" ? "var(--accent)" : "transparent",
  color: variant === "primary" ? "var(--bg-base)" : "var(--text-primary)",
  display: "inline-flex", alignItems: "center", gap: 6,
});

/**
 * Parse the textarea into a list of folders to create with their
 * parent relationships. Returns an array of:
 *   { name, depth, lineIndex }
 * The caller turns `depth` into the actual parent_folder_id by
 * walking the list and tracking a stack of recently-created ids.
 */
export function parseBulkFolderInput(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Count leading whitespace. Tabs count as one level; otherwise 2 spaces
    // = one level. Mixed indents are tolerated by floor-rounding.
    const match = line.match(/^([\t ]*)/);
    const lead = match ? match[1] : "";
    let depth = 0;
    if (lead.includes("\t")) {
      depth = (lead.match(/\t/g) || []).length;
    } else {
      depth = Math.floor(lead.length / 2);
    }
    out.push({
      name: line.trim(),
      depth,
      lineIndex: i + 1,
    });
  }
  return out;
}

export default function BulkCreateFoldersModal({
  open,
  parentLabel = "(Root)",
  onClose,
  onSubmit,                 // (parsed[]) => Promise<{ created, failed }>
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  if (!open) return null;

  const parsed = parseBulkFolderInput(text);
  // Validate the indent sequence — first line can't be deeper than 0,
  // and each subsequent line can't jump more than one level deeper than
  // the previous one. We surface these as warnings under the textarea.
  const warnings = [];
  let prevDepth = -1;
  for (const item of parsed) {
    if (prevDepth === -1 && item.depth > 0) {
      warnings.push(`Line ${item.lineIndex}: first folder can't be indented (treated as root).`);
    }
    if (prevDepth >= 0 && item.depth > prevDepth + 1) {
      warnings.push(`Line ${item.lineIndex}: indented too deep (jumped ${item.depth - prevDepth} levels).`);
    }
    prevDepth = item.depth;
  }

  const handleSubmit = async () => {
    if (!parsed.length || submitting) return;
    setSubmitting(true);
    setResults(null);
    try {
      const out = await onSubmit(parsed);
      setResults(out);
      // If everything succeeded, clear and close. Otherwise keep the
      // dialog open so the user can see which lines failed.
      if (out && out.failed.length === 0) {
        setText("");
        onClose?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Bulk Create Folders
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
              Inside: {parentLabel}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={body}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>
            One folder per line. Indent with 2 spaces (or a tab) to nest under the line above.
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Specs\n  Architectural\n    Sheets\n  Structural\nDrawings"}
            spellCheck={false}
            style={{
              minHeight: 220,
              resize: "vertical",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              padding: 10,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-primary)",
              outline: "none",
              tabSize: 2,
              whiteSpace: "pre",
              overflowX: "auto",
            }}
          />

          {/* Live preview / warnings */}
          {(parsed.length > 0 || warnings.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {parsed.length > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                  WILL CREATE {parsed.length} FOLDER{parsed.length === 1 ? "" : "S"}
                </div>
              )}
              {warnings.map((w, i) => (
                <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-warning)" }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {/* Result strip */}
          {results && (
            <div style={{
              padding: "10px 12px",
              background: results.failed.length === 0 ? "var(--success-muted)" : "var(--danger-muted)",
              border: `1px solid ${results.failed.length === 0 ? "var(--success-border)" : "var(--danger-border)"}`,
              borderRadius: 6,
              fontFamily: "var(--font-mono)", fontSize: 10,
              color: results.failed.length === 0 ? "var(--status-success)" : "var(--status-error)",
            }}>
              {results.failed.length === 0
                ? `✓ Created ${results.created} folder${results.created === 1 ? "" : "s"}.`
                : `Created ${results.created}, failed ${results.failed.length}:`}
              {results.failed.map((f, i) => (
                <div key={i} style={{ marginTop: 4, color: "var(--status-error)" }}>
                  Line {f.lineIndex}: "{f.name}" — {f.error}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={footer}>
          <button onClick={onClose} style={btn("secondary")} disabled={submitting}>
            Close
          </button>
          <button
            onClick={handleSubmit}
            disabled={parsed.length === 0 || submitting}
            style={btn("primary", parsed.length === 0 || submitting)}
          >
            <FolderPlus size={12} />
            {submitting ? "Creating…" : `Create ${parsed.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
