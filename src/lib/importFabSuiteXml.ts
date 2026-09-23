/**
 * importFabSuiteXml.ts — parse a Tekla EPM / FabSuite Data Exchange XML
 * (schema TeklaPowerFabDataFile*.xsd, the Tekla Structures → Tekla EPM handoff)
 * into staged drawings + pieces.
 *
 * No AI, no external service — parses client-side with DOMParser and returns
 * STAGED data for a human review screen (§30). Two payloads come out of one
 * file:
 *   • drawings — <Drawing> (sheets / GA) + <AssemblyDrawing> (per-assembly
 *     sheets), de-duped by drawing number, each with its current revision.
 *   • pieces   — <Assembly> records → the erectable/shippable piece: the
 *     AssemblyMark is the piece mark, the MainMember part carries the profile +
 *     grade, and the assembly weight is the sum of its parts.
 *
 * The package's fab stage lives in the revision description ("FOR APPROVAL ONLY"
 * = IFA, "FOR FABRICATION" = IFC) — there is no per-piece production status in
 * this file; that comes from a separate EPM production-control export.
 */

export interface FabSuiteDrawing {
  drawing_number: string;
  title: string | null;
  category: string | null;
  date_detailed: string | null;
  revision_number: string | null;
  revision_description: string | null;
  date_revised: string | null;
  model_ref: string | null;
}

export interface FabSuitePiece {
  piece_mark: string;
  assembly_mark: string | null;
  profile: string | null;
  material_grade: string | null;
  quantity: number;
  weight_kg: number | null;
  sequence_number: string | null;
  erection_area: string | null;
  drawing_no: string | null;
  element_guid: string | null;
}

export type FabSuiteStage = "IFC" | "IFA";

export interface FabSuiteStats {
  drawings: number;
  pieces: number;
  skippedDrawings: number;
  skippedPieces: number;
}

export interface FabSuiteParseResult {
  ok: boolean;
  error?: string;
  project: { number: string | null; name: string | null };
  source: { app: string | null; version: string | null; date: string | null; stage: FabSuiteStage | null };
  drawings: FabSuiteDrawing[];
  pieces: FabSuitePiece[];
  stats: FabSuiteStats;
}

/** The existing model_elements columns staging reads. */
export interface ExistingModelElementRef {
  id?: string | null;
  element_guid?: string | null;
  is_deleted?: boolean | null;
}

export type StagedFabSuitePiece = FabSuitePiece & {
  action: "create" | "update";
  existing_id: string | null;
  metadata?: Record<string, unknown> | null;
};

/** A staged row mapped to a model_elements insert/update payload. */
export type TeklaModelElementPayload = Omit<StagedFabSuitePiece, "action" | "existing_id" | "metadata"> & {
  project_id: string;
  source: "csv";
  metadata: Record<string, unknown>;
};

type ElementScope = Document | Element | null | undefined;

const norm = (v: unknown): string => String(v || "").trim();

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/[, ]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDoc(xmlString: unknown): Document | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(String(xmlString || ""), "application/xml");
  // A parse failure yields a <parsererror> node (HTML namespace) in every engine.
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  return doc;
}

// Namespace-agnostic descendant lookups (the file uses a default xmlns).
const els = (parent: ElementScope, tag: string): Element[] => (parent ? Array.from(parent.getElementsByTagNameNS("*", tag)) : []);
const firstText = (parent: ElementScope, tag: string): string => {
  const el = parent && parent.getElementsByTagNameNS("*", tag)[0];
  return el ? norm(el.textContent) : "";
};

function parseDrawing(el: Element): FabSuiteDrawing {
  const rev = el.getElementsByTagNameNS("*", "DrawingRevision")[0] || null;
  return {
    drawing_number: firstText(el, "DrawingNumber"),
    title: firstText(el, "DrawingTitle") || null,
    category: firstText(el, "Category") || null,
    date_detailed: firstText(el, "DateDetailed") || null,
    revision_number: rev ? firstText(rev, "RevisionNumber") || null : null,
    revision_description: rev ? firstText(rev, "RevisionDescription") || null : null,
    date_revised: rev ? firstText(rev, "DateRevised") || null : null,
    model_ref: firstText(el, "ModelRef") || null,
  };
}

