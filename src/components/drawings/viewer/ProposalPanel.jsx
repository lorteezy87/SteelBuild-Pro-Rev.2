/**
 * ProposalPanel — right-side drawer for Drawing Hub V3.0
 * (Analyzer→Zones bridge).
 *
 * AI analysis emits `drawing_findings` with normalized [0,1] bboxes.
 * This panel lists `drawing_zone_proposals` clustered from those
 * findings and lets the PM accept (mint a real zone), merge into an
 * existing zone, or reject — each action runs through drawingHub.js.
 *
 * The panel mirrors ZonePanel.jsx in shell + token usage so the two
 * drawers feel like siblings. It owns:
 *   - The proposals list (TanStack Query, filtered by status chip).
 *   - The "Propose from findings" launcher modal (minClusterSize slider).
 *   - Per-row Accept / Reject / Merge dialogs.
 *
 * Bbox highlighting on the canvas is achieved by lifting hover state
 * into a `proposalOverlays` array passed from the parent into ZoneLayer
 * via the new `proposalOverlays` prop. We emit hovered IDs through
 * onHoverProposal so the parent can build the overlay list.
 */

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Sparkles, Check, XCircle, Layers, ChevronDown } from "lucide-react";
import {
  listZoneProposals,
  proposeZonesFromFindings,
  acceptZoneProposal,
  rejectZoneProposal,
  mergeZoneProposalIntoZone,
  ZONE_TYPES,
  listZones,
} from "@/lib/drawingHub";

const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };

// Status pill palette — distinct from zone-status colors so the user
// doesn't confuse a 'pending' proposal with a 'green' real zone.
const PROPOSAL_STATUS_COLORS = {
  pending:  { fg: "#00E5FF", bg: "rgba(0,229,255,0.12)",   border: "#00E5FF" },
  accepted: { fg: "#22C55E", bg: "rgba(34,197,94,0.14)",   border: "#22C55E" },
  rejected: { fg: "#94A3B8", bg: "rgba(148,163,184,0.12)", border: "#94A3B8" },
  merged:   { fg: "#8B5CF6", bg: "rgba(139,92,246,0.14)",  border: "#8B5CF6" },
};

const SEVERITY_DOT = {
  critical: "#EF4444",
  high:     "#F97316",
  medium:   "#F59E0B",
  low:      "#3B82F6",
  info:     "#94A3B8",
};

const STATUS_FILTERS = [
  { key: "pending",  label: "Pending"  },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
  { key: "merged",   label: "Merged"   },
];

