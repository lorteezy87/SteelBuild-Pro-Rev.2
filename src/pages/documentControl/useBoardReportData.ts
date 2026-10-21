/**
 * useBoardReportData — real data behind the Document Control Board Report.
 *
 * Maps four live sources onto the view models the screens render:
 *   register     → useDrawingRegister (a COMPLETE read, not capped)
 *   submittals   → entities.Submittal
 *   RFIs         → entities.RFI
 *   transmittals → entities.DrawingTransmittal
 *
 * TRUNCATION IS REPORTED, NOT SWALLOWED.
 * Three of those four are ordinary capped reads. A dashboard's whole job is to
 * print counts, and a count taken off a cut-off list is simply wrong — the
 * same class of bug CLAUDE.md records for the detailing row caps. So each log
 * compares its length against EFFECTIVE_LIST_CAP (the min of what we ask for
 * and PostgREST's own db-max-rows, which is the number a read is actually cut
 * off at) and sets `truncated`. The masthead then says "at least N" instead of
 * stating a total it cannot know. The register is exempt because
 * useDrawingRegister reads to completeness and throws rather than returning a
 * short list.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities, EFFECTIVE_LIST_CAP } from "@/api/supabaseClient";
import { useDrawingRegister, type DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import {
  type CalendarDay,
  type DcStatus,
  type RfiImpact,
  CONTRACT_RETURN_DAYS,
  daysBetween,
  parseCalendarDay,
  todayCalendarDay,
} from "./boardReportDerive";

/* ─── view models ────────────────────────────────────────────────────────── */

export interface RegisterRow {
  id: string;
  sheet: string;
  title: string;
  seq: string;
  rev: string;
  status: DcStatus;
  sentOn: CalendarDay | null;
  backOn: CalendarDay | null;
  ballInCourt: string;
  setName: string;
  onHold: boolean;
  holdReason: string | null;
  rfiCount: number;
}

export interface SubmittalRow {
  id: string;
  pkg: string;
  title: string;
  sheets: number;
  sentOn: CalendarDay | null;
  ballInCourt: string;
  daysOut: number;
  status: DcStatus;
  reviewer: string;
}

export interface RfiRow {
  id: string;
  number: string;
  subject: string;
  ref: string;
  ballInCourt: string;
  dueOn: CalendarDay | null;
  daysOpen: number;
  impact: RfiImpact;
  question: string;
  proposedSolution: string;
  status: string;
}

export interface TransmittalRow {
  id: string;
  number: string;
  recipient: string;
  contact: string;
  purpose: string;
  sentOn: CalendarDay | null;
  sentLabel: string;
  acknowledged: boolean;
  acknowledgedBy: string;
  hoursWaiting: number | null;
}

export interface BoardReportLog<T> {
  rows: T[];
  /** True when the read hit the cap, so any count off it is a floor, not a total. */
  truncated: boolean;
}

export interface BoardReportData {
  register: BoardReportLog<RegisterRow>;
  submittals: BoardReportLog<SubmittalRow>;
  rfis: BoardReportLog<RfiRow>;
  transmittals: BoardReportLog<TransmittalRow>;
  isLoading: boolean;
  isError: boolean;
  today: CalendarDay;
}

/* ─── status mapping ─────────────────────────────────────────────────────── */

/**
 * A sheet's Board Report badge.
 *
 * Order matters and is not arbitrary. A hold outranks everything: a sheet can
 * be released AND held, and the held-ness is the thing a PM needs to see. Only
 * then does the workflow stage decide. `isPackageReleasedForFab`-equivalent
 * terminal stages read REL; the in-flight stages read REV.
 */
export function registerStatus(row: Pick<DrawingRegisterRow, "stage" | "current_status" | "active_hold_id">): DcStatus {
  if (row.active_hold_id) return "HOLD";

  const status = (row.current_status ?? "").toLowerCase();
  if (status.includes("revise") || status.includes("resubmit")) return "R&R";

  const stage = row.stage ?? "";
  if (stage === "Released" || stage === "Released for Fabrication" || stage === "IFC") return "REL";
  if (["IFA", "OFA", "BFA", "OFS"].includes(stage)) return "REV";
  if (stage === "Detailing" || stage === "In Detailing") return "DET";
  if (!stage) return "NONE";
  return "DET";
}

