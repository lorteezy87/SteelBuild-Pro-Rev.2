/**
 * AiSuggestModal — extracted from ZonePanel.jsx.
 *
 * Fetches open records across four record types in the zone's
 * project, strips out anything already linked to the zone, sends
 * the remainder to suggestLinksForZone() for gpt-4o-mini analysis,
 * and renders each returned suggestion with a confidence chip +
 * rationale + Accept / Skip buttons.
 *
 * Accept fires the parent's onAccept(suggestion) which handles the
 * drawing_link persistence (see caller). Skipped suggestions just
 * disappear from the list; they're not tracked for re-suggestion
 * suppression in MVP.
 */

import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { suggestLinksForZone, LINKABLE_TYPE_LABELS } from "@/lib/drawingHub";
import { mono, display } from "./zonePanelConstants";

export function AiSuggestModal({ zone, sheet, existingItems, onClose, onAccept }) {
  const alreadyLinked = useMemo(() => {
    const s = new Set();
    for (const it of existingItems || []) {
      s.add(`${it.link.linked_record_type}:${it.link.linked_record_id}`);
    }
    return s;
  }, [existingItems]);

  // Pull candidate open records across the four types the model is
  // allowed to suggest. Capped per-type so the payload stays small;
  // suggestLinksForZone does a second narrowing pass.
  const { data: candidates = [], isFetching: loadingCandidates, error: candidateError } = useQuery({
    queryKey: ["zone-ai-candidates", zone.project_id, zone.id],
    queryFn: async () => {
      if (!zone?.project_id) return [];
      const [rfis, wps, dels, cos] = await Promise.all([
        base44.entities.RFI.filter({ project_id: zone.project_id }).catch(() => []),
        base44.entities.WorkPackage.filter({ project_id: zone.project_id }).catch(() => []),
        base44.entities.Delivery.filter({ project_id: zone.project_id }).catch(() => []),
        base44.entities.ChangeOrder.filter({ project_id: zone.project_id }).catch(() => []),
      ]);
      const isRfiOpen = (r) => !/^(answered|closed|void)$/i.test(r.status || "");
      const isDelOpen = (d) => !/^(delivered|received)$/i.test(d.status || "");
      const isCoOpen  = (c) => !/^(approved|rejected|void)$/i.test(c.status || "");
      const open = [
        ...rfis.filter(isRfiOpen).slice(0, 60).map((r) => ({ ...r, __type: "rfi" })),
        ...wps.slice(0, 40).map((r) => ({ ...r, __type: "work_package" })),
        ...dels.filter(isDelOpen).slice(0, 40).map((r) => ({ ...r, __type: "delivery" })),
        ...cos.filter(isCoOpen).slice(0, 40).map((r) => ({ ...r, __type: "change_order" })),
      ];
      // Strip anything already linked so the model doesn't propose
      // duplicates and waste tokens.
      return open.filter((r) => !alreadyLinked.has(`${r.__type}:${r.id}`));
    },
    enabled: true,
    staleTime: 60 * 1000,
  });

  const zoneWithSheet = useMemo(() => ({
    ...zone,
    __sheet_number: sheet?.sheet_number,
    __sheet_title:  sheet?.sheet_title,
  }), [zone, sheet]);

  const suggestMut = useMutation({
    mutationFn: async () => suggestLinksForZone(zoneWithSheet, candidates),
  });

  // Auto-run once candidates are loaded so the modal doesn't ask
  // the user to click "Go" for a feature they just invoked.
  const autoKickedOff = React.useRef(false);
  useEffect(() => {
    if (autoKickedOff.current) return;
    if (loadingCandidates) return;
    if (!candidates.length) return;
    autoKickedOff.current = true;
    suggestMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCandidates, candidates.length]);

  // Track which suggestions the user has accepted/skipped in this
  // session so the list shrinks as they work through it.
  const [hidden, setHidden] = useState(() => new Set());
  const [acceptingId, setAcceptingId] = useState(null);
  const visible = (suggestMut.data || []).filter(
    (s) => !hidden.has(`${s.recordType}:${s.recordId}`),
  );

  const handleAccept = async (s) => {
    const key = `${s.recordType}:${s.recordId}`;
    setAcceptingId(key);
    try {
      await onAccept(s);
      setHidden((prev) => { const next = new Set(prev); next.add(key); return next; });
      toast.success(`${LINKABLE_TYPE_LABELS[s.recordType] || s.recordType} linked`);
    } catch (err) {
      toast.error(`Link failed: ${err?.message || "unknown"}`);
    } finally {
      setAcceptingId(null);
    }
  };
  const handleSkip = (s) => {
    const key = `${s.recordType}:${s.recordId}`;
    setHidden((prev) => { const next = new Set(prev); next.add(key); return next; });
  };

  const lookupById = useMemo(() => {
    const m = new Map();
    for (const c of candidates || []) m.set(`${c.__type}:${c.id}`, c);
    return m;
  }, [candidates]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200 }} />
      <div
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 580, maxWidth: "92vw", maxHeight: "82vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid #00E5FF",
          borderRadius: 6,
          zIndex: 1201,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#00E5FF" }}>
              AI Suggestions · {zone.zone_key}
            </div>
            <div style={{ ...display, fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
              Records that likely belong here
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {/* Status banner */}
          {loadingCandidates && (
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
              Loading project records…
            </div>
          )}
          {!loadingCandidates && !candidates.length && (
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>
              No open records available to suggest from — every open RFI / WP / delivery / CO
              is already linked to this zone or the project has none yet.
            </div>
          )}
          {candidateError && (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-error)" }}>
              Couldn't load candidates: {candidateError?.message || "unknown error"}
            </div>
          )}
          {suggestMut.isPending && (
            <div style={{ ...mono, fontSize: 10, color: "#00E5FF", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              ● Analysing {candidates.length} open records…
            </div>
          )}
          {suggestMut.isError && (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-error)" }}>
              AI call failed: {suggestMut.error?.message || "unknown"}
              <button
                onClick={() => suggestMut.mutate()}
                style={{ ...mono, fontSize: 10, marginLeft: 8, padding: "2px 8px", background: "transparent", color: "#00E5FF", border: "1px solid #00E5FF", borderRadius: 2, cursor: "pointer" }}
              >
                Retry
              </button>
            </div>
          )}
          {suggestMut.isSuccess && visible.length === 0 && (
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", padding: "12px 0" }}>
              No confident matches. Either the signals were too weak (drawing references, grid /
              level / detail callouts don't line up), or you've already worked through every
              suggestion.
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => { setHidden(new Set()); suggestMut.mutate(); }}
                  style={{ ...mono, fontSize: 10, padding: "3px 10px", background: "transparent", color: "#00E5FF", border: "1px solid #00E5FF", borderRadius: 2, cursor: "pointer" }}
                >
                  Re-run
                </button>
              </div>
            </div>
          )}

          {/* Suggestion cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            {visible.map((s) => {
              const rec = lookupById.get(`${s.recordType}:${s.recordId}`);
              const number = rec?.rfi_number || rec?.wp_number || rec?.delivery_number || rec?.co_number || null;
              const title  = rec?.subject || rec?.name || rec?.description || rec?.title || "(untitled)";
              const pct = Math.round(s.confidence * 100);
              const chipColor = pct >= 80 ? "var(--status-success)" : pct >= 65 ? "#00E5FF" : "var(--status-warning)";
              return (
                <div
                  key={`${s.recordType}:${s.recordId}`}
                  style={{
                    padding: "10px 12px",
                    background: "var(--bg-page)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 3,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                      {LINKABLE_TYPE_LABELS[s.recordType] || s.recordType}
                    </div>
                    <div
                      title={`${pct}% model confidence`}
                      style={{
                        ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                        padding: "2px 8px",
                        background: `color-mix(in srgb, ${chipColor} 14%, transparent)`,
                        color: chipColor,
                        border: `1px solid ${chipColor}`,
                        borderRadius: 2,
                      }}
                    >
                      {pct}% match
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginTop: 4, lineHeight: 1.35 }}>
                    {number && <span style={{ ...mono, color: "var(--accent)", marginRight: 8 }}>{number}</span>}
                    {title}
                  </div>
                  {s.rationale && (
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.4 }}>
                      “{s.rationale}”
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button
                      disabled={acceptingId === `${s.recordType}:${s.recordId}`}
                      onClick={() => handleAccept(s)}
                      style={{
                        ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                        padding: "4px 10px",
                        background: chipColor,
                        color: "#000",
                        border: "none",
                        borderRadius: 2,
                        cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <Check size={11} /> {acceptingId === `${s.recordType}:${s.recordId}` ? "Linking…" : "Accept"}
                    </button>
                    <button
                      onClick={() => handleSkip(s)}
                      style={{
                        ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                        padding: "4px 10px",
                        background: "transparent",
                        color: "var(--text-muted)",
                        border: "1px solid var(--divider)",
                        borderRadius: 2,
                        cursor: "pointer",
                      }}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <footer style={{ padding: "10px 18px", borderTop: "1px solid var(--divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            Model: gpt-4o-mini · Signals: sheet · grid · level · detail · title · drawing_reference
          </span>
          <button
            onClick={onClose}
            style={{
              ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "5px 12px",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--divider)",
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </footer>
      </div>
    </>
  );
}

export default AiSuggestModal;