function parseAssembly(el: Element): FabSuitePiece {
  const parts = els(el, "AssemblyPart");
  const mainPart =
    parts.find((p) => firstText(p, "MainMember").toLowerCase() === "true") || parts[0] || null;

  // Assembly weight = Σ part WeightEach × PartQuantity (UOM kg in the export).
  let weight = 0;
  let sawWeight = false;
  for (const part of parts) {
    const each = toNumber(firstText(part, "WeightEach"));
    const qty = toNumber(firstText(part, "PartQuantity")) ?? 1;
    if (each !== null) {
      weight += each * qty;
      sawWeight = true;
    }
  }

  // Phase Name → a coarse erection grouping (the file has no explicit area).
  let phase: string | null = null;
  for (const other of els(el, "OtherField")) {
    if ((other.getAttribute("FieldName") || "").toLowerCase() === "phase name") {
      phase = norm(other.textContent) || null;
    }
  }

  const profile = mainPart ? firstText(mainPart, "Dimensions") || firstText(mainPart, "Shape") : "";

  return {
    piece_mark: firstText(el, "AssemblyMark"),
    assembly_mark: firstText(el, "AssemblyMark") || null,
    profile: profile || null,
    material_grade: mainPart ? firstText(mainPart, "Grade") || null : null,
    quantity: toNumber(firstText(el, "AssemblyQuantity")) ?? 1,
    weight_kg: sawWeight ? Math.round(weight * 1000) / 1000 : null,
    sequence_number: firstText(el, "SequenceNumber") || null,
    erection_area: phase,
    drawing_no: firstText(el, "DrawingNumber") || null,
    element_guid: firstText(el, "ModelRef") || firstText(el, "AssemblyId") || null,
  };
}

function zeroStats(): FabSuiteStats {
  return { drawings: 0, pieces: 0, skippedDrawings: 0, skippedPieces: 0 };
}

/**
 * Parse a FabSuite/Tekla EPM XML string.
 */
export function parseFabSuiteXml(xmlString: unknown): FabSuiteParseResult {
  const empty: Omit<FabSuiteParseResult, "ok" | "error"> = { project: { number: null, name: null }, source: { app: null, version: null, date: null, stage: null }, drawings: [], pieces: [], stats: zeroStats() };
  const doc = parseDoc(xmlString);
  if (!doc || !doc.documentElement) {
    return { ok: false, error: "Could not parse the XML file.", ...empty };
  }
  const rootName = doc.documentElement.localName || doc.documentElement.tagName || "";
  if (!/FabSuiteDataExchange/i.test(rootName)) {
    return { ok: false, error: "Not a Tekla EPM / FabSuite data file (expected <FabSuiteDataExchange>).", ...empty };
  }

  const project = { number: firstText(doc, "ProjectNumber") || null, name: firstText(doc, "ProjectName") || null };

  // Drawings — <Drawing> (sheets + GA) and <AssemblyDrawing>, de-duped by number.
  const stats = zeroStats();
  const byNumber = new Map<string, FabSuiteDrawing>();
  for (const el of [...els(doc, "Drawing"), ...els(doc, "AssemblyDrawing")]) {
    const d = parseDrawing(el);
    if (!d.drawing_number) { stats.skippedDrawings += 1; continue; }
    const key = d.drawing_number.toUpperCase();
    const prior = byNumber.get(key);
    // Prefer a record that actually carries a revision.
    if (!prior || (!prior.revision_number && d.revision_number)) byNumber.set(key, d);
  }
  const drawings = Array.from(byNumber.values());
  stats.drawings = drawings.length;

  // Package fab stage from the most common revision description.
  const stage = inferStage(drawings);

  // Pieces — one row per <Assembly> INSTANCE. The export is instance-level: the
  // same AssemblyMark legitimately repeats (10 identical beams = 10 assemblies),
  // each with its own model GUID, and model_elements is GUID-keyed. So we de-dupe
  // by GUID (falling back to mark only when an assembly has none), NOT by mark —
  // collapsing on mark would drop most of the steel.
  const pieces: FabSuitePiece[] = [];
  const seen = new Set<string>();
  for (const el of els(doc, "Assembly")) {
    const piece = parseAssembly(el);
    if (!piece.piece_mark) { stats.skippedPieces += 1; continue; }
    const key = (piece.element_guid ? `guid:${piece.element_guid}` : `mark:${piece.piece_mark}`).toUpperCase();
    if (seen.has(key)) { stats.skippedPieces += 1; continue; }
    seen.add(key);
    pieces.push(piece);
  }
  stats.pieces = pieces.length;

  return {
    ok: true,
    project,
    source: {
      app: firstText(doc, "SourceApplication") || null,
      version: firstText(doc, "SourceApplicationVersion") || null,
      date: firstText(doc, "FileCreationDate") || null,
      stage,
    },
    drawings,
    pieces,
    stats,
  };
}