/** A package's badge: returned-for-revision first, then past the contract return, then in review. */
export function submittalStatus(status: string | null, daysOut: number, returnedDate: string | null): DcStatus {
  const s = (status ?? "").toLowerCase();
  if (s.includes("revise") || s.includes("resubmit")) return "R&R";
  if (s.includes("approved") || s.includes("released")) return "REL";
  if (!returnedDate && daysOut > CONTRACT_RETURN_DAYS) return "LATE";
  return "REV";
}

/**
 * An RFI's impact pill. Fab hold outranks cost outranks schedule; Info is the
 * floor, not a claim that the RFI is harmless.
 */
export function rfiImpact(row: {
  holds_released_count?: number | null;
  cost_impact?: boolean | string | null;
  schedule_impact?: boolean | string | null;
}): RfiImpact {
  const truthy = (v: boolean | string | null | undefined) =>
    v === true || (typeof v === "string" && v.length > 0 && v.toLowerCase() !== "none" && v.toLowerCase() !== "no");
  if ((row.holds_released_count ?? 0) > 0) return "Fab hold";
  if (truthy(row.cost_impact)) return "Cost";
  if (truthy(row.schedule_impact)) return "Schedule";
  return "Info";
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

const text = (v: unknown, fallback = "—"): string => {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return fallback;
};

function hoursSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((now.getTime() - then) / 3_600_000));
}

/* ─── the hook ───────────────────────────────────────────────────────────── */

