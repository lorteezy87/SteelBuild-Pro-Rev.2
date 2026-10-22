/**
 * WhyWaitingWhoPanel — three answers for any controlled record:
 *   Why it moved   — the last tracked change, read from the server audit log
 *                    (pma_audit_logs, written by audit_log_trigger()).
 *   Waiting on     — the caller's current blockers, each with why and owner.
 *   Who acts next  — ball in court, named person if known, and the due date.
 *
 * The audit read is the only fetch. A failed read says the trail is
 * unavailable; it never reads as "no moves".
 */
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties, ReactNode } from "react";
import { fetchRecordAudit } from "@/api/client/recordAudit";
import { buildRecordMoves, describeMove } from "@/lib/recordMovement";
import type { AuditRow } from "@/lib/recordMovement";
import type { TrackedField } from "@/lib/recordMovement";
import { formatShortDate } from "@/utils/dates";

export interface WaitingItem {
  what: string;
  why?: string | null;
  owner?: string | null;
}

export interface WhyWaitingWhoPanelProps {
  /** pma_audit_logs.entity_type — the table name, e.g. "submittals". */
  entityTable: "submittals" | "drawing_sets" | "drawings" | "rfis";
  recordId: string | null | undefined;
  projectId: string | null | undefined;
  fields: readonly TrackedField[];
  waitingOn: readonly WaitingItem[];
  /** Until the blocker source is known, say so instead of "No recorded blockers". */
  waitingOnStatus?: "ready" | "loading" | "unavailable" | "incomplete";
  /** null = nobody recorded. Shown as such, never guessed. */
  ballInCourt: string | null | undefined;
  person?: string | null;
  dueDate?: string | null;
  nextMove?: string | null;
  today?: string;
}

/** Audit rows read per page, and the most the panel will page through. */
const AUDIT_PAGE = 50;
const AUDIT_MAX_ROWS = 500;
const MOVES_SHOWN = 4;

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" });
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = /^\d{4}-\d{2}-\d{2}/.test(fromIso) ? new Date(`${fromIso.slice(0, 10)}T12:00:00`) : null;
  const b = /^\d{4}-\d{2}-\d{2}/.test(toIso) ? new Date(`${toIso.slice(0, 10)}T12:00:00`) : null;
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export default function WhyWaitingWhoPanel({
  entityTable,
  recordId,
  projectId,
  fields,
  waitingOn,
  waitingOnStatus = "ready",
  ballInCourt,
  person,
  dueDate,
  nextMove,
  today,
}: WhyWaitingWhoPanelProps) {
  const audit = useQuery({
    queryKey: ["record-audit-pages", entityTable, recordId, projectId],
    enabled: Boolean(recordId && projectId),
    staleTime: 30_000,
    // Untracked edits (title, notes, metadata) share the audit table with
    // workflow moves, so one short page can hold none. Page on until enough
    // moves are found, the history ends, or the cap is hit; a capped read
    // that found nothing says so instead of claiming there are no moves.
    queryFn: async () => {
      const rows: AuditRow[] = [];
      for (let offset = 0; offset < AUDIT_MAX_ROWS; offset += AUDIT_PAGE) {
        const page = await fetchRecordAudit({
          projectId: projectId as string, table: entityTable, recordId: recordId as string, limit: AUDIT_PAGE, offset,
        });
        rows.push(...page);
        if (page.length < AUDIT_PAGE || buildRecordMoves(rows, fields, MOVES_SHOWN).length >= MOVES_SHOWN) {
          return { rows, truncated: false };
        }
      }
      return { rows, truncated: true };
    },
  });

  const moves = buildRecordMoves(audit.data?.rows ?? [], fields, MOVES_SHOWN);
  const last = moves[0];
  const dueIn = dueDate && today ? daysBetween(today, dueDate) : null;

  return (
    <section aria-label="Why, waiting on, who" style={wrap} data-testid="why-waiting-who">
      <Row label="Why it moved">
        {audit.isPending && recordId ? (
          <span style={muted}>Loading audit trail…</span>
        ) : audit.isError ? (
          <span role="alert" style={{ color: "var(--status-warning)" }}>Audit trail unavailable. Refresh to retry.</span>
        ) : !last ? (
          <span style={muted}>
            {audit.data?.truncated
              ? `No workflow moves in the latest ${AUDIT_MAX_ROWS} audit entries. Older history was not read.`
              : "No recorded workflow moves yet."}
          </span>
        ) : (
          <>
            <div style={{ color: "var(--text-primary)" }}>{describeMove(last)}</div>
            <div style={mono}>{formatWhen(last.at)} · server audit</div>
            {moves.length > 1 && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ ...muted, cursor: "pointer" }}>Earlier moves ({moves.length - 1})</summary>
                <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                  {moves.slice(1).map((m, i) => (
                    <li key={`${m.at}-${i}`} style={{ marginBottom: 2 }}>
                      <span style={mono}>{formatWhen(m.at)}</span> · {describeMove(m)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Row>

      <Row label="Waiting on">
        {waitingOnStatus === "loading" ? (
          <span style={muted}>Checking blockers…</span>
        ) : waitingOnStatus === "unavailable" ? (
          <span style={{ color: "var(--status-warning)" }}>Blocker check unavailable.</span>
        ) : waitingOnStatus === "incomplete" ? (
          <span style={{ color: "var(--status-warning)" }}>
            Blocker check incomplete: this project has more RFI or comment records than one read returns. Check the RFI log and returned comments directly.
            {waitingOn.length > 0 && <> Found so far: {waitingOn.map((w) => w.what).join("; ")}.</>}
          </span>
        ) : waitingOn.length === 0 ? (
          <span style={muted}>No recorded blockers.</span>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {waitingOn.map((w, i) => (
              <li key={`${w.what}-${i}`} style={{ marginBottom: 3 }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{w.what}</span>
                {w.why && <span style={muted}> — {w.why}</span>}
                {w.owner && <span style={mono}> · {w.owner}</span>}
              </li>
            ))}
          </ul>
        )}
      </Row>

      <Row label="Who acts next">
        <div style={{ color: "var(--text-primary)" }}>
          {ballInCourt ? <strong>{ballInCourt}</strong> : <span style={muted}>No ball in court recorded</span>}
          {person && <span> · {person}</span>}
        </div>
        {(nextMove || dueDate) && (
          <div style={mono}>
            {nextMove && <>Next: {nextMove}</>}
            {nextMove && dueDate && " · "}
            {dueDate && (
              <span style={{ color: dueIn != null && dueIn < 0 ? "var(--status-error)" : undefined }}>
                Due {formatShortDate(dueDate)}
                {dueIn != null && (dueIn < 0 ? ` (${-dueIn}d over)` : dueIn === 0 ? " (today)" : ` (${dueIn}d)`)}
              </span>
            )}
          </div>
        )}
      </Row>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(88px, 110px) 1fr", gap: 10, padding: "6px 0", borderTop: "1px solid var(--border-default)" }}>
      <div style={eyebrow}>{label}</div>
      <div style={{ minWidth: 0, fontSize: 12 }}>{children}</div>
    </div>
  );
}

const wrap: CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: 4,
  padding: "4px 12px 6px",
  margin: "12px 0",
  background: "var(--bg-surface)",
};

const eyebrow: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  paddingTop: 2,
};

const muted: CSSProperties = { color: "var(--text-muted)" };
const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" };
