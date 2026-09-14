import { useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, CheckCircle2, CircleX, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  evaluateCanonicalReleaseGate,
  releaseCanonicalWorkPackage,
  type CanonicalReleaseGate,
} from "@/lib/pieceControl/releaseRepository";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { invalidatePieceControlQueries } from "@/lib/pieceControl/queryKeys";

interface CanonicalFabReleasePanelProps {
  projectId: string;
  workPackageId: string;
  pieceControlMode: string;
}

const CHECK_LABELS: Array<{ key: keyof CanonicalReleaseGate["checks"]; label: string }> = [
  { key: "scope", label: "Piece scope" },
  { key: "drawings", label: "Shop drawings" },
  { key: "material", label: "Material received / on hand" },
  { key: "holds", label: "Piece holds" },
];

const BLOCKER_PRESENTATION_COPY: Record<string, string> = {
  "No active, actionable canonical leaf pieces are assigned to this work package.":
    "No active pieces are assigned to this work package.",
};

function presentBlocker(blocker: string) {
  return BLOCKER_PRESENTATION_COPY[blocker] ?? blocker;
}

/** Theme-token styles — follow --cmd-* when on a command surface, else app tokens. */
const panel: CSSProperties = {
  borderRadius: 16,
  border: "1px solid var(--cmd-border, var(--border-default))",
  background: "var(--cmd-surface, var(--bg-surface))",
  color: "var(--cmd-text, var(--text-primary))",
  padding: 16,
  boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.2))",
};

const muted: CSSProperties = {
  color: "var(--cmd-text-muted, var(--text-muted))",
};

const warnBox: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--cmd-chip-warn-bg, var(--warning-border))",
  background: "var(--cmd-chip-warn-bg, var(--warning-muted))",
  color: "var(--cmd-warn-text, var(--status-warning))",
  padding: 16,
  fontSize: 14,
};

const dangerBox: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--cmd-chip-danger-bg, var(--danger-border))",
  background: "var(--cmd-chip-danger-bg, var(--danger-muted))",
  color: "var(--cmd-danger-text, var(--status-error))",
  padding: 12,
  fontSize: 14,
};

const goodBox: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--cmd-chip-good-bg, var(--success-border))",
  background: "var(--cmd-chip-good-bg, var(--success-muted))",
  color: "var(--cmd-good-text, var(--status-success))",
  padding: 12,
};

const neutralBox: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--cmd-border, var(--border-default))",
  background: "var(--cmd-row-hover, var(--bg-surface-low))",
  color: "var(--cmd-text, var(--text-primary))",
  padding: 12,
  fontSize: 14,
  fontWeight: 800,
};

const iconBtn: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--cmd-border, var(--border-default))",
  background: "transparent",
  color: "var(--cmd-text-muted, var(--text-muted))",
  padding: 8,
  cursor: "pointer",
};

const primaryBtn = (variant: "good" | "warn" | "danger"): CSSProperties => ({
  marginTop: 16,
  width: "100%",
  borderRadius: 12,
  border: "none",
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  background:
    variant === "good"
      ? "var(--cmd-good, var(--status-success))"
      : variant === "warn"
        ? "var(--cmd-warn, var(--status-warning))"
        : "var(--cmd-danger, var(--status-error))",
  color:
    variant === "warn"
      ? "var(--cmd-on-gold, #20160a)"
      : "var(--cmd-pill-on-solid, #fff)",
});

const input: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--cmd-border, var(--border-default))",
  background: "var(--cmd-surface, var(--bg-surface))",
  color: "var(--cmd-text, var(--text-primary))",
  padding: 12,
  fontSize: 14,
  fontWeight: 500,
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  resize: "vertical" as const,
};