export function useBoardReportData(projectId: string | null): BoardReportData {
  const today = useMemo(() => todayCalendarDay(), []);
  const register = useDrawingRegister(projectId);

  const submittals = useQuery({
    queryKey: ["board-report", "submittals", projectId],
    enabled: Boolean(projectId),
    queryFn: () => entities.Submittal.filter({ project_id: projectId }, "-submitted_date"),
  });

  const rfis = useQuery({
    queryKey: ["board-report", "rfis", projectId],
    enabled: Boolean(projectId),
    queryFn: () => entities.RFI.filter({ project_id: projectId }, "-submitted_date"),
  });

  const transmittals = useQuery({
    queryKey: ["board-report", "transmittals", projectId],
    enabled: Boolean(projectId),
    queryFn: () => entities.DrawingTransmittal.filter({ project_id: projectId }, "-date_sent"),
  });

  return useMemo(() => {
    const now = new Date();

    const submittalSource = (submittals.data ?? []) as Array<Record<string, unknown>>;
    const packageBySet = new Map<string, { submitted: string | null; returned: string | null }>();
    for (const s of submittalSource) {
      const ids = Array.isArray(s.drawing_set_ids) ? (s.drawing_set_ids as unknown[]) : [];
      for (const id of ids) {
        if (typeof id !== "string") continue;
        // Set-per-revision means a set has one submittal; if two ever claim
        // the same set, the newest read wins rather than silently merging.
        if (!packageBySet.has(id)) {
          packageBySet.set(id, {
            submitted: (s.submitted_date as string | null) ?? null,
            returned: (s.returned_date as string | null) ?? null,
          });
        }
      }
    }

    const registerRows: RegisterRow[] = (register.data ?? []).map((r): RegisterRow => {
      // A sheet's "sent" and "back" are the dates of the PACKAGE its drawing
      // set went out in, which is the only place those dates exist.
      const pkg = r.drawing_set_id ? packageBySet.get(r.drawing_set_id) : undefined;
      const sentOn = parseCalendarDay(pkg?.submitted ?? r.current_issued_at);
      return {
        id: r.drawing_id,
        sheet: text(r.sheet_number),
        title: text(r.sheet_title, "Untitled sheet"),
        seq: text(r.discipline, "—"),
        rev: text(r.current_revision, "—"),
        status: registerStatus(r),
        sentOn,
        backOn: parseCalendarDay(pkg?.returned ?? null),
        ballInCourt: text(r.active_hold_id ? "Architect" : null, "—"),
        setName: text(r.drawing_set_name, "—"),
        onHold: Boolean(r.active_hold_id),
        holdReason: r.active_hold_reason ?? null,
        rfiCount: r.rfi_count ?? 0,
      };
    });

    const submittalRaw = submittalSource;
    const submittalRows: SubmittalRow[] = submittalRaw.map((s): SubmittalRow => {
      const sentOn = parseCalendarDay(s.submitted_date as string | null);
      const daysOut = sentOn ? daysBetween(sentOn, today) : 0;
      return {
        id: String(s.id),
        pkg: text(s.submittal_number),
        title: text(s.title, "Untitled package"),
        sheets: Array.isArray(s.drawing_set_ids) ? s.drawing_set_ids.length : 0,
        sentOn,
        ballInCourt: text(s.ball_in_court),
        daysOut,
        status: submittalStatus(s.status as string | null, daysOut, (s.returned_date as string | null) ?? null),
        reviewer: text(s.reviewer),
      };
    });

    const rfiRaw = (rfis.data ?? []) as Array<Record<string, unknown>>;
    const rfiRows: RfiRow[] = rfiRaw.map((r): RfiRow => {
      const asked = parseCalendarDay((r.submitted_date as string | null) ?? (r.created_date as string | null));
      return {
        id: String(r.id),
        number: text(r.rfi_number),
        subject: text(r.title, text(r.question, "Untitled RFI")),
        ref: text(r.drawing_reference),
        ballInCourt: text(r.ball_in_court),
        dueOn: parseCalendarDay((r.due_date as string | null) ?? (r.date_required as string | null)),
        daysOpen: asked ? daysBetween(asked, today) : 0,
        impact: rfiImpact(r as Parameters<typeof rfiImpact>[0]),
        question: text(r.question, ""),
        proposedSolution: text(r.description, ""),
        status: text(r.status, ""),
      };
    });

    const xmRaw = (transmittals.data ?? []) as Array<Record<string, unknown>>;
    const transmittalRows: TransmittalRow[] = xmRaw.map((t): TransmittalRow => {
      const ackAt = (t.acknowledged_at as string | null) ?? null;
      return {
        id: String(t.id),
        number: text(t.transmittal_number),
        recipient: text(t.recipient_company, text(t.sent_to)),
        contact: text(t.sent_to, ""),
        purpose: text(t.purpose, "—"),
        sentOn: parseCalendarDay(t.date_sent as string | null),
        sentLabel: text(t.date_sent, "—").slice(0, 10),
        acknowledged: Boolean(ackAt),
        acknowledgedBy: text(t.acknowledged_by_name, ""),
        hoursWaiting: ackAt ? null : hoursSince(t.date_sent as string | null, now),
      };
    });

    const atCap = (n: number) => n >= EFFECTIVE_LIST_CAP;

    return {
      register: { rows: registerRows, truncated: false },
      submittals: { rows: submittalRows, truncated: atCap(submittalRaw.length) },
      rfis: { rows: rfiRows, truncated: atCap(rfiRaw.length) },
      transmittals: { rows: transmittalRows, truncated: atCap(xmRaw.length) },
      isLoading: register.isLoading || submittals.isLoading || rfis.isLoading || transmittals.isLoading,
      isError: register.isError || submittals.isError || rfis.isError || transmittals.isError,
      today,
    };
  }, [register.data, register.isLoading, register.isError, submittals.data, submittals.isLoading, submittals.isError, rfis.data, rfis.isLoading, rfis.isError, transmittals.data, transmittals.isLoading, transmittals.isError, today]);
}

/**
 * "394" when the read was complete, "at least 1,000" when it was cut off.
 * A dashboard that prints a cut-off count as a total is lying quietly.
 */
export function countLabel(n: number, truncated: boolean): string {
  return truncated ? `at least ${n.toLocaleString()}` : n.toLocaleString();
}
