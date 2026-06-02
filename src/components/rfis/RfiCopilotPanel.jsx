/**
 * RfiCopilotPanel — collapsible AI-assist panel inside the RFI detail.
 *
 * Drafts a proposed RFI response via the llm-proxy gateway (useCase
 * "rfi-copilot") with a deterministic offline fallback. Human-in-the-loop:
 * the draft is editable and copyable; it is NEVER auto-saved to the RFI (§17).
 */
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Copy, RefreshCw } from "lucide-react";
import { draftRfiResponse } from "@/lib/rfiCopilot";

export default function RfiCopilotPanel({ rfi }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState(null); // "ai" | "offline"

  const run = async () => {
    setLoading(true);
    try {
      const { text, source: src } = await draftRfiResponse({ rfi });
      setDraft(text);
      setSource(src);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Draft copied");
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  };

  return (
    <section className="rfi-detail-section">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open && !draft && !loading) run(); }}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          background: "transparent", border: "none", cursor: "pointer",
          padding: 0, textAlign: "left", color: "var(--accent)",
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800,
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}
        aria-expanded={open}
      >
        <Sparkles size={14} />
        RFI Copilot
        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {loading ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
              Drafting a proposed response…
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={run} className="sbd-btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <RefreshCw size={12} /> {draft ? "Redraft" : "Draft response"}
                </button>
                {draft && (
                  <button type="button" onClick={copy} className="sbd-btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <Copy size={12} /> Copy
                  </button>
                )}
                {source && (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                    textTransform: "uppercase", padding: "2px 8px", borderRadius: 999,
                    color: source === "ai" ? "var(--status-success)" : "var(--status-warning)",
                    background: `color-mix(in srgb, ${source === "ai" ? "var(--status-success)" : "var(--status-warning)"} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${source === "ai" ? "var(--status-success)" : "var(--status-warning)"} 40%, transparent)`,
                  }}>
                    {source === "ai" ? "Live AI" : "Offline draft"}
                  </span>
                )}
              </div>

              {draft && (
                <>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={Math.min(16, Math.max(6, draft.split("\n").length + 1))}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "var(--bg-input, var(--bg-surface-low))",
                      border: "1px solid var(--border-default)", borderRadius: 6,
                      padding: "10px 12px", color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.5,
                      outline: "none", resize: "vertical",
                    }}
                  />
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                    Draft only — review and edit before using. The copilot never answers or closes the RFI.
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