function CheckRow({
  passed,
  label,
  blockers,
}: {
  passed: boolean;
  label: string;
  blockers: string[];
}) {
  return (
    <div style={passed ? goodBox : dangerBox}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {passed ? <CheckCircle2 className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}
        <span style={{ fontSize: 14, fontWeight: 800 }}>{label}</span>
      </div>
      {blockers.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 24, fontSize: 12, display: "grid", gap: 4 }}>
          {blockers.map((blocker) => (
            <p key={blocker} style={{ margin: 0 }}>
              {presentBlocker(blocker)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function GhostBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 8,
        border: "1px solid var(--cmd-border, var(--border-default))",
        background: "transparent",
        color: "var(--cmd-warn-text, var(--status-warning))",
        padding: "8px 16px",
        fontSize: 14,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default function CanonicalFabReleasePanel({
  projectId,
  workPackageId,
  pieceControlMode,
}: CanonicalFabReleasePanelProps) {
  const queryClient = useQueryClient();
  const enabled = Boolean(projectId && workPackageId && pieceControlMode !== "off");
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const exceptionReasonId = `piece-release-exception-reason-${workPackageId}`;

  const gateQuery = useQuery({
    queryKey: ["canonical-release-gate", workPackageId],
    queryFn: () => evaluateCanonicalReleaseGate(workPackageId),
    enabled,
    staleTime: 5_000,
  });
  const gate = gateQuery.data;

  const releaseMutation = useMutation({
    mutationFn: (reason: string | null) => releaseCanonicalWorkPackage(workPackageId, reason),
    onSuccess: async (result) => {
      setExceptionOpen(false);
      setExceptionReason("");
      await Promise.all([
        // Lifecycle write-through → 3D Fab colors (staleTime 30s, no focus refetch).
        invalidatePieceControlQueries(queryClient, projectId, "production"),
        queryClient.invalidateQueries({ queryKey: ["canonical-release-gate", workPackageId] }),
        queryClient.invalidateQueries({ queryKey: ["piece-relationships", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["piece-register", projectId] }),
      ]);
      if (result.is_exception) {
        toast.warning(`Exception release recorded. Schedule risk ${result.risk_id ?? ""} created.`);
      } else {
        toast.success(`Released as ${result.release_number}`);
      }
    },
    onError: (error: Error) =>
      toast.error(presentPieceControlError(error, "Fabrication release failed.")),
  });

  if (!enabled) {
    return (
      <div style={warnBox}>
        Fabrication release is unavailable until the Piece Register is set up.
      </div>
    );
  }

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div
            style={{
              borderRadius: 12,
              padding: 8,
              background: "var(--cmd-icon-wash, var(--accent-muted))",
              color: "var(--cmd-gold, var(--accent))",
            }}
          >
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 800, color: "var(--cmd-text, var(--text-primary))" }}>
              Fabrication release
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, ...muted }}>
              Four required checks must pass before fabrication release.
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Refresh fabrication release checks"
          onClick={() => gateQuery.refetch()}
          disabled={gateQuery.isFetching}
          style={{ ...iconBtn, opacity: gateQuery.isFetching ? 0.4 : 1 }}
        >
          <RefreshCw className={`h-4 w-4 ${gateQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {gateQuery.isLoading && (
        <p style={{ marginTop: 16, fontSize: 14, ...muted }}>Checking fabrication release…</p>
      )}
      {gateQuery.error && (
        <p style={{ marginTop: 16, fontSize: 14, fontWeight: 600, color: "var(--cmd-danger-text, var(--status-error))" }}>
          {presentPieceControlError(
            gateQuery.error,
            "Fabrication release could not be evaluated.",
          )}
        </p>
      )}

      {gate && (
        <>
          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {CHECK_LABELS.map(({ key, label }) => {
              const check = gate.checks[key];
              return (
                <CheckRow
                  key={key}
                  passed={check.passed}
                  label={label}
                  blockers={check.blockers}
                />
              );
            })}
          </div>

          {gate.already_released ? (
            <div style={{ ...neutralBox, marginTop: 16 }}>
              This work package is already released.
            </div>
          ) : gate.passes ? (
            <button
              type="button"
              disabled={releaseMutation.isPending}
              onClick={() => releaseMutation.mutate(null)}
              style={{ ...primaryBtn("good"), opacity: releaseMutation.isPending ? 0.4 : 1 }}
            >
              {releaseMutation.isPending ? "Releasing…" : "Release for fabrication"}
            </button>
          ) : gate.checks.scope.passed ? (
            <button
              type="button"
              disabled={releaseMutation.isPending}
              onClick={() => setExceptionOpen(true)}
              style={{ ...primaryBtn("warn"), opacity: releaseMutation.isPending ? 0.4 : 1 }}
            >
              Release with exception
            </button>
          ) : (
            <div style={{ ...dangerBox, marginTop: 16, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
              Missing active piece scope is a hard block and cannot be overridden.
            </div>
          )}
        </>
      )}

      {exceptionOpen && gate && (
        <div style={{ ...warnBox, marginTop: 16, borderWidth: 2, borderStyle: "solid" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
            <AlertOctagon className="h-5 w-5" />
            Exception release creates a High schedule risk
          </div>
          <p style={{ marginTop: 8, fontSize: 12, opacity: 0.95 }}>
            The risk will retain the current release checks, blockers, reason, work package, and release reference.
          </p>
          <div style={{ marginTop: 12, display: "grid", gap: 4, fontSize: 12 }}>
            {gate.blockers.map((blocker) => (
              <p key={blocker} style={{ margin: 0 }}>
                • {presentBlocker(blocker)}
              </p>
            ))}
          </div>
          <label
            htmlFor={exceptionReasonId}
            style={{
              marginTop: 16,
              display: "grid",
              gap: 4,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Required exception reason
            <textarea
              id={exceptionReasonId}
              value={exceptionReason}
              onChange={(event) => setExceptionReason(event.target.value)}
              rows={4}
              style={{ ...input, textTransform: "none", letterSpacing: "normal", fontWeight: 500 }}
              placeholder="Explain why fabrication must proceed and how the blockers will be managed."
            />
          </label>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={!exceptionReason.trim() || releaseMutation.isPending}
              onClick={() => releaseMutation.mutate(exceptionReason.trim())}
              style={{
                ...primaryBtn("danger"),
                marginTop: 0,
                width: "auto",
                opacity: !exceptionReason.trim() || releaseMutation.isPending ? 0.4 : 1,
              }}
            >
              Confirm exception release
            </button>
            <GhostBtn
              onClick={() => {
                setExceptionOpen(false);
                setExceptionReason("");
              }}
            >
              Cancel
            </GhostBtn>
          </div>
        </div>
      )}
    </div>
  );
}
