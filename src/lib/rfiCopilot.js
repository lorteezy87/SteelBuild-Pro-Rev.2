/**
 * rfiCopilot.js — AI assist for drafting an RFI response, with a deterministic
 * offline fallback.
 *
 * Per §17: AI may DRAFT and SUGGEST — it never auto-answers or closes an RFI.
 * The panel shows the draft for a human to review, edit, and apply. The live
 * path routes through the llm-proxy gateway (useCase "rfi-copilot"); if the
 * gateway errors or returns nothing, `offlineDraft` returns a structured
 * skeleton so the feature still helps without a network/LLM dependency.
 */
import { integrations } from "@/api/supabaseClient";

function rfiQuestionText(rfi) {
  return String(rfi?.question || rfi?.description || rfi?.title || "").trim();
}

function rfiContextLines(rfi) {
  const lines = [];
  if (rfi?.rfi_number) lines.push(`RFI: ${rfi.rfi_number}`);
  if (rfi?.subject || rfi?.title) lines.push(`Subject: ${rfi.subject || rfi.title}`);
  if (rfi?.drawing_reference) lines.push(`Drawing reference: ${rfi.drawing_reference}`);
  if (rfi?.spec_section) lines.push(`Spec section: ${rfi.spec_section}`);
  if (rfi?.priority) lines.push(`Priority: ${rfi.priority}`);
  if (rfi?.ball_in_court) lines.push(`Ball in court: ${rfi.ball_in_court}`);
  return lines;
}

export const RFI_COPILOT_SYSTEM =
  "You are an RFI copilot for a structural-steel fabricator and erector. " +
  "Given a Request for Information, draft a clear, professional PROPOSED RESPONSE " +
  "the project team can review and adapt. Be concise and specific. Reference the " +
  "cited drawing/spec when given. If information is missing, state the assumption " +
  "explicitly and what is needed to confirm. NEVER invent dimensions, member sizes, " +
  "weld specs, or approvals — flag those as items requiring engineer/EOR confirmation. " +
  "Plain text only.";

/** Build the user prompt sent to the gateway. Exported for testing. */
export function buildCopilotPrompt(rfi) {
  const ctx = rfiContextLines(rfi);
  const q = rfiQuestionText(rfi) || "(no question text recorded)";
  return [
    ctx.length ? ctx.join("\n") : null,
    "",
    "QUESTION:",
    q,
    "",
    "Draft a proposed response. End with a short \"Needs confirmation:\" list if anything must be verified by the EOR/engineer.",
  ].filter((l) => l !== null).join("\n");
}

/**
 * Deterministic offline draft — used when the LLM gateway is unavailable.
 * A structured skeleton the responder fills in (never fabricated content).
 */
export function offlineDraft(rfi) {
  const ctx = rfiContextLines(rfi);
  const q = rfiQuestionText(rfi);
  const ref = rfi?.drawing_reference
    ? `as shown on ${rfi.drawing_reference}`
    : "per the contract documents";
  return [
    `Proposed response to ${rfi?.rfi_number || "this RFI"}:`,
    "",
    q ? `Re: ${q}` : "",
    "",
    `Our understanding is that the work should proceed ${ref}. ` +
      "Please confirm the following so we can release this scope:",
    "",
    "  • [Confirm the controlling dimension / detail]",
    "  • [Confirm material grade / member size if affected]",
    ctx.some((l) => l.startsWith("Spec")) ? "  • [Confirm applicable spec section requirement]" : "  • [Confirm any spec requirement that governs]",
    "",
    "Needs confirmation (EOR/engineer): the items above before fabrication.",
    "",
    "— Drafted offline (AI gateway unavailable). Edit before sending.",
  ].filter((l) => l !== undefined).join("\n");
}

/**
 * Draft an RFI response. Tries the live AI path; on any error / empty result
 * returns the offline skeleton. Returns { text, source: "ai" | "offline" }.
 */
export async function draftRfiResponse({ rfi } = {}) {
  if (!rfi) return { text: "", source: "offline" };
  try {
    const res = await integrations.Core.InvokeLLM({
      system: RFI_COPILOT_SYSTEM,
      prompt: buildCopilotPrompt(rfi),
      useCase: "rfi-copilot",
      project_id: rfi.project_id,
      temperature: 0.3,
      maxTokens: 700,
    });
    const text = (res?.text || (typeof res?.content === "string" ? res.content : "") || "").trim();
    if (res?.error || !text) return { text: offlineDraft(rfi), source: "offline" };
    return { text, source: "ai" };
  } catch {
    return { text: offlineDraft(rfi), source: "offline" };
  }
}
