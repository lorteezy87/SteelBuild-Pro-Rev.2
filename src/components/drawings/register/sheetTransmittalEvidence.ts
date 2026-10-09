/**
 * Selected SHOP sheet's distribution evidence. The item read is narrowed by
 * project_id + indexed drawing_id and paged to completeness. GC attachments
 * occupy a separate ID namespace and can never match through a sheet number.
 */
import { entities } from "@/api/supabaseClient";

const HEADER_BATCH_SIZE = 100;
const HEADER_READ_CONCURRENCY = 4;

type Item = Awaited<ReturnType<typeof entities.DrawingTransmittalItem.filterAll>>[number];
type Header = Awaited<ReturnType<typeof entities.DrawingTransmittal.filter>>[number];

export type LastSheetTransmittal =
  | { kind: "none" }
  | {
    kind: "found";
    id: string;
    number: string | null;
    direction: "incoming" | "outgoing" | "internal";
    lifecycle: string;
    date: string | null;
    revision: "current" | "different" | "unknown";
  };

function directionOf(header: Header): "incoming" | "outgoing" | "internal" {
  if (header.direction === "incoming" || header.direction === "outgoing" || header.direction === "internal") {
    return header.direction;
  }
  throw new Error("Sheet transmittal direction could not be verified.");
}

function lifecycleOf(status: string | null): string {
  switch (status) {
    case "draft": return "Draft · not issued";
    case "sent": return "Sent";
    case "acknowledged": return "Acknowledged";
    default: return "Status not recorded";
  }
}

function relevantDate(header: Header): string | null {
  const entered = header.direction === "incoming" ? header.date_received : header.date_sent;
  return typeof entered === "string" && entered.trim() ? entered : null;
}

function compareHeaders(a: Header, b: Header): number {
  // An undated draft cannot supersede a transmittal with an entered date.
  // Timestamp values are reduced to the recorded calendar day before comparing.
  const aDay = relevantDate(a)?.slice(0, 10) ?? "";
  const bDay = relevantDate(b)?.slice(0, 10) ?? "";
  return aDay.localeCompare(bDay)
    || String(a.created_at || "").localeCompare(String(b.created_at || ""))
    || String(a.transmittal_number || "").localeCompare(String(b.transmittal_number || ""), undefined, { numeric: true })
    || String(a.id).localeCompare(String(b.id));
}

async function readExactHeaders(projectId: string, ids: string[]): Promise<Header[]> {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += HEADER_BATCH_SIZE) {
    chunks.push(ids.slice(start, start + HEADER_BATCH_SIZE));
  }
  const headers: Header[] = [];
  for (let start = 0; start < chunks.length; start += HEADER_READ_CONCURRENCY) {
    const wave = chunks.slice(start, start + HEADER_READ_CONCURRENCY);
    const fetched = await Promise.all(wave.map((chunk) =>
      // At most 100 primary-key hits per request: no project-wide header log.
      entities.DrawingTransmittal.filter({ project_id: projectId, id: chunk }, "id", chunk.length)));
    for (const batch of fetched) headers.push(...batch);
  }
  return headers;
}

function compareRevision(items: readonly Item[], currentRevisionId: string | null): "current" | "different" | "unknown" {
  if (!currentRevisionId) return "unknown";
  if (items.some((item) => item.drawing_revision_id === currentRevisionId)) return "current";
  return items.some((item) => item.drawing_revision_id) ? "different" : "unknown";
}

export async function fetchLastSheetTransmittal(
  projectId: string,
  drawingId: string,
  currentRevisionId: string | null,
): Promise<LastSheetTransmittal> {
  const items = await entities.DrawingTransmittalItem.filterAll({ project_id: projectId, drawing_id: drawingId }, "id");
  if (items.length === 0) return { kind: "none" };

  const byHeaderId = new Map<string, Item[]>();
  for (const item of items) {
    if (item.project_id !== projectId || item.drawing_id !== drawingId || item.gc_drawing_id || !item.transmittal_id) {
      throw new Error("Sheet transmittal attachment scope could not be verified.");
    }
    const group = byHeaderId.get(item.transmittal_id) ?? [];
    group.push(item);
    byHeaderId.set(item.transmittal_id, group);
  }

  const ids = [...byHeaderId.keys()];
  const headers = await readExactHeaders(projectId, ids);
  const headersById = new Map(headers.map((header) => [header.id, header]));
  if (headersById.size !== ids.length || ids.some((id) => !headersById.has(id))) {
    // A missing/RLS-hidden header could be newer than the visible one. The UI
    // must not silently nominate an older transmittal as the last.
    throw new Error("Sheet transmittal header missing; last distribution cannot be verified.");
  }
  if (headers.some((header) => header.project_id !== projectId)) {
    throw new Error("Sheet transmittal header project could not be verified.");
  }

  const active = headers.filter((header) => !header.is_deleted && !header.deleted_at && header.status !== "void");
  if (active.length === 0) return { kind: "none" };
  active.sort(compareHeaders);
  const latest = active[active.length - 1];
  const attachments = byHeaderId.get(latest.id) ?? [];
  return {
    kind: "found",
    id: latest.id,
    number: latest.transmittal_number?.trim() || null,
    direction: directionOf(latest),
    lifecycle: lifecycleOf(latest.status),
    date: relevantDate(latest),
    revision: compareRevision(attachments, currentRevisionId),
  };
}
