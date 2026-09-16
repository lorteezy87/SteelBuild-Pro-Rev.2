/**
 * assistant — daily logs and RFI drafts, composed from what is already on the
 * board.
 *
 * ## Deterministic, and therefore available offline
 *
 * These drafts are assembled locally from board records. No model call, which
 * means they work in a basement with no signal — the condition under which a
 * daily log actually gets written. The board already knows what was touched
 * today, which tasks are blocked and why, which sheet a pin sits on; that is
 * most of a log and nearly all of an RFI's factual half.
 *
 * A model can improve the prose afterwards. {@link DailyLogDraft} and
 * {@link RfiDraft} are structured for exactly that: hand the sections to the
 * app's LLM integration when there is a network, or send them as they are when
 * there is not. What must never happen is a model *inventing* a section this
 * module found nothing for.
 *
 * ## Empty sections say "none recorded"
 *
 * A log that prints "Delays: none" is making a claim about the day. This module
 * only knows what reached the board, so it says "None recorded" — the same
 * distinction the rest of the app draws between a false value and an absent one.
 * A GC reading "none recorded" knows to ask; one reading "none" does not.
 */

import { durationFromDates } from "@/lib/schedule/duration";
import { findOverlay } from "./document";
import {
  isDeliveryNode,
  isTaskNode,
  nodeText,
  type BoardDeliveryNode,
  type BoardDoc,
  type BoardNode,
  type BoardTaskNode,
} from "./types";

/** Placeholder for a section with nothing in it. See the file header. */
export const NONE_RECORDED = "None recorded.";

