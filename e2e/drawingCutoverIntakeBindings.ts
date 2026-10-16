/** Pure acceptance input validation. No transport, readiness or approval authority. */
import { z } from 'zod';
import { buildCreateSetRequest, buildReviseSetRequest } from '../src/lib/drawingCommands/requestBuilders.ts';
import type { CreateSetRequest, ReviseSetRequest } from '../src/lib/drawingCommands/types.ts';
import type { FixtureManifest } from './drawing-cutover-setup.ts';

const projectSchema = z.object({ id: z.string().uuid(), orgId: z.string().uuid(), createdBy: z.string().uuid() }).strict();
const planFields = { requestId: z.string().uuid(), actor: z.literal('pm'), payload: z.unknown() };
const createPlan = z.object({ ...planFields, operation: z.literal('create_set') }).strict();
const bookSchema = z.object({
  version: z.literal(1),
  projects: z.object({ A1: projectSchema, A2: projectSchema, B1: projectSchema, B2: projectSchema }).strict(),
  commands: z.object({ newSet: createPlan, manualIntake: createPlan,
    revision: z.object({ ...planFields, operation: z.literal('revise_set') }).strict() }).strict(),
}).strict();
type ProjectBinding = Readonly<z.infer<typeof projectSchema>>;
type CommandPlan<O, P> = { readonly requestId: string; readonly actor: 'pm'; readonly operation: O; readonly payload: P };
export interface DrawingIntakeBindings {
  readonly version: 1;
  readonly projects: { readonly A1: ProjectBinding; readonly A2: ProjectBinding; readonly B1: ProjectBinding; readonly B2: ProjectBinding };
  readonly commands: {
    readonly newSet: CommandPlan<'create_set', CreateSetRequest>;
    readonly revision: CommandPlan<'revise_set', ReviseSetRequest>;
    readonly manualIntake: CommandPlan<'create_set', CreateSetRequest>;
  };
}

function requireBinding(condition: unknown): asserts condition {
  if (!condition) throw new Error('INTAKE_BINDINGS_INVALID');
}

/** Refuse lossy JSON projections (including getters) before either Zod or
 * JSON.stringify can drop fields or run caller code. Clone shared nested values. */
