/**
 * persistSteps.ts — the "save IFC to project" pipeline's step names, the
 * storage-object size guard, and the user-facing failure text. Pure so the
 * Model3DTab save path is testable without web-ifc or Supabase.
 *
 * Save pipeline: extract (read the piece list from the IFC) → compress (gzip)
 * → upload (storage) → register (model_registry + model_elements).
 */

const MB = 1024 * 1024;

/**
 * Per-object ceiling of the `app-files` storage bucket
 * (`storage.buckets.file_size_limit`, seeded at 52428800). The upload-profile
 * caps in uploadValidation.ts are looser than this, so a bigger file used to
 * die at the bucket with a bare "exceeded the maximum allowed size".
 */
export const STORAGE_OBJECT_MAX_BYTES = 50 * MB;

export type PersistStep = "extract" | "compress" | "upload" | "register";

export function formatMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / MB;
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

/** Throw a jobsite-readable error when the object cannot fit in the bucket. */
export function assertStorageObjectSize(bytes: number, label = "model"): void {
  if (!Number.isFinite(bytes) || bytes <= STORAGE_OBJECT_MAX_BYTES) return;
  throw new Error(
    `The ${label} is ${formatMb(bytes)}; storage accepts files up to ${formatMb(STORAGE_OBJECT_MAX_BYTES)}. ` +
    "Re-export the IFC with only structural members (no bolts/welds), or split it by sequence.",
  );
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return String(err);
}

/**
 * One sentence saying which step of the save failed and what to do. The step
 * matters: "register" means the file is already in storage but the roster did
 * not land, and (since the importer inserts before it supersedes) the project's
 * previous model is still active.
 */
export function describePersistFailure(step: PersistStep, err: unknown): string {
  const detail = errorText(err);
  switch (step) {
    case "extract":
      return `Couldn't read the piece list from the IFC: ${detail}`;
    case "compress":
      return `Couldn't compress the IFC for upload: ${detail}`;
    case "upload":
      return `Couldn't upload the model to storage: ${detail}`;
    case "register":
      return `Model uploaded, but the piece roster didn't save: ${detail}. The previous model is still active — retry the save.`;
    default:
      return `Couldn't save the model: ${detail}`;
  }
}

export interface RosterDiagnostics {
  schema?: string;
  partsFound: number;
  partsByType: Record<string, number>;
  otherTypes: Record<string, number>;
  relCount: number;
  relsTouchingParts: number;
  propertySets: Array<{ name: string; count: number }>;
  propertyKeys: Array<{ name: string; count: number }>;
  markedFromTag: number;
  skipped: { noGuid: number; noMark: number; duplicateGuid: number; unreadable: number };
}

const fmtCounts = (rec: Record<string, number>, max = 5): string =>
  Object.entries(rec)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k, n]) => `${n.toLocaleString()} ${k}`)
    .join(", ");

/**
 * Say precisely why an IFC produced no roster rows, from what the extractor
 * saw, so the fix (re-export settings, property-set config) is obvious to the
 * detailer instead of a generic "reference/proxy export" guess.
 */
export function describeEmptyRoster(d: RosterDiagnostics | null | undefined): string {
  if (!d) {
    return "No structural members found in this IFC. Re-export from your detailer with beams, columns, plates and members, then load it again.";
  }
  const schema = d.schema ? ` (${d.schema})` : "";
  if (d.partsFound === 0) {
    const others = fmtCounts(d.otherTypes);
    return (
      `No beams, columns, plates, members or proxies in this IFC${schema}` +
      (others ? `; it contains ${others}.` : "; it contains no structural elements at all.") +
      " Re-export from your detailer with parts as IfcBeam / IfcColumn / IfcPlate / IfcMember, then load it again."
    );
  }
  const found = fmtCounts(d.partsByType);
  if (d.relsTouchingParts === 0) {
    return (
      `Found ${d.partsFound.toLocaleString()} parts (${found}) but the file carries no property sets on them, so there are no piece marks to import. ` +
      "Re-export with property sets enabled (Tekla: include \"Part Properties\" or the stock \"Tekla Common\" set; SDS/2: export custom properties)."
    );
  }
  const sets = d.propertySets.map((s) => `${s.name} (${s.count.toLocaleString()})`).join(", ");
  const keys = d.propertyKeys.slice(0, 8).map((k) => k.name).join(", ");
  return (
    `Found ${d.partsFound.toLocaleString()} parts (${found}) with property sets [${sets}]` +
    (keys ? ` carrying [${keys}]` : "") +
    ", but none of those properties is a piece mark. " +
    "Ask your detailer to include Assembly Mark / Part Mark (Tekla \"Part Properties\" or \"Tekla Common\") in the IFC property-set config, then re-export."
  );
}

/** Progress caption for the save banner. */
export function describePersistProgress(state: {
  step: string;
  phase?: string;
  done?: number;
  total?: number;
  stage?: string;
}): string {
  if (state.step === "extracting") {
    const done = state.done ?? 0;
    const total = state.total ?? 0;
    if (state.phase === "index") {
      return total
        ? `Saving to project… indexing properties ${done.toLocaleString()} / ${total.toLocaleString()}`
        : "Saving to project… indexing properties";
    }
    return total
      ? `Saving to project… reading pieces ${done.toLocaleString()} / ${total.toLocaleString()}`
      : "Saving to project… reading pieces";
  }
  if (state.step === "saving") {
    return state.stage ? `Saving to project… ${state.stage}` : "Saving to project…";
  }
  return "Saving to project…";
}