export default function ProposalPanel({
  open,
  onClose,
  projectId,
  drawing,
  drawingRevisionId,
  analysisId,           // optional — when provided, "Propose" defaults to scoping by analysis
  userId,
  onHoverProposal,      // (proposalId | null) => void — parent uses to highlight bbox on canvas
  onProposalsChange,    // () => void — fired after any mutation; parent invalidates zones cache
}) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [proposeOpen, setProposeOpen]   = useState(false);
  const [acceptingFor, setAcceptingFor] = useState(null);   // proposal row
  const [rejectingFor, setRejectingFor] = useState(null);
  const [mergingFor, setMergingFor]     = useState(null);

  const queryKey = ["drawing-zone-proposals", projectId, drawing?.id, drawingRevisionId || null, statusFilter];

  const { data: listData, isFetching } = useQuery({
    queryKey,
    queryFn: () => listZoneProposals({
      projectId,
      drawingId:         drawing?.id,
      drawingRevisionId: drawingRevisionId || undefined,
      status:            statusFilter,
      limit:             100,
    }),
    enabled: open && !!projectId && !!drawing?.id,
    staleTime: 15 * 1000,
  });
  const rows = listData?.rows || [];

  // Pending count badge — surfaces on the panel header even when the
  // user is filtered to another tab.
  const { data: pendingCountData } = useQuery({
    queryKey: ["drawing-zone-proposals-count", projectId, drawing?.id, drawingRevisionId || null],
    queryFn: () => listZoneProposals({
      projectId,
      drawingId:         drawing?.id,
      drawingRevisionId: drawingRevisionId || undefined,
      status:            "pending",
      limit:             1,
    }),
    enabled: open && !!projectId && !!drawing?.id,
    staleTime: 15 * 1000,
  });
  const pendingCount = pendingCountData?.total ?? 0;

  // Load existing zones for the merge picker. Cheap because zones are
  // bounded per drawing.
  const { data: existingZones = [] } = useQuery({
    queryKey: ["drawing-zones", drawingRevisionId],
    queryFn: () => listZones(drawingRevisionId),
    enabled: open && !!drawingRevisionId,
    staleTime: 30 * 1000,
  });

  const proposeMutation = useMutation({
    mutationFn: ({ minClusterSize }) => proposeZonesFromFindings({
      projectId,
      drawingId:         drawing.id,
      drawingRevisionId: drawingRevisionId || undefined,
      analysisId:        analysisId || undefined,
      options:           { minClusterSize, userId },
    }),
    onSuccess: ({ created, skipped }) => {
      toast.success(
        created > 0
          ? `Created ${created} proposal${created !== 1 ? "s" : ""}${skipped > 0 ? ` (skipped ${skipped} duplicates)` : ""}`
          : skipped > 0
            ? `No new proposals (skipped ${skipped} duplicates)`
            : "No findings with bboxes to cluster",
      );
      setProposeOpen(false);
      qc.invalidateQueries({ queryKey: ["drawing-zone-proposals", projectId, drawing?.id] });
      qc.invalidateQueries({ queryKey: ["drawing-zone-proposals-count", projectId, drawing?.id] });
    },
    onError: (err) => {
      toast.error(`Couldn't propose zones: ${err?.message || "unknown error"}`);
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["drawing-zone-proposals", projectId, drawing?.id] });
    qc.invalidateQueries({ queryKey: ["drawing-zone-proposals-count", projectId, drawing?.id] });
    qc.invalidateQueries({ queryKey: ["drawing-zones", drawingRevisionId] });
    qc.invalidateQueries({ queryKey: ["drawing-zones-summaries", drawingRevisionId] });
    qc.invalidateQueries({ queryKey: ["drawing-zone-links"] });
    onProposalsChange?.();
  };

  const acceptMutation = useMutation({
    mutationFn: ({ proposalId, label, zoneType, reason }) =>
      acceptZoneProposal(proposalId, { overrides: { label, zoneType, reason, userId } }),
    onSuccess: ({ zone }) => {
      toast.success(`Zone ${zone.zone_key} created from proposal`);
      setAcceptingFor(null);
      invalidateAll();
    },
    onError: (err) => toast.error(`Couldn't accept: ${err?.message || "unknown error"}`),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ proposalId, reason }) =>
      rejectZoneProposal(proposalId, { reason, userId }),
    onSuccess: () => {
      toast.success("Proposal rejected");
      setRejectingFor(null);
      invalidateAll();
    },
    onError: (err) => toast.error(`Couldn't reject: ${err?.message || "unknown error"}`),
  });

  const mergeMutation = useMutation({
    mutationFn: ({ proposalId, targetZoneId }) =>
      mergeZoneProposalIntoZone(proposalId, targetZoneId, { userId }),
    onSuccess: ({ zone }) => {
      toast.success(`Merged into ${zone.zone_key}`);
      setMergingFor(null);
      invalidateAll();
    },
    onError: (err) => toast.error(`Couldn't merge: ${err?.message || "unknown error"}`),
  });

  if (!open) return null;

  return (
    <>
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 420,
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border-default)",
          display: "flex",
          flexDirection: "column",
          zIndex: 80,
          boxShadow: "-12px 0 32px rgba(0,0,0,0.45)",
        }}
      >
        {/* Header */}
        <div style={{ padding: 14, borderBottom: "1px solid var(--divider)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={14} color="#00E5FF" />
              <h3 style={{ ...display, fontSize: 14, margin: 0, letterSpacing: "0.04em" }}>
                Zone Proposals
              </h3>
              {pendingCount > 0 && (
                <span
                  style={{
                    ...mono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    padding: "2px 6px",
                    borderRadius: 8,
                    background: PROPOSAL_STATUS_COLORS.pending.bg,
                    color: PROPOSAL_STATUS_COLORS.pending.fg,
                    border: `1px solid ${PROPOSAL_STATUS_COLORS.pending.border}`,
                  }}
                >
                  {pendingCount} PENDING
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              title="Close"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            {drawing?.sheet_number || drawing?.title || "—"} · AI findings spatial-clustered into reviewable zones
          </div>

          {/* Status filter chips */}
          <div style={{ display: "flex", gap: 4 }}>
            {STATUS_FILTERS.map((f) => {
              const active = f.key === statusFilter;
              const c = PROPOSAL_STATUS_COLORS[f.key];
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  style={{
                    ...mono,
                    flex: 1,
                    padding: "4px 6px",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background: active ? c.bg : "transparent",
                    color: active ? c.fg : "var(--text-muted)",
                    border: `1px solid ${active ? c.border : "var(--divider)"}`,
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Propose-from-findings launcher */}
          <button
            onClick={() => setProposeOpen(true)}
            style={{
              ...mono,
              padding: "8px 12px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: "rgba(0,229,255,0.10)",
              color: "#00E5FF",
              border: "1px solid #00E5FF",
              borderRadius: 3,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Sparkles size={12} /> Propose from findings
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {isFetching && rows.length === 0 ? (
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", textAlign: "center", padding: 24 }}>
              LOADING…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
              <Sparkles size={28} style={{ opacity: 0.25, marginBottom: 8 }} />
              <p style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>
                No proposals
              </p>
              <p style={{ ...mono, fontSize: 9, marginTop: 6, color: "var(--border-strong)" }}>
                {statusFilter === "pending"
                  ? "Run analysis on this drawing to detect issues, then click Propose from findings."
                  : `No ${statusFilter} proposals on this drawing.`}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((p) => (
                <ProposalRow
                  key={p.id}
                  proposal={p}
                  onHover={(hovered) => onHoverProposal?.(hovered ? p : null)}
                  onAccept={() => setAcceptingFor(p)}
                  onReject={() => setRejectingFor(p)}
                  onMerge={() => setMergingFor(p)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Modals */}
      {proposeOpen && (
        <ProposeModal
          analysisId={analysisId}
          onClose={() => setProposeOpen(false)}
          onSubmit={(opts) => proposeMutation.mutate(opts)}
          loading={proposeMutation.isPending}
        />
      )}
      {acceptingFor && (
        <AcceptModal
          proposal={acceptingFor}
          onClose={() => setAcceptingFor(null)}
          onSubmit={(opts) => acceptMutation.mutate({ proposalId: acceptingFor.id, ...opts })}
          loading={acceptMutation.isPending}
        />
      )}
      {rejectingFor && (
        <RejectModal
          proposal={rejectingFor}
          onClose={() => setRejectingFor(null)}
          onSubmit={(opts) => rejectMutation.mutate({ proposalId: rejectingFor.id, ...opts })}
          loading={rejectMutation.isPending}
        />
      )}
      {mergingFor && (
        <MergeModal
          proposal={mergingFor}
          existingZones={existingZones}
          onClose={() => setMergingFor(null)}
          onSubmit={(targetZoneId) => mergeMutation.mutate({ proposalId: mergingFor.id, targetZoneId })}
          loading={mergeMutation.isPending}
        />
      )}
    </>
  );
}

// ── Row ──────────────────────────────────────────────────────────────
function ProposalRow({ proposal, onHover, onAccept, onReject, onMerge }) {
  const c = PROPOSAL_STATUS_COLORS[proposal.status] || PROPOSAL_STATUS_COLORS.pending;
  const sevCounts = proposal.__findingSummary?.severityCounts || {};
  const conf = proposal.confidence != null ? Math.round(proposal.confidence * 100) : null;
  const isPending = proposal.status === "pending";

  return (
    <div
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      style={{
        padding: 10,
        background: "var(--bg-card)",
        border: "1px solid var(--divider)",
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Tiny bbox indicator — visual hint of where this lives on
            the sheet. 24px square. */}
        <div
          style={{
            width: 22,
            height: 22,
            border: "1px solid var(--border-default)",
            borderRadius: 2,
            background: "rgba(0,0,0,0.25)",
            position: "relative",
            flexShrink: 0,
          }}
          title={`bbox: (${(proposal.x_min ?? 0).toFixed(2)}, ${(proposal.y_min ?? 0).toFixed(2)}) → (${(proposal.x_max ?? 0).toFixed(2)}, ${(proposal.y_max ?? 0).toFixed(2)})`}
        >
          {proposal.x_min != null && (
            <div
              style={{
                position: "absolute",
                left:   `${proposal.x_min * 100}%`,
                top:    `${proposal.y_min * 100}%`,
                width:  `${Math.max(2, (proposal.x_max - proposal.x_min) * 100)}%`,
                height: `${Math.max(2, (proposal.y_max - proposal.y_min) * 100)}%`,
                background: c.bg,
                border: `1px solid ${c.border}`,
              }}
            />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...display, fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {proposal.suggested_label || "Untitled proposal"}
          </div>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.05em", marginTop: 2 }}>
            {proposal.suggested_zone_type || "area"} · {proposal.cluster_size} finding{proposal.cluster_size !== 1 ? "s" : ""}
          </div>
        </div>
        <span
          style={{
            ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "2px 5px", borderRadius: 2, color: c.fg, background: c.bg, border: `1px solid ${c.border}`,
            flexShrink: 0,
          }}
        >
          {proposal.status}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Severity dots */}
        <div style={{ display: "flex", gap: 3, alignItems: "center" }} title="Severity breakdown">
          {Object.entries(sevCounts).map(([sev, n]) => (
            <span
              key={sev}
              title={`${sev}: ${n}`}
              style={{
                ...mono,
                fontSize: 8,
                fontWeight: 700,
                color: SEVERITY_DOT[sev] || SEVERITY_DOT.info,
              }}
            >
              ●{n}
            </span>
          ))}
          {Object.keys(sevCounts).length === 0 && (
            <span style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>—</span>
          )}
        </div>
        {conf != null && (
          <span
            style={{
              ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
              color: conf >= 80 ? "#22C55E" : conf >= 60 ? "#F59E0B" : "var(--text-muted)",
            }}
            title="AI confidence"
          >
            {conf}%
          </span>
        )}
      </div>

      {isPending && (
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          <button onClick={onAccept} title="Accept — mint a new zone from this proposal"
            style={rowBtnStyle("#22C55E")}>
            <Check size={11} /> Accept
          </button>
          <button onClick={onMerge} title="Merge findings into an existing zone"
            style={rowBtnStyle("#8B5CF6")}>
            <Layers size={11} /> Merge
          </button>
          <button onClick={onReject} title="Reject this proposal"
            style={rowBtnStyle("#94A3B8")}>
            <XCircle size={11} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

const rowBtnStyle = (color) => ({
  flex: 1,
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "5px 6px",
  background: "transparent",
  color,
  border: `1px solid ${color}`,
  borderRadius: 2,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
});

// ── Modals ───────────────────────────────────────────────────────────
function ModalShell({ title, children, onClose, width = 360 }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width, maxWidth: "92vw",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ ...display, fontSize: 13, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: 14 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ProposeModal({ analysisId, onClose, onSubmit, loading }) {
  const [minClusterSize, setMinClusterSize] = useState(2);
  return (
    <ModalShell title="Propose zones from findings" onClose={onClose}>
      <p style={{ ...mono, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
        Spatially cluster {analysisId ? "this analysis's" : "this drawing's"} findings into draft zones.
        Each cluster becomes a proposal you can accept, reject, or merge.
      </p>
      <div style={{ marginTop: 14 }}>
        <label style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Minimum cluster size: <span style={{ color: "var(--accent)" }}>{minClusterSize}</span>
        </label>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={minClusterSize}
          onChange={(e) => setMinClusterSize(Number(e.target.value))}
          style={{ width: "100%", marginTop: 6 }}
        />
        <p style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
          {minClusterSize === 1
            ? "1 → every finding becomes its own proposal."
            : `≥${minClusterSize} → only clusters with ${minClusterSize}+ overlapping findings become proposals.`}
        </p>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={modalCancelBtn}>Cancel</button>
        <button
          disabled={loading}
          onClick={() => onSubmit({ minClusterSize })}
          style={{ ...modalConfirmBtn, opacity: loading ? 0.5 : 1, cursor: loading ? "wait" : "pointer" }}
        >
          {loading ? "Proposing…" : "Propose"}
        </button>
      </div>
    </ModalShell>
  );
}

function AcceptModal({ proposal, onClose, onSubmit, loading }) {
  const [label, setLabel]     = useState(proposal.suggested_label || "");
  const [zoneType, setZoneType] = useState(proposal.suggested_zone_type || "area");
  return (
    <ModalShell title="Accept proposal" onClose={onClose}>
      <p style={{ ...mono, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
        A new zone will be created and {proposal.cluster_size} finding{proposal.cluster_size !== 1 ? "s" : ""} linked to it.
      </p>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={modalLabel}>Zone label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={modalInput}
            maxLength={120}
          />
        </div>
        <div>
          <label style={modalLabel}>Zone type</label>
          <select value={zoneType} onChange={(e) => setZoneType(e.target.value)} style={modalInput}>
            {ZONE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={modalCancelBtn}>Cancel</button>
        <button
          disabled={loading}
          onClick={() => onSubmit({ label, zoneType })}
          style={{ ...modalConfirmBtn, borderColor: "#22C55E", color: "#22C55E", opacity: loading ? 0.5 : 1 }}
        >
          {loading ? "Accepting…" : "Accept and create zone"}
        </button>
      </div>
    </ModalShell>
  );
}

function RejectModal({ proposal, onClose, onSubmit, loading }) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell title="Reject proposal" onClose={onClose}>
      <p style={{ ...mono, fontSize: 10, color: "var(--text-muted)", margin: 0 }}>
        Findings stay where they are. You can rerun "Propose from findings" later if you change your mind.
      </p>
      <div style={{ marginTop: 12 }}>
        <label style={modalLabel}>Reason (optional)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          style={{ ...modalInput, resize: "vertical", fontFamily: "var(--font-mono)" }}
          placeholder="Why this proposal isn't useful…"
        />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={modalCancelBtn}>Cancel</button>
        <button
          disabled={loading}
          onClick={() => onSubmit({ reason })}
          style={{ ...modalConfirmBtn, borderColor: "#94A3B8", color: "#94A3B8", opacity: loading ? 0.5 : 1 }}
        >
          {loading ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </ModalShell>
  );
}

function MergeModal({ proposal, existingZones, onClose, onSubmit, loading }) {
  const [targetZoneId, setTargetZoneId] = useState(existingZones[0]?.id || "");
  return (
    <ModalShell title="Merge into existing zone" onClose={onClose}>
      {existingZones.length === 0 ? (
        <>
          <p style={{ ...mono, fontSize: 10, color: "var(--text-muted)", margin: 0 }}>
            No existing zones on this drawing. Accept the proposal to create one, or merge later.
          </p>
          <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
            <button onClick={onClose} style={modalCancelBtn}>Close</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...mono, fontSize: 10, color: "var(--text-muted)", margin: 0 }}>
            Pick a zone — the {proposal.cluster_size} finding{proposal.cluster_size !== 1 ? "s" : ""} will be linked to it.
          </p>
          <div style={{ marginTop: 12 }}>
            <label style={modalLabel}>Target zone</label>
            <select value={targetZoneId} onChange={(e) => setTargetZoneId(e.target.value)} style={modalInput}>
              {existingZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.zone_key} · {z.label} ({z.zone_type})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
            <button onClick={onClose} style={modalCancelBtn}>Cancel</button>
            <button
              disabled={loading || !targetZoneId}
              onClick={() => onSubmit(targetZoneId)}
              style={{ ...modalConfirmBtn, borderColor: "#8B5CF6", color: "#8B5CF6", opacity: (loading || !targetZoneId) ? 0.5 : 1 }}
            >
              {loading ? "Merging…" : "Merge"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

const modalLabel = {
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 4,
};

const modalInput = {
  ...mono,
  fontSize: 11,
  width: "100%",
  padding: "6px 8px",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
  borderRadius: 3,
};

const modalCancelBtn = {
  ...mono,
  flex: 1,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "8px 10px",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--divider)",
  borderRadius: 3,
  cursor: "pointer",
};

const modalConfirmBtn = {
  ...mono,
  flex: 1.4,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "8px 10px",
  background: "transparent",
  color: "#00E5FF",
  border: "1px solid #00E5FF",
  borderRadius: 3,
  cursor: "pointer",
};
