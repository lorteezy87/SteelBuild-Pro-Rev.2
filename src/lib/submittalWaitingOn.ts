/**
 * submittalWaitingOn.ts — the "Waiting on" list for one submittal.
 *
 * Each item names the blocker, why it blocks, and who owns clearing it. It is
 * derived only from recorded fields: stage (via submittalStatusToStage), the
 * returned-comment dispositions (via the canonical comment gate) and the
 * submittal's own linked RFIs (`submittals.linked_rfi_ids`, uuid[] → rfis.id;
 * never pooled with the drawing text column — see CLAUDE.md).
 *
 * Pure: no React, no Supabase.
 */
import { submittalStatusToStage } from "@/lib/submittalStageMapping";
import { collectUnresolvedRequiredComments } from "@/lib/commentDispositionGate";
import type { CommentDispositionLike } from "@/lib/commentDispositionGate";

export interface WaitingOnItem {
  what: string;
  why: string | null;
  owner: string | null;
}

export interface WaitingOnSubmittal {
  status?: string | null;
  ball_in_court?: string | null;
  approved_date?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  linked_rfi_ids?: readonly string[] | null;
  submittal_type?: string | null;
}

export interface WaitingOnRfi {
  id?: string | null;
  rfi_number?: string | number | null;
  subject?: string | null;
  status?: string | null;
  ball_in_court?: string | null;
}

const RFI_CLOSED = new Set(["Answered", "Closed", "Void"]);

export function submittalWaitingOn(
  submittal: WaitingOnSubmittal | null | undefined,
  ctx: { rfis?: readonly WaitingOnRfi[]; commentDispositions?: readonly CommentDispositionLike[] } = {},
): WaitingOnItem[] {
  if (!submittal) return [];
  const status = String(submittal.status ?? "").trim();
  const bic = String(submittal.ball_in_court ?? "").trim() || null;
  const stage = submittalStatusToStage(status, bic, submittal.approved_date ?? null);
  const items: WaitingOnItem[] = [];

  if (!submittal.submittal_type) {
    items.push({ what: "Submittal type", why: "Untyped records cannot govern drawing approval", owner: null });
  }

  switch (stage) {
    case "OFA":
      items.push({
        what: "Reviewer response",
        why: submittal.submitted_date ? `Out for approval since ${submittal.submitted_date.slice(0, 10)}` : "Out for approval; sent date not recorded",
        owner: bic,
      });
      break;
    case "IFA":
      items.push({
        what: status === "Draft" ? "Submit the package" : "Internal review before sending out",
        why: null,
        owner: bic,
      });
      break;
    case "R&R":
      items.push({
        what: "Revised resubmittal",
        why: `Returned ${status}${submittal.returned_date ? ` on ${submittal.returned_date.slice(0, 10)}` : ""}`,
        owner: bic,
      });
      break;
    case "BFA":
      items.push({ what: "Route the returned package", why: `Back from approval: ${status}`, owner: bic });
      break;
    default:
      break;
  }

  if (stage === "OFS" || stage === "R&R" || stage === "BFA") {
    const open = collectUnresolvedRequiredComments([...(ctx.commentDispositions ?? [])]);
    if (open.length > 0) {
      items.push({
        what: `${open.length} returned comment${open.length === 1 ? "" : "s"} not incorporated`,
        why: stage === "OFS" ? "Blocks issue for construction" : "Must be resolved before resubmitting",
        owner: "Detailer",
      });
    }
  }

  if (stage !== "Released" && stage !== null) {
    const linked = new Set((submittal.linked_rfi_ids ?? []).filter(Boolean));
    if (linked.size > 0) {
      for (const rfi of ctx.rfis ?? []) {
        if (!rfi?.id || !linked.has(rfi.id) || RFI_CLOSED.has(String(rfi.status ?? "").trim())) continue;
        const num = rfi.rfi_number != null && String(rfi.rfi_number).trim() ? `RFI ${rfi.rfi_number}` : "Linked RFI";
        items.push({
          what: `${num} open`,
          why: rfi.subject ? String(rfi.subject) : "Linked RFI is not answered",
          owner: rfi.ball_in_court ? String(rfi.ball_in_court) : null,
        });
      }
    }
  }

  return items;
}
