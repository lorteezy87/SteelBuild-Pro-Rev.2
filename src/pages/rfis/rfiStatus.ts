/**
 * Canonical presentation model for RFI status.
 *
 * Every surface that shows an RFI status — register row, board column, detail
 * panel, filter chip, KPI — resolves it through here, so "what colour is
 * Answered" and "is Void closed" have exactly one answer.
 *
 * This module exists because those answers had drifted apart:
 *
 *  - `RfiRow` rendered the SHORT label ("OPEN", "ANSWERED") through
 *    `StatusPill`, whose auto-colour map is keyed on the FULL status names
 *    ("Open", "Answered"). Every lookup missed and fell through to
 *    `var(--text-muted)`, so all five statuses rendered in identical grey —
 *    open and closed RFIs were indistinguishable at a glance.
 *  - `STATUS_CFG[status] || STATUS_CFG.Open` meant a **Void** RFI painted
 *    itself as an amber *Open* pill.
 *  - Four different sets defined "closed": the canonical
 *    {Answered, Closed, Void}, two local {Answered, Closed} sets that let a
 *    voided RFI keep ageing and keep firing overdue alerts, and the derive
 *    layer's complement of OPEN_STATUSES.
 *
 * Lifecycle is the primary signal the UI encodes; the specific status is
 * secondary. Closed work should recede, open work should be legible.
 */
import { isRfiClosed } from "@/lib/entityPredicates";

export type RfiLifecycle = "open" | "closed";

export interface RfiStatusView {
  /** The stored status, normalised. */
  status: string;
  /** Full human label. */
  label: string;
  /** Short label for narrow columns — the register's status column is 110px. */
  shortLabel: string;
  /** Token for text/border. */
  color: string;
  /** Open vs closed. The register's primary visual grouping. */
  lifecycle: RfiLifecycle;
  isClosed: boolean;
}

/**
 * The six values allowed by the `rfis.status` CHECK constraint, in lifecycle
 * order. Keep in sync with the database — a value missing here renders through
 * `UNKNOWN_STATUS` rather than silently borrowing another status's colour.
 */
export const RFI_STATUSES = [
  "Open",
  "Under Review",
  "Incomplete Response",
  "Answered",
  "Closed",
  "Void",
] as const;

export type RfiStatus = (typeof RFI_STATUSES)[number];

const VIEWS: Record<string, Omit<RfiStatusView, "lifecycle" | "isClosed">> = {
  Open: { status: "Open", label: "Open", shortLabel: "OPEN", color: "var(--status-warning)" },
  "Under Review": {
    status: "Under Review",
    label: "Under Review",
    shortLabel: "REVIEW",
    color: "var(--status-info)",
  },
  // GC replied but the answer does not fully address the question — another
  // round is needed. Danger palette so it reads as "needs action", distinct
  // from the in-progress amber of Open.
  "Incomplete Response": {
    status: "Incomplete Response",
    label: "Incomplete Response",
    shortLabel: "INCOMPLETE",
    color: "var(--status-error)",
  },
  Answered: {
    status: "Answered",
    label: "Answered",
    shortLabel: "ANSWERED",
    color: "var(--status-success)",
  },
  Closed: { status: "Closed", label: "Closed", shortLabel: "CLOSED", color: "var(--text-muted)" },
  // Void is closed but NOT a success — it must never read as Answered, and it
  // must never fall back to Open (which is what the old lookup did).
  Void: { status: "Void", label: "Void", shortLabel: "VOID", color: "var(--text-disabled)" },
};

const UNKNOWN_STATUS: Omit<RfiStatusView, "lifecycle" | "isClosed"> = {
  status: "",
  label: "Unknown",
  shortLabel: "UNKNOWN",
  color: "var(--text-muted)",
};

/**
 * Resolve any stored status to its presentation. Unknown values render as
 * "UNKNOWN" and are treated as OPEN — an unrecognised status is work someone
 * still has to look at, so failing open surfaces it rather than hiding it.
 */
export function rfiStatusView(status: string | null | undefined): RfiStatusView {
  const key = String(status ?? "").trim();
  const base = VIEWS[key] ?? { ...UNKNOWN_STATUS, status: key };
  const closed = isRfiClosed({ status: key });
  return { ...base, isClosed: closed, lifecycle: closed ? "closed" : "open" };
}

/** Short label for narrow columns. */
export const rfiStatusShortLabel = (status: string | null | undefined): string =>
  rfiStatusView(status).shortLabel;

/** Token colour for a status. */
export const rfiStatusColor = (status: string | null | undefined): string =>
  rfiStatusView(status).color;

/**
 * The colour that should drive a register row's urgency accent.
 *
 * Deliberately different from the status colour: a closed RFI gets no accent
 * at all (it is settled, it should recede), and for open RFIs lateness
 * outranks the status, because an overdue RFI is the thing to look at first.
 */
export function rfiAccentColor(
  rfi: { status?: string | null; priority?: string | null },
  overdue: boolean,
): string | null {
  const view = rfiStatusView(rfi.status);
  if (view.isClosed) return null;
  if (overdue) return "var(--status-error)";
  if (rfi.priority === "Critical") return "var(--status-review)";
  return view.color;
}

/** Board columns, including Void so voided RFIs are not silently dropped. */
export const RFI_STATUS_COLUMNS: readonly RfiStatus[] = RFI_STATUSES;