/**
 * Classify parsed pieces as create/update against existing model_elements.
 * Matches by model GUID ONLY — the natural key of an instance-level row. We do
 * NOT fall back to piece mark (as the CSV importer does): a new GUID with an
 * existing mark is a different physical instance and must be a create, not an
 * update that would overwrite the other instance. Pure; returns staged rows.
 */
export function stageModelElements(
  pieces: ReadonlyArray<FabSuitePiece> | null | undefined,
  existingElements: ReadonlyArray<ExistingModelElementRef | null | undefined> = [],
): { rows: StagedFabSuitePiece[]; stats: { create: number; update: number } } {
  const byGuid = new Map<string, ExistingModelElementRef>();
  for (const el of existingElements) {
    if (!el || el.is_deleted || !el.element_guid) continue;
    byGuid.set(String(el.element_guid).toUpperCase(), el);
  }
  const rows: StagedFabSuitePiece[] = [];
  let create = 0;
  let update = 0;
  for (const piece of pieces || []) {
    const existing = piece.element_guid ? byGuid.get(String(piece.element_guid).toUpperCase()) : null;
    const action: StagedFabSuitePiece["action"] = existing ? "update" : "create";
    if (existing) update += 1; else create += 1;
    rows.push({ ...piece, action, existing_id: existing ? existing.id ?? null : null });
  }
  return { rows, stats: { create, update } };
}

/**
 * Map a staged Tekla EPM row to a model_elements insert/update payload.
 *
 * The `source` column has a DB CHECK constraint: csv | ifc | manual.
 * Tekla EPM XML is a file-based piece import → "csv" bucket.
 * The Tekla-specific origin is preserved in metadata.import_format so
 * provenance is never lost.
 *
 * `row` is a staged row from stageModelElements (has action + existing_id);
 * the result is ready for ModelElement.bulkCreate / ModelElement.update.
 */
export function teklaRowToModelElement(row: StagedFabSuitePiece, projectId: string): TeklaModelElementPayload {
  const { action: _action, existing_id: _existingId, ...fields } = row;
  return {
    ...fields,
    project_id: projectId,
    source: "csv",
    metadata: { ...(fields.metadata || {}), import_format: "tekla_epm_xml" },
  };
}

/** "FOR APPROVAL ONLY" → IFA, "FOR FABRICATION" → IFC, else null. */
function inferStage(drawings: ReadonlyArray<FabSuiteDrawing>): FabSuiteStage | null {
  for (const d of drawings) {
    const desc = (d.revision_description || "").toUpperCase();
    if (desc.includes("FABRICATION")) return "IFC";
    if (desc.includes("APPROVAL")) return "IFA";
  }
  return null;
}
