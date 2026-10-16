import { z } from 'zod';
import { DrawingCommandPreflightError } from './errors.ts';
import type { CreateSetRequest, CreateSetReview, DrawingJson, ReviseSetRequest, ReviseSetReview } from './types.ts';

const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const chars = (max: number) => z.string().refine((value) => [...value].length <= max);
const nonblank = (max: number) => chars(max).refine((value) => value.trim().length > 0);
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
// PostgreSQL JSONB cannot represent NUL or unpaired UTF-16 surrogates. Reject
// before durable preparation, including keys, so receipt lookup stays possible.
const jsonText = z.string().refine((value) => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0 || (code >= 0xdc00 && code <= 0xdfff)) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    }
  }
  return true;
});
const json: z.ZodType<DrawingJson> = z.lazy(() => z.union([
  z.null(), jsonText, z.boolean(), z.number().finite(), z.array(json),
  // Zod 3 drops this own key while cloning records; refuse loss of reviewed evidence.
  z.record(jsonText.refine(key => key !== '__proto__'), json),
]));
const extraction = <T extends z.ZodType<unknown>>(value: T) => z.discriminatedUnion('state', [
  z.object({ state: z.literal('unavailable') }).strict(),
  z.object({ state: z.literal('harvested'), value }).strict(),
]);
const changed = {
  sheet_number: nonblank(120), sheet_title: nonblank(500), revision_code: nonblank(80),
  file_path: z.string(), pdf_page: z.number().int().min(1).max(999999), reviewed: z.literal(true),
  discipline: z.string().nullable().optional(),
  extraction: z.object({
    text: extraction(z.string().refine((value) => bytes(value) <= 65536)),
    callouts: extraction(z.array(json).refine((value) => bytes(JSON.stringify(value)) <= 65536)),
  }).strict(),
};
const existing = { drawing_id: uuid, expected_updated_at: timestamp, expected_revision_id: uuid.nullable(), sheet_number: nonblank(120) };
const added = z.object({ action: z.literal('added'), ...changed }).strict();
const revised = z.object({ action: z.literal('revised'), ...changed, ...existing, expected_revision_id: uuid }).strict();
const same = z.object({ action: z.literal('same'), ...existing }).strict();
const removed = z.object({ action: z.literal('removed'), ...existing, expected_revision_id: uuid }).strict();
const source = z.object({ path: z.string(), token: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const header = { project_id: uuid, revision_label: nonblank(80), file_path: z.string(), source_objects: z.array(source).min(1).max(250) };
const create = z.object({ ...header, set_name: nonblank(500), set_number: chars(120).nullable(), discipline: z.string().nullable(),
  issued_date: date.nullable(), issued_by: z.string().nullable(), notes: z.string().nullable(), sheets: z.array(added).min(1).max(250),
}).strict();
const revise = z.object({ ...header, set_id: uuid, expected_set_updated_at: timestamp, expected_set_revision: z.string().nullable(),
  issued_date: date, issued_by: z.string().nullable().optional(), notes: z.string().nullable().optional(),
  sheets: z.array(z.discriminatedUnion('action', [added, revised, same, removed])).min(1).max(250),
}).strict();

/** Storage keys only, never URLs. SQL rechecks the real project organization. */
export function validateDrawingSourcePath(path: string, projectId: string, orgId?: string): boolean {
  const parts = path.split('/');
  return path.length <= 512 && !path.includes('..') && parts.length === 4
    && uuid.safeParse(parts[0]).success && (!orgId || parts[0] === orgId)
    && parts[1] === 'uploads' && parts[2] === projectId && /^[A-Za-z0-9._-]+\.pdf$/.test(parts[3]);
}
function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function finish<T extends CreateSetRequest | ReviseSetRequest>(request: T): T {
  // A transport-size guard, not an attempt to reproduce PostgreSQL JSONB hashing.
  // SQL remains authoritative for its serialized byte bounds and its hash.
  if (bytes(JSON.stringify(request)) > 1048576) throw new DrawingCommandPreflightError('invalid_review');
  const sources = request.source_objects.map(({ path }) => path);
  const changedPaths = request.sheets.flatMap((sheet) => sheet.action === 'added' || sheet.action === 'revised' ? [sheet.file_path] : []);
  const requiredPaths = new Set([request.file_path, ...changedPaths]);
  const orgs = new Set(sources.map((path) => path.split('/')[0]));
  const marks = request.sheets.map((sheet) => sheet.sheet_number.trim().toUpperCase());
  const ids = request.sheets.flatMap((sheet) => sheet.action === 'added' ? [] : [sheet.drawing_id]);
  if (sources.length !== new Set(sources).size || sources.length !== requiredPaths.size || orgs.size !== 1
    || sources.some((path) => !requiredPaths.has(path) || !validateDrawingSourcePath(path, request.project_id))
    || new Set(marks).size !== marks.length || new Set(ids).size !== ids.length) {
    throw new DrawingCommandPreflightError('invalid_review');
  }
  return freeze(request);
}
function validateReviewedJson(input: unknown): void {
  try {
    // Reject undefined/non-JSON values before optional schemas or JSON serialization can drop them.
    if (bytes(JSON.stringify(input)) > 1048576 || !json.safeParse(input).success) {
      throw new DrawingCommandPreflightError('invalid_review');
    }
  } catch { throw new DrawingCommandPreflightError('invalid_review'); }
}
export function buildCreateSetRequest(input: CreateSetReview): CreateSetRequest {
  validateReviewedJson(input);
  const parsed = create.safeParse(input);
  if (!parsed.success) throw new DrawingCommandPreflightError('invalid_review');
  // Zod 3 infers object fields as optional under this repository's non-strict tsconfig.
  // The strict runtime schema above requires every non-optional field.
  return finish(parsed.data as CreateSetRequest);
}
export function buildReviseSetRequest(input: ReviseSetReview): ReviseSetRequest {
  validateReviewedJson(input);
  const parsed = revise.safeParse(input);
  if (!parsed.success) throw new DrawingCommandPreflightError('invalid_review');
  return finish(parsed.data as ReviseSetRequest);
}