/** Date-only prefix of an ISO timestamp, for "was this touched today" checks. */
function isoDay(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** Nodes whose last edit falls on `date` (a `YYYY-MM-DD` string). */
export function nodesTouchedOn(doc: BoardDoc, date: string): BoardNode[] {
  return doc.nodes.filter((node) => isoDay(node.updated_at) === date);
}

/** Task nodes flagged blocked, whatever their status. */
export function blockedTasks(doc: BoardDoc): BoardTaskNode[] {
  return doc.nodes.filter(isTaskNode).filter((task) => task.blocked);
}

/** Tasks whose scheduled window contains `date`. */
export function tasksActiveOn(doc: BoardDoc, date: string): BoardTaskNode[] {
  return doc.nodes
    .filter(isTaskNode)
    .filter(
      (task) =>
        !!task.start_date &&
        !!task.end_date &&
        durationFromDates(task.start_date, task.end_date) !== null &&
        task.start_date <= date &&
        date <= task.end_date,
    );
}

/**
 * The sheet a node is pinned to, as a citation string.
 *
 * Returns null for a node on the open canvas. An RFI or log line with no sheet
 * says nothing about a sheet rather than guessing at the nearest one — citing
 * the wrong sheet number is worse than citing none, because it gets answered.
 */
export function sheetCitation(doc: BoardDoc, node: BoardNode): string | null {
  if (!node.anchor) return null;
  const overlay = findOverlay(doc, node.anchor.overlay_id);
  if (!overlay) return null;
  const sheet = overlay.sheet_number.trim();
  const name = overlay.name.trim();
  if (sheet && name && sheet !== name) return `${sheet} (${name})`;
  return sheet || name || null;
}

/**
 * Where on the sheet a pin sits, in plain words.
 *
 * Fractions mean nothing to a detailer; a ninths grid ("upper left", "centre
 * right") is how someone describes a location on a drawing over the phone. It is
 * approximate and reads as approximate, which is correct — the pin is a pointer,
 * not a dimension.
 */
export function sheetRegion(doc: BoardDoc, node: BoardNode): string | null {
  if (!node.anchor) return null;
  const overlay = findOverlay(doc, node.anchor.overlay_id);
  if (!overlay) return null;
  const band = (t: number, low: string, mid: string, high: string): string =>
    t < 1 / 3 ? low : t < 2 / 3 ? mid : high;
  const vertical = band(node.anchor.v, "upper", "middle", "lower");
  const horizontal = band(node.anchor.u, "left", "centre", "right");
  return `${vertical} ${horizontal}`;
}

/** Deliveries needed on `date`. */
export function deliveriesOn(doc: BoardDoc, date: string): BoardDeliveryNode[] {
  return doc.nodes.filter(isDeliveryNode).filter((d) => d.needed_by === date);
}

/**
 * Deliveries whose date has passed and that are not marked received.
 *
 * Both halves are required. A past date on its own says nothing — most
 * deliveries on a board are in the past by the end of a job — and an unreceived
 * flag on its own is the normal state of everything still to come. Only the
 * pair is a problem worth putting in front of a GC.
 */
export function overdueDeliveries(doc: BoardDoc, date: string): BoardDeliveryNode[] {
  return doc.nodes
    .filter(isDeliveryNode)
    .filter((d) => !!d.needed_by && d.needed_by < date && !d.received);
}

function deliveryLine(delivery: BoardDeliveryNode, today: string): string {
  const what = delivery.material.trim() || "(unnamed material)";
  const who = delivery.vendor.trim() ? ` (${delivery.vendor.trim()})` : "";
  if (delivery.received) return `${what}${who} — received`;
  if (delivery.needed_by && delivery.needed_by < today) {
    return `${what}${who} — was due ${delivery.needed_by}, not received`;
  }
  // Not "not delivered": the board knows it has not been *marked* received,
  // which is not the same as knowing it did not arrive.
  return `${what}${who} — expected, not marked received`;
}

export interface DailyLogSection {
  heading: string;
  lines: string[];
}

export interface DailyLogDraft {
  date: string;
  project_name: string;
  prepared_by: string;
  sections: DailyLogSection[];
  /** The whole log as pasteable plain text. */
  text: string;
}

export interface DailyLogInput {
  date: string;
  project_name: string;
  prepared_by: string;
  /**
   * Dictated notes, verbatim.
   *
   * Included as spoken rather than paraphrased. A daily log is a contemporaneous
   * record that can end up in a claim file, so the words are the foreman's or
   * they are not evidence.
   */
  transcript?: string;
}

/**
 * Assemble a daily log for one date from the board.
 *
 * Sections follow the order a GC reads them in: what was worked, what stopped,
 * what was seen, what was said.
 */
export function draftDailyLog(doc: BoardDoc, input: DailyLogInput): DailyLogDraft {
  const { date } = input;
  const touched = nodesTouchedOn(doc, date);

  const active = tasksActiveOn(doc, date);
  const workLines = active.map((task) => {
    const parts = [task.text.trim() || "(untitled task)"];
    parts.push(`— ${task.status}`);
    if (task.owner.trim()) parts.push(`(${task.owner.trim()})`);
    const sheet = sheetCitation(doc, task);
    if (sheet) parts.push(`[${sheet}]`);
    return parts.join(" ");
  });

  const blocked = blockedTasks(doc);
  const blockerLines = blocked.map((task) => {
    const reason = task.blocked_reason.trim() || "Reason not recorded.";
    const sheet = sheetCitation(doc, task);
    const where = sheet ? ` [${sheet}]` : "";
    return `${task.text.trim() || "(untitled task)"}${where} — ${reason}`;
  });

  const deliveryLines = [
    ...deliveriesOn(doc, date).map((d) => deliveryLine(d, date)),
    ...overdueDeliveries(doc, date).map((d) => deliveryLine(d, date)),
  ];

  const photoLines = touched
    .filter((node) => node.kind === "photo")
    .map((node) => {
      const sheet = sheetCitation(doc, node);
      const caption = nodeText(node).trim() || "(no caption)";
      return sheet ? `${caption} [${sheet}]` : caption;
    });

  const noteLines = touched
    .filter((node) => node.kind === "note")
    .map((node) => nodeText(node).trim())
    .filter((text) => text.length > 0);

  const transcript = (input.transcript ?? "").trim();
  if (transcript) noteLines.push(`Dictated: "${transcript}"`);

  const sections: DailyLogSection[] = [
    { heading: "Work performed", lines: workLines },
    { heading: "Delays / blockers", lines: blockerLines },
    { heading: "Material deliveries", lines: deliveryLines },
    { heading: "Photos logged", lines: photoLines },
    { heading: "Field notes", lines: noteLines },
  ];

  const header = [
    `DAILY LOG — ${input.project_name}`,
    `Date: ${date}`,
    `Prepared by: ${input.prepared_by}`,
  ].join("\n");

  const body = sections
    .map((section) => {
      const lines = section.lines.length > 0 ? section.lines.map((l) => `  - ${l}`) : [`  ${NONE_RECORDED}`];
      return [`${section.heading}:`, ...lines].join("\n");
    })
    .join("\n\n");

  return {
    date,
    project_name: input.project_name,
    prepared_by: input.prepared_by,
    sections,
    text: `${header}\n\n${body}\n`,
  };
}

export interface RfiDraft {
  subject: string;
  /** Sheet citations the RFI rests on, most specific first. */
  references: string[];
  background: string;
  question: string;
  impact: string;
  suggested_resolution: string;
  /** The whole RFI as pasteable plain text. */
  text: string;
}

export interface RfiDraftInput {
  project_name: string;
  /** Who is asking — goes on the signature line. */
  prepared_by: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Who it goes to: "EOR", "Architect", "GC". Free text — boards precede a contacts record. */
  directed_to?: string;
}

/**
 * Draft an RFI from a blocked task.
 *
 * Returns null when the node is not a blocked task: an RFI needs a specific
 * obstruction to ask about, and generating one from an ordinary task produces
 * the vague "please advise" RFI that comes back with "see drawings".
 *
 * Context comes from the board's own structure — the connectors into and out of
 * the task, and the sheet it is pinned to — because that is the context the
 * person answering needs and the part a foreman is most likely to leave out.
 */
export function draftRfiFromTask(doc: BoardDoc, nodeId: string, input: RfiDraftInput): RfiDraft | null {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!isTaskNode(node) || !node.blocked) return null;

  const title = node.text.trim() || "Blocked work item";
  const reason = node.blocked_reason.trim();

  const references: string[] = [];
  const sheet = sheetCitation(doc, node);
  if (sheet) {
    const region = sheetRegion(doc, node);
    references.push(region ? `${sheet} — ${region} of sheet` : sheet);
  }

  // Everything wired to this task is context someone answering will want; notes
  // and links attached to a blocker are usually the photo of the condition and
  // the spec section it conflicts with.
  const connected = doc.edges
    .filter((e) => e.from_node_id === nodeId || e.to_node_id === nodeId)
    .map((e) => (e.from_node_id === nodeId ? e.to_node_id : e.from_node_id))
    .map((id) => doc.nodes.find((n) => n.id === id))
    .filter((n): n is BoardNode => !!n);

  for (const related of connected) {
    const relatedSheet = sheetCitation(doc, related);
    if (relatedSheet && !references.includes(relatedSheet)) references.push(relatedSheet);
  }

  const contextLines = connected
    .map((related) => nodeText(related).trim())
    .filter((text) => text.length > 0);

  const downstream = doc.edges
    .filter((e) => e.kind === "precedes" && e.from_node_id === nodeId)
    .map((e) => doc.nodes.find((n) => n.id === e.to_node_id))
    .filter(isTaskNode);

  const background = [
    reason || "The condition blocking this work was not recorded on the board.",
    contextLines.length > 0 ? `Related board items: ${contextLines.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const question = reason
    ? `Please confirm how to proceed with ${title.toLowerCase()} given the following: ${reason}`
    : `Please confirm how to proceed with ${title.toLowerCase()}.`;

  const impact = buildImpact(node, downstream);

  const subject = sheet ? `${title} — ${sheet}` : title;

  const text = [
    `RFI DRAFT — ${input.project_name}`,
    `Date: ${input.date}`,
    input.directed_to ? `To: ${input.directed_to}` : "",
    `From: ${input.prepared_by}`,
    "",
    `Subject: ${subject}`,
    "",
    `References: ${references.length > 0 ? references.join("; ") : "Not recorded — attach the applicable sheet before sending."}`,
    "",
    "Background:",
    `  ${background}`,
    "",
    "Question:",
    `  ${question}`,
    "",
    "Schedule / cost impact:",
    `  ${impact}`,
    "",
    "Suggested resolution:",
    "  (Proposed resolution to be added before sending.)",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    subject,
    references,
    background,
    question,
    impact,
    // Deliberately not auto-filled. A suggested resolution is an engineering
    // position; putting words in the fabricator's mouth here is how a board
    // draft turns into an unintended commitment.
    suggested_resolution: "",
    text: `${text}\n`,
  };
}

function buildImpact(task: BoardTaskNode, downstream: readonly BoardTaskNode[]): string {
  const parts: string[] = [];
  if (task.start_date && task.end_date) {
    const days = durationFromDates(task.start_date, task.end_date);
    parts.push(
      days === null
        ? `This activity is scheduled ${task.start_date} to ${task.end_date}.`
        : `This activity is scheduled ${task.start_date} to ${task.end_date} (${days} day${days === 1 ? "" : "s"}).`,
    );
  } else {
    parts.push("This activity is not yet scheduled.");
  }
  if (downstream.length > 0) {
    const names = downstream.map((t) => t.text.trim() || "(untitled task)").join(", ");
    parts.push(`${downstream.length} downstream activit${downstream.length === 1 ? "y" : "ies"} follow: ${names}.`);
  }
  parts.push("Impact to be confirmed once a response is received.");
  return parts.join(" ");
}