function copyJson(value: unknown): unknown {
  const ancestors = new Set<object>();
  function copy(current: unknown): unknown {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') { requireBinding(Number.isFinite(current)); return current; }
    requireBinding(typeof current === 'object' && current !== null && !ancestors.has(current));
    const array = Array.isArray(current);
    requireBinding(array || Object.getPrototypeOf(current) === Object.prototype || Object.getPrototypeOf(current) === null);
    ancestors.add(current);
    const keys = Reflect.ownKeys(current);
    requireBinding(keys.every(key => typeof key === 'string' && key !== '__proto__'));
    const names = keys as string[];
    if (array) requireBinding(names.length === current.length + 1 && names.every(key => key === 'length'
      || (/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < current.length)));
    const entries = names.filter(key => !(array && key === 'length')).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
      requireBinding(descriptor.enumerable && 'value' in descriptor);
      return [key, copy(descriptor.value)] as const;
    });
    ancestors.delete(current);
    return array ? entries.map(([, entry]) => entry) : Object.fromEntries(entries);
  }
  const result = copy(value);
  requireBinding(new TextEncoder().encode(JSON.stringify(result)).byteLength <= 1_048_576);
  return result;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function checkFixtureBindings(book: DrawingIntakeBindings, fixture: FixtureManifest): void {
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  requireBinding(fixture.organizations.length === 2 && unique(fixture.organizations)
    && fixture.projects.length === 4 && unique(fixture.projects.map(p => p.id))
    && fixture.actors.length === 7 && unique(fixture.actors.map(a => a.id)) && unique(fixture.actors.map(a => a.alias)));
  const pm = fixture.actors.find(a => a.alias === 'pm');
  const admin = fixture.actors.find(a => a.alias === 'admin');
  const foreign = fixture.actors.find(a => a.alias === 'foreign');
  requireBinding(pm && admin && foreign && pm.orgId === admin.orgId && admin.orgId !== foreign.orgId
    && fixture.organizations.includes(admin.orgId) && fixture.organizations.includes(foreign.orgId));
  requireBinding(unique(Object.values(book.projects).map(p => p.id)));
  for (const [alias, project] of Object.entries(book.projects)) {
    const owner = alias === 'A1' || alias === 'A2' ? admin : foreign;
    requireBinding(project.orgId === owner.orgId && project.createdBy === owner.id
      && fixture.projects.some(p => p.id === project.id && p.orgId === project.orgId && p.createdBy === project.createdBy));
  }
  requireBinding(unique(fixture.entities.map(e => e.id)) && unique(fixture.storage.map(s => s.path)));
  const projectId = book.projects.A1.id;
  const entity = (table: string, id: string) => fixture.entities.some(e => e.table === table && e.id === id && e.projectId === projectId);
  const plans = Object.values(book.commands);
  requireBinding(unique(plans.map(p => p.requestId)));
  const tokens = new Map<string, string>();
  for (const plan of plans) {
    requireBinding(plan.payload.project_id === projectId);
    for (const source of plan.payload.source_objects) {
      requireBinding(fixture.storage.some(s => s.path === source.path && s.projectId === projectId)
        && source.path.startsWith(`${book.projects.A1.orgId}/uploads/${projectId}/`)
        && (!tokens.has(source.path) || tokens.get(source.path) === source.token));
      // A SQL metadata token is not the separately declared content-byte SHA256.
      tokens.set(source.path, source.token);
    }
    for (const sheet of plan.payload.sheets) {
      if (sheet.action === 'added' || sheet.action === 'revised') {
        const source = fixture.storage.find(s => s.projectId === projectId && s.path === sheet.file_path);
        requireBinding(source && Number.isInteger(source.pages) && source.pages > 0 && source.pages <= 250 && sheet.pdf_page <= source.pages);
      }
      if (sheet.action !== 'added') requireBinding(entity('drawings', sheet.drawing_id)
        && (sheet.expected_revision_id === null || entity('drawing_revisions', sheet.expected_revision_id)));
    }
  }
  requireBinding(entity('drawing_sets', book.commands.revision.payload.set_id));
  const revisions = book.commands.revision.payload.sheets.flatMap(s => s.action !== 'added' && s.expected_revision_id !== null ? [s.expected_revision_id] : []);
  requireBinding(unique(revisions));
  const newNames = [book.commands.newSet.payload.set_name, book.commands.manualIntake.payload.set_name];
  requireBinding(newNames.every(name => /^E2E[ _-]/.test(name)) && unique(newNames.map(name => name.trim().toUpperCase())));
  requireBinding(book.commands.manualIntake.payload.sheets.every(s => s.action === 'added'
    && s.extraction.text.state === 'unavailable' && s.extraction.callouts.state === 'unavailable'));
}

/** Input narrowing only. Raw full-manifest review remains the approval boundary;
 * database rosters, timestamps, set membership and source tokens need live readback. */
export function validateDrawingIntakeBindings(value: unknown, fixture: FixtureManifest): DrawingIntakeBindings {
  try {
    const book = bookSchema.parse(copyJson(value));
    const validated = { ...book, commands: {
      newSet: { ...book.commands.newSet, payload: buildCreateSetRequest(book.commands.newSet.payload as CreateSetRequest) },
      revision: { ...book.commands.revision, payload: buildReviseSetRequest(book.commands.revision.payload as ReviseSetRequest) },
      manualIntake: { ...book.commands.manualIntake, payload: buildCreateSetRequest(book.commands.manualIntake.payload as CreateSetRequest) },
    } } as DrawingIntakeBindings;
    checkFixtureBindings(validated, copyJson(fixture) as FixtureManifest);
    return freeze(validated);
  } catch { throw new Error('INTAKE_BINDINGS_INVALID'); }
}

export function selectDrawingIntakeProject(fixture: FixtureManifest): ProjectBinding {
  if (fixture.intakeBindings == null) throw new Error('INTAKE_BINDINGS_REQUIRED');
  return validateDrawingIntakeBindings(fixture.intakeBindings, fixture).projects.A1;
}
