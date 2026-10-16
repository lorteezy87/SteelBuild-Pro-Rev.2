/** Finite staging foundation only. Importing this module performs no IO. */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolve, isAbsolute, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isDeepStrictEqual, promisify } from 'node:util';
import { mkdir, lstat, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { z } from 'zod';
import { ACTORS, STAGE_REF, STAGE_ORIGIN, boundedJson, digest, requireCondition, costTemplateSchema, setupDecimalSchema,
  validateSetupPlan, validateSetupResume, validateFoundationReceipt, validatePrivateRecoveryPayload, validateArtifactBinding } from '../e2e/drawing-cutover-setup.ts';
import type { ActorAlias, ArtifactBinding, FoundationReceipt, PrivateRecoveryPayload, SetupPlan, SetupResume, SetupTransports,
  SetupCheckpoint, SetupIntent, SetupResult, SetupActor, SetupSession, SetupOrganization, SetupOrganizationAlias, SetupProject,
  SetupProjectAlias, SetupMembership, SetupObservation, SetupChild } from '../e2e/drawing-cutover-setup.ts';
import { encryptRecovery, readPrivateText, readPrivateJson, writePrivateJson, checkpointFilename } from './drawing-cutover-recovery.ts';

class SetupReadinessStop extends Error { constructor() { super('SETUP_MUTATION_PREREQUISITES_UNPROVED'); } }
export function assertSetupMutationReadiness(): never { throw new SetupReadinessStop(); }
const uuid = z.string().uuid();
const owner = (alias: SetupOrganizationAlias): 'admin' | 'foreign' => alias === 'A' ? 'admin' : 'foreign';
const members = ['pm', 'viewer', 'field', 'removed', 'mfa'] as const;
const roles = { pm: 'pm', viewer: 'viewer', field: 'field', removed: 'field', mfa: 'pm' } as const;
const equal = isDeepStrictEqual;
const projection = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value); requireCondition(result.success, 'SETUP_RESPONSE_INVALID'); return result.data;
};
export function requireFoundationPlan(plan: SetupPlan, now = Date.now()): SetupPlan {
  validateSetupPlan(boundedJson(plan), digest(boundedJson(plan)), plan.context, now);
  requireCondition(plan.prerequisiteDetails?.sideEffects, 'SETUP_SIDE_EFFECTS_REQUIRED');
  requireCondition(plan.organizations.every(o => o.name === o.name.trim()) && plan.projects.every(p => p.name === p.name.trim() && p.number === p.number.trim()), 'SETUP_TRIMMED_NAMES_REQUIRED');
  // 300 bytes bounds each strict child projection; 64KiB reserves journal, identities, credentials and headers.
  const maximumChildren = 4 * (64 + 2 * plan.prerequisiteDetails.sideEffects.activeCostCodeTemplates.length) + 9;
  const privateBytes = Buffer.byteLength(boundedJson(plan)) + maximumChildren * 300 + 65_536;
  requireCondition(privateBytes <= 1_048_576, 'SETUP_RECOVERY_CAPACITY');
  // The encrypted envelope is also written through the 1MiB JSON writer. Reserve
  // base64 expansion plus 8KiB for the bounded RSA wrapper, context and fields.
  requireCondition(4 * Math.ceil(privateBytes / 3) + 8192 <= 1_048_576, 'SETUP_ENVELOPE_CAPACITY');
  // Calculation-only UUIDs never enter an observation or receipt. Every seed row
  // has the exact reviewed text width; event/counter/member projections have
  // fixed bounded fields. 64KiB covers all nonchild identities and JSON framing.
  const sizingId = '00000000-0000-4000-8000-000000000000';
  let observationBytes = 65_536 + Buffer.byteLength(boundedJson(plan.prerequisiteDetails.sideEffects.activeCostCodeTemplates)) + 9 * 512;
  for (const project of plan.projects) {
    for (const recipe of seedRecipes(plan, { alias: project.alias, id: sizingId, orgId: sizingId, createdBy: sizingId, name: project.name, number: project.number })) {
      observationBytes += Buffer.byteLength(boundedJson({ ...recipe, id: sizingId, projectId: sizingId })) + 1;
      if (recipe.table === 'action_items' || recipe.table === 'cost_codes') observationBytes += 512;
    }
    observationBytes += 2 * 256;
  }
  requireCondition(observationBytes <= 1_048_576, 'SETUP_OBSERVATION_CAPACITY'); return plan;
}
export function computeTotp(base32Secret: string, timeSeconds: number, digits: 6 | 8 = 6): string {
  requireCondition(/^[A-Z2-7]{16,128}$/.test(base32Secret) && Number.isSafeInteger(timeSeconds) && timeSeconds >= 0
    && (digits === 6 || digits === 8), 'TOTP_INPUT_INVALID');
  let bits = 0; let value = 0; const bytes: number[] = [];
  for (const character of base32Secret) {
    value = (value << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  requireCondition(bits === 0 || (value & ((1 << bits) - 1)) === 0, 'TOTP_INPUT_INVALID');
  const key = Buffer.from(bytes); const step = Buffer.alloc(8); step.writeBigUInt64BE(BigInt(Math.floor(timeSeconds / 30)));
  const mac = createHmac('sha1', key).update(step).digest(); key.fill(0);
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, '0');
}
export function initialFoundationReceipt(plan: SetupPlan, resume: SetupResume | null): FoundationReceipt {
  requireFoundationPlan(plan);
  if (plan.context.phase === 'setup-complete') {
    requireCondition(resume && plan.prior, 'SETUP_RESUME_REQUIRED');
    validateSetupResume(boundedJson(resume), digest(boundedJson(resume)), plan, plan.prior.artifact);
    requireCondition(resume.recovery.receipt.census, 'SETUP_RESUME_CENSUS_REQUIRED');
  } else requireCondition(!resume, 'SETUP_BOOTSTRAP_RESUME_FORBIDDEN');
  return { context: { ...plan.context }, planSha256: digest(boundedJson(plan)), status: 'STOPPED', operations: [],
    actors: structuredClone(resume?.recovery.receipt.actors ?? []),
    organizations: (resume?.recovery.receipt.organizations ?? []).map(({ alias, id, createdBy, ownerId }) => ({ alias, id, createdBy, ownerId })),
    projects: [], memberships: structuredClone(resume?.recovery.receipt.memberships ?? []) };
}
export function prepareFoundation(plan: SetupPlan, resume: SetupResume | null, recipientSpki: string) {
  const receipt = initialFoundationReceipt(plan, resume);
  const credentials = resume ? structuredClone(resume.recovery.credentials) : plan.roster.map(a => ({ ...a, password: randomBytes(32).toString('base64url') }));
  const payload: PrivateRecoveryPayload = { plan, receipt, credentials };
  return { payload, envelope: encryptRecovery(payload, recipientSpki, receipt.context) };
}
export function safeSetupStatus(receipt: FoundationReceipt) {
  return { phase: receipt.context.phase, status: receipt.status, checkpointSequence: receipt.context.checkpointSequence };
}
// Recipes are source-owned, immutable expected values, never supplied as a caller count/callback.
const actionTitles = ['Project Info', 'Drawings/Submittals/Revisions', 'Work Packages', 'RFIs', 'Budgeted Labor Hours', 'Project Scope',
  'Change Orders', 'Resources', 'Schedules', 'SOVs/Budget/Expenses'] as const;
// SHA256 of each reviewed seed description; raw historical narrative is not copied into this factory.
const handoffDescriptions = [
  '8fc0df03987084eeebd1109f8dbf1a242249fa780b8dd3010ec0ef1387d527b1','588181f1e5d6d34dcb56ebf521cef63154139af79ab27472f9a4f3c3ef017c0e',
  '185b7d93dfb9a5a8f18b0b0c0f7417093cf4e69184768cbd61c383dc36959959','b457be7b0e041cf41d0993728ef7f65463647cb9b7fa8105b258db03ebf485a9',
  'b1b0d53228c8892373c15d650763e96c45472819c7cb67edb6ad67393be82a9b','81bcffa3bbd960be92dd62cd56cae3b09e49878e65b8075c7617b6aa56b51458',
  '601034e8e33f8f308a0896b145262471bee79311922d8318a683515e2a13b983','36727d4379a4b14a005483fea6654fba3821109c1bd38914b396a7069dd8b77a',
  'bfd850dc014c39c545dabf64486540186deb9821ae44d49ad8bf785f31122bb1','b15f4140c3965dfad1a3d033a62f065bf293db2ec0540f30619a4b63ef61d002',
  '475194fe98ea18216d8205e65efd10c44310bff13eb0910cbe1fd140c88b3b61','1c52c72209f6fffa87b975a48f4a3e9ae7066a9a775f3f2d497e16884eff0e15',
  'add19ea54518b8614acb358049bd88e22e1d78cd398e2f4fb2c68f1aba669556','c6bbcb8a74c9f498b7bc52dc0fc85b591600e3d2d793464b3f1772ef6cbb5f4f',
  '676e63a593aa3accb4a69e5b31ef3a980431ceae51f7db06bb14f79f3acd4b58','d3d900b1273b4287a7ee0abc52e1dda947cd80335bd68d7f00acfe29519779a8',
  'db9de3e7ff5c7be9bc09554c3adf0f400d7ad4f96ba2d0a5de5c214c0c8b4a3b','d0fc06aef5ca00ce7bb5bbbfadcbd3001a0b9c54ec6e7d36764848d1841a3efd',
  'a77050e3d9bc6765dd88ba964ad2f25b3679f1d3dd03cf81d205b9482a57a164','90849beff9349be69ecad9558ef30e0fd6c655ead40faa1c83e06bcbd00946c5',
  '4f0207164a3422835c1421f47f78dcd9d832a059d21e5733ffad4c08a59432e8','2d0e9e0a84e44c3d4e5b33f7517b3428894c061ccae4a397d3be2fb57885d26d',
  'f8cef4813fbebc631e3600a9ee2782baaa05d1ba7037038d9c470ff1c1e55539','b6183cca490dd699633fcfe20fe4317766e12b9d488560d45d2e3a6e1ba74342',
  '8c8eed19a752b7ec10ff3dd4bb4d618596ae3b52931f1301ae7ce446b0935802','6d29815d9482476edac99726b9b2522fc60ace8b1409a6edf76d92cee96af16d',
  'cb5d6e0473d436dd5959044702883b752de9c2547248cd04e83eb779f215b352','6296838c3a3694b6c39498b7d6872f49ae578d5e4dedda8932824fc42f34f659',
  '5cdbd854e148b86b7c0bbb84f733fc2de010d40d7b042a060c2810318bfcdc3b','6816aefb179be5e4028039fb67ca557a213497b966dad82522380f3c4e7e240c',
  '6cb9643b23bb36e5182a57ad379535f846787d64a02df5835ace894f5acdcef2','dda5b810e3255b72622dba9e4fcd3e79b91e13504bf9b53a3e2dbffdcbe3525d',
  '35539763d2d898f0fe456818968115553a064de550a18f95d146a116ca4dba18','a8d444c9d24c1f652998f95367d5ec1bfb25ab2e69f6291954e03ba439a4ce4d',
  '17b8d6a84b359c303395ad0bbe54e463c7ae000a0cc45690cffc4138acbbdc8d','238e9c733bb33bcb10f5f32974aaa3662da48289cc9b3310e08c9e6fff3e20b2',
] as const;
const actionDescriptions = ['28de93c3b119b10e191899c273d40e66a88d5e0b77da61b62391ee4692d3e64b','35d4cbbb94c611899db150ef2c05d5bcf18f49947de7be2dab9c6c280f0cfdcd',
  'a0c55515c17614e4f272404534e71df80665307f78abdb4375bae8d0a8b6ea57','4b67809e6039534282b9e261ef1d8edeac97962ff884abc2c90a3ba75122a479',
  '8bedf7ea0815d9a19940677a6db7d6c9c9c0fb245be6ec0b33fd72febde06d94','9854e691f1367538adb4a529a5defb276f283b20aeaeccb0c0bfc9dd1e021b22',
  'eb3c382fbd647eb50d8c63e0e057c398bcacad9b8206a57042ff94ba03fadd65','91eb3722b4401ce215089275cd33760fc9d6c9e212c4e347ad9804de3eee5f42',
  '984f0ef942c466db420226b5447a65a90c000fda61c910cac4674223cdf7afcd','dce78792c0608ee9fece01d90a14541ee6002b9708563d6c593167b3d4e85924'] as const;
const stationNames = ['Cut', 'Fit', 'Weld', 'QC', 'Paint', 'Ready to Ship'] as const;
const stationKeys = ['cut', 'fit', 'weld', 'qc', 'paint', 'ready_to_ship'] as const;
const stationPercents = ['15', '20', '25', '15', '15', '10'] as const;
const handoffCategory = (seq: number) => seq <= 4 ? 'Handoff review' : seq <= 8 ? 'Releases & sequencing' : seq <= 14 ? 'Pre-construction'
  : seq <= 21 ? 'Procurement & fab release' : seq <= 29 ? 'Field mobilization' : 'Field verification';
export type SeedRecipe = { table: SetupChild['table']; values: NonNullable<SetupChild['values']> };
export function decimalIdentity(value: string | null): string | null {
  if (value === null) return null; setupDecimalSchema.parse(value);
  let result = value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
  if (result === '-0') result = '0'; return result;
}
export function seedRecipes(plan: SetupPlan, project: SetupProject): SeedRecipe[] {
  const rows: SeedRecipe[] = [];
  for (let seq = 1; seq <= 36; seq++) rows.push({ table: 'project_handoff_items', values: { seq, category: handoffCategory(seq), createdBy: project.createdBy, status: 'Not Completed', descriptionSha256: handoffDescriptions[seq - 1] } });
  actionTitles.forEach((title, i) => rows.push({ table: 'action_items', values: { title, category: 'SETUP', createdBy: project.createdBy,
    status: 'Open', priority: 'Medium', actionNumber: `AI-${String(i + 1).padStart(3, '0')}`, projectName: project.name, sortOrder: i + 1, setupItem: true, descriptionSha256: actionDescriptions[i] } }));
  stationKeys.forEach((key, i) => rows.push({ table: 'piece_station_configurations', values: { stationKey: key, stationName: stationNames[i], sortOrder: i + 1,
    earnedPercent: stationPercents[i], active: true, createdBy: project.createdBy, updatedBy: project.createdBy } }));
  for (const template of plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates) rows.push({ table: 'cost_codes', values: {
    number: template.cost_code_number, description: template.description, category: template.category, phase: template.category,
    budget: decimalIdentity(template.default_budget_amount), actual: '0', committed: '0', forecast: '0', projectName: project.name,
    createdBy: project.createdBy, autoSeeded: true, source: 'default_cost_codes' } });
  return rows;
}
function sameRows<T>(actual: T[], expected: T[], key: (row: T) => string): void {
  requireCondition(actual.length === expected.length && new Set(actual.map(key)).size === actual.length, 'SETUP_CENSUS_MISMATCH');
  for (const row of expected) requireCondition(equal(actual.find(a => key(a) === key(row)), row), 'SETUP_OBSERVATION_MISMATCH');
}
function normalizedTemplates(plan: SetupPlan) { return plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates.map(c => ({ ...c, default_budget_amount: decimalIdentity(c.default_budget_amount) })); }
function stableJson(value: unknown): string {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)])) : v;
  return boundedJson(stable(value));
}
function censusFrom(plan: SetupPlan, observation: SetupObservation): NonNullable<FoundationReceipt['census']> {
  const children = observation.children.map(child => ({ table: child.table, id: child.id, projectId: child.projectId, rowSha256: digest(stableJson(child)) }))
    .sort((a, b) => `${a.table}:${a.id}`.localeCompare(`${b.table}:${b.id}`));
  const sanitized = { actors: [...observation.actors].sort((a, b) => a.id.localeCompare(b.id)), profiles: [...observation.profiles].sort((a, b) => a.id.localeCompare(b.id)),
    organizations: observation.organizations.map(({ name, slug, ...o }) => ({ ...o, nameSha256: digest(name), slugSha256: digest(slug) })).sort((a, b) => a.id.localeCompare(b.id)),
    projects: observation.projects.map(({ name, number, ...p }) => ({ ...p, nameSha256: digest(name), numberSha256: digest(number) })).sort((a, b) => a.id.localeCompare(b.id)),
    memberships: [...observation.memberships].sort((a, b) => a.id.localeCompare(b.id)), children,
    templates: observation.activeCostCodeTemplates.map(c => ({ id: c.id, rowSha256: digest(stableJson({ ...c, default_budget_amount: decimalIdentity(c.default_budget_amount) })) })).sort((a, b) => a.id.localeCompare(b.id)) };
  return { observedAt: new Date().toISOString(), sideEffectsSha256: plan.prerequisites.sideEffectsSha256, observationSha256: digest(stableJson(sanitized)), children };
}
export function validateFoundationObservation(plan: SetupPlan, receipt: FoundationReceipt, observation: SetupObservation,
  previous?: SetupObservation, profileAliases: ReadonlySet<ActorAlias> = new Set(receipt.actors.filter(a => a.authenticated).map(a => a.alias))): void {
  boundedJson(observation);
  requireCondition(Object.keys(observation).sort().join(',') === 'activeCostCodeTemplates,actors,children,memberships,organizations,profiles,projects', 'SETUP_OBSERVATION_SCHEMA');
  requireCondition(new Set(observation.actors.map(a => a.alias)).size === observation.actors.length
    && new Set(observation.actors.map(a => a.id)).size === observation.actors.length, 'SETUP_ACTOR_CENSUS');
  sameRows(observation.activeCostCodeTemplates.map(c => ({ ...projection(costTemplateSchema, c), default_budget_amount: decimalIdentity(c.default_budget_amount) })), normalizedTemplates(plan), c => c.id);
  requireCondition(observation.actors.length === receipt.actors.length, 'SETUP_ACTOR_CENSUS');
  for (const observed of observation.actors) {
    projection(actorSchema, observed);
    const expected = receipt.actors.find(a => a.alias === observed.alias);
    requireCondition(expected && observed.id === expected.id && observed.confirmed && observed.emailSha256 === expected.emailSha256, 'SETUP_ACTOR_OBSERVATION');
    const enrollment = receipt.operations.findIndex(op => op.kind === 'intent' && op.action === 'enroll-mfa');
    const result = receipt.operations[enrollment + 1];
    const factorId = enrollment >= 0 && result?.kind === 'result' && result.outcome === 'SUCCEEDED' ? result.observedId : undefined;
    requireCondition(observed.factors.length === (observed.alias === 'mfa' && factorId ? 1 : 0), 'SETUP_FACTOR_CENSUS');
    if (observed.factors.length) requireCondition(observed.factors[0].id === factorId && observed.factors[0].type === 'totp'
      && observed.factors[0].status === (expected.mfa ? 'verified' : 'unverified'), 'SETUP_FACTOR_OBSERVATION');
  }
  const authenticated = receipt.actors.filter(a => profileAliases.has(a.alias));
  sameRows(observation.profiles, authenticated.map(a => ({ id: a.id, emailSha256: a.emailSha256, role: 'user' as const })), p => p.id);
  sameRows(observation.organizations, receipt.organizations.map(o => ({ ...o, plan: plan.context.phase === 'setup-bootstrap' ? 'free' as const : 'pro' as const,
    name: plan.organizations.find(p => p.alias === o.alias)!.name.trim(), slug: plan.organizations.find(p => p.alias === o.alias)!.slug,
    memberDefaultProjectRole: o.memberDefaultProjectRole === null ? null : 'viewer' as const })), o => o.id);
  sameRows(observation.projects, receipt.projects.map(p => ({ ...p, name: plan.projects.find(q => q.alias === p.alias)!.name,
    number: plan.projects.find(q => q.alias === p.alias)!.number })), p => p.id);
  sameRows(observation.memberships, receipt.memberships, m => m.id);
  requireCondition(new Set(observation.children.map(c => c.id)).size === observation.children.length
    && observation.children.every(c => uuid.safeParse(c.id).success && receipt.projects.some(p => p.id === c.projectId)), 'SETUP_CHILD_IDENTITY');
  for (const child of observation.children) projection(z.object({ table: z.enum(['project_handoff_items', 'action_items', 'planner_action_events', 'piece_station_configurations', 'cost_codes', 'pma_audit_logs', 'member_activity', 'number_sequences']),
    id: uuid, projectId: uuid, values: z.record(z.union([z.string().max(2048), z.number().finite(), z.boolean(), z.null()])).optional(),
    recordType: z.enum(['action_item', 'handoff_item']).optional(), nextValue: z.number().int().positive().optional() }).strict(), child);
  const expected: SetupChild[] = [];
  for (const project of observation.projects) {
    const children = observation.children.filter(c => c.projectId === project.id);
    for (const recipe of seedRecipes(plan, project)) {
      const matches = children.filter(c => c.table === recipe.table && equal(c.values, recipe.values));
      requireCondition(matches.length === 1 && !matches[0].recordType && matches[0].nextValue === undefined, 'SETUP_SEED_MISMATCH'); expected.push(matches[0]);
      if (recipe.table === 'action_items' || recipe.table === 'cost_codes') {
        const table = recipe.table === 'action_items' ? 'planner_action_events' : 'pma_audit_logs';
        const values = recipe.table === 'action_items'
          ? { entityId: matches[0].id, actorId: project.createdBy, eventType: 'action_created', entityType: 'action_item', title: recipe.values.title, status: 'Open', priority: 'Medium' }
          : { entityId: matches[0].id, actorId: project.createdBy, eventType: 'INSERT', entityType: 'cost_codes' };
        const events = children.filter(c => c.table === table && equal(c.values, values)); requireCondition(events.length === 1, 'SETUP_SEED_EVENT_MISMATCH'); expected.push(events[0]);
      }
    }
    for (const [recordType, nextValue] of [['action_item', 11], ['handoff_item', 37]] as const) {
      const counters = children.filter(c => c.table === 'number_sequences' && c.recordType === recordType && c.nextValue === nextValue && !c.values);
      requireCondition(counters.length === 1, 'SETUP_COUNTER_MISMATCH'); expected.push(counters[0]);
    }
    for (const membership of receipt.memberships.filter(m => m.projectId === project.id)) {
      const events = children.filter(c => c.table === 'member_activity' && equal(c.values, { membershipId: membership.id, actorId: project.createdBy,
        targetId: membership.userId, eventType: 'member_added', role: membership.role }));
      requireCondition(events.length === 1, 'SETUP_MEMBER_ACTIVITY_MISMATCH'); expected.push(events[0]);
    }
  }
  requireCondition(expected.length === observation.children.length, 'SETUP_UNEXPECTED_CHILD');
  if (previous) for (const child of previous.children) requireCondition(equal(observation.children.find(c => c.id === child.id), child), 'SETUP_CHILD_DRIFT');
}

const actorSchema = z.object({ alias: z.enum(ACTORS), id: uuid, emailSha256: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true),
  factors: z.array(z.object({ id: uuid, type: z.literal('totp'), status: z.enum(['verified', 'unverified']) }).strict()).max(1) }).strict();
const sessionSchema = z.object({ actorId: uuid, emailSha256: z.string().regex(/^[a-f0-9]{64}$/), sessionId: uuid,
  expiresAt: z.number().int().positive(), aal: z.enum(['aal1', 'aal2']) }).strict();
function checkActor(plan: SetupPlan, value: SetupActor, alias: ActorAlias, expectedId?: string): SetupActor {
  const actor = projection(actorSchema, value);
  requireCondition(actor.alias === alias && (!expectedId || actor.id === expectedId)
    && actor.emailSha256 === digest(plan.roster.find(a => a.alias === alias)!.email.toLowerCase()), 'SETUP_ACTOR_BINDING'); return actor;
}
function checkSession(actor: SetupActor, value: SetupSession, aal: 'aal1' | 'aal2'): SetupSession {
  const session = projection(sessionSchema, value);
  requireCondition(session.actorId === actor.id && session.emailSha256 === actor.emailSha256 && session.aal === aal
    && session.expiresAt > Math.floor(Date.now() / 1000), 'SETUP_SESSION_INVALID'); return session;
}
/** Only an explicit, bounded HTTP rejection can be known. Other dispatched failures are ambiguous. */
export class SetupRejected extends Error { constructor() { super('SETUP_REMOTE_REJECTED'); } }
const usedTransportRuns = new WeakSet<SetupTransports>();
export async function runFoundation(plan: SetupPlan, resume: SetupResume | null, transports: SetupTransports, checkpoint: SetupCheckpoint): Promise<FoundationReceipt> {
  let receipt = initialFoundationReceipt(plan, resume);
  requireCondition(!usedTransportRuns.has(transports), 'SETUP_NO_REPLAY'); usedTransportRuns.add(transports);
  const deadline = Date.now() + 600_000; const authenticated = new Set<ActorAlias>(); let previous: SetupObservation | undefined;
  let enrollment: { factorId: string; secret: string } | undefined; let challenge: { factorId: string; challengeId: string; expiresAt: number } | undefined;
  const fresh = () => { requireFoundationPlan(plan); requireCondition(Date.now() < deadline, 'SETUP_PHASE_DEADLINE'); };
  const actorFor = (alias: ActorAlias) => { const actor = receipt.actors.find(a => a.alias === alias); requireCondition(actor, 'SETUP_ACTOR_REQUIRED'); return actor; };
  const readActors = async () => {
    for (const actor of receipt.actors) {
      const observed = checkActor(plan, await transports.readActor(actor.alias, actor.id), actor.alias, actor.id);
      const enrolled = receipt.operations.findIndex(op => op.kind === 'intent' && op.action === 'enroll-mfa');
      const result = receipt.operations[enrolled + 1]; const factorId = enrolled >= 0 && result?.kind === 'result' && result.outcome === 'SUCCEEDED' ? result.observedId : undefined;
      requireCondition(equal(observed.factors, actor.alias === 'mfa' && factorId ? [{ id: factorId, type: 'totp', status: actor.mfa ? 'verified' : 'unverified' }] : []), 'SETUP_FACTOR_DRIFT');
    }
  };
  const observe = async (scope = receipt, pin = true) => {
    const observation = await transports.observe(structuredClone(scope));
    validateFoundationObservation(plan, scope, observation, pin ? previous : undefined, authenticated);
    if (pin) previous = structuredClone(observation); return observation;
  };
  const current = async (alias: ActorAlias, aal: 'aal1' | 'aal2' = 'aal1') => {
    const expected = actorFor(alias); const observed = await transports.currentUser(alias, expected.id);
    const actor = checkActor(plan, observed.actor, alias, expected.id); return checkSession(actor, observed.session, aal);
  };
  let ownerBootstrap = plan.context.phase === 'setup-complete';
  async function operation<T>(fields: Omit<SetupIntent, 'sequence' | 'kind' | 'operationId'>, dispatch: () => Promise<T>,
    apply: (value: T, candidate: FoundationReceipt) => { id: string; mfa?: { factorId: string; secret: string } },
    after?: (candidate: FoundationReceipt) => Promise<void>): Promise<void> {
    fresh(); await readActors();
    if (!ownerBootstrap && authenticated.size) await observe();
    if (fields.action !== 'create-user' && fields.action !== 'authenticate-user') await current(fields.organization ? owner(fields.organization) : fields.actor);
    const before = structuredClone(receipt);
    const intent: SetupIntent = { ...fields, sequence: receipt.operations.length + 1, kind: 'intent', operationId: randomUUID() };
    receipt.operations.push(intent); receipt.context.checkpointSequence++; receipt.status = 'UNKNOWN_COMMIT_STATE';
    try { await checkpoint.persistIntent({ intent: structuredClone(intent), receipt: structuredClone(receipt) }); }
    catch { throw new Error('SETUP_CHECKPOINT_FAILED'); }
    let observedId: string | undefined; let remoteReturned = false; let resultPersistenceStarted = false;
    try {
      fresh(); const value = await dispatch(); remoteReturned = true;
      const candidate = structuredClone(before); const applied = apply(value, candidate); observedId = uuid.parse(applied.id);
      const result: SetupResult = { sequence: intent.sequence + 1, kind: 'result', operationId: intent.operationId, outcome: 'SUCCEEDED', observedId };
      candidate.operations.push(intent, result); candidate.context.checkpointSequence += 2;
      if (after) await after(candidate);
      // Capture automatic owner rows from an exact caller observation before claiming success.
      if (fields.action === 'create-organization' || fields.action === 'create-project') {
        const observed = await transports.observe(structuredClone(candidate));
        const matches = observed.memberships.filter(m => m.role === 'owner' && (fields.action === 'create-project'
          ? m.projectId === observedId : m.orgId === observedId && !m.projectId));
        requireCondition(matches.length === 1, 'SETUP_OWNER_READBACK_REQUIRED'); candidate.memberships.push(matches[0]);
      }
      if (!ownerBootstrap && authenticated.size) {
        const observed = await transports.observe(structuredClone(candidate));
        validateFoundationObservation(plan, candidate, observed, previous, authenticated); previous = structuredClone(observed); candidate.census = censusFrom(plan, observed);
      }
      validateFoundationReceipt(candidate, plan);
      resultPersistenceStarted = true;
      await checkpoint.persistResult({ result: structuredClone(result), receipt: structuredClone(candidate), ...(applied.mfa ? { mfa: { ...applied.mfa } } : {}) });
      receipt = candidate;
    } catch (error) {
      const outcome = !remoteReturned && (error instanceof SetupRejected || error instanceof SetupReadinessStop) ? 'REJECTED' : 'UNKNOWN';
      const result: SetupResult = { sequence: intent.sequence + 1, kind: 'result', operationId: intent.operationId, outcome,
        ...(outcome === 'UNKNOWN' && observedId ? { observedId } : {}) };
      receipt.operations.push(result); receipt.context.checkpointSequence++; receipt.status = outcome === 'UNKNOWN' ? 'UNKNOWN_COMMIT_STATE' : 'STOPPED';
      // A known returned ID survives failed readback in one best-effort UNKNOWN
      // checkpoint. Never retry persistence that may already have stored success.
      if (!resultPersistenceStarted) try { await checkpoint.persistResult({ result: structuredClone(result), receipt: structuredClone(receipt) }); } catch { /* pending/unknown is retained */ }
      throw new Error('SETUP_OPERATION_STOPPED');
    }
  }
  const authenticate = async (alias: ActorAlias) => {
    await operation({ action: 'authenticate-user', actor: alias }, () => transports.signIn(alias, actorFor(alias).id), (session, candidate) => {
      const actor = candidate.actors.find(a => a.alias === alias)!;
      checkSession({ ...actor, confirmed: true, factors: [] }, session, 'aal1'); actor.authenticated = true; return { id: actor.id };
    }, async () => { await current(alias); authenticated.add(alias); });
  };
  try {
    fresh(); const artifact = await checkpoint.assertInitialUploaded({ ...plan.context });
    validateArtifactBinding(artifact, artifact);
    requireCondition(artifact.workflowRunId === plan.context.workflowRunId && artifact.workflowRunAttempt === plan.context.workflowRunAttempt
      && artifact.candidateSha === plan.context.candidateSha, 'SETUP_INITIAL_ARTIFACT_BINDING');
    if (resume) {
      // Only the two owner Auth mutations may precede application observation.
      for (const alias of ['admin', 'foreign'] as const) {
        await authenticate(alias);
        const organizations = receipt.organizations.filter(o => authenticated.has(owner(o.alias)));
        const scope = { ...receipt, organizations, memberships: receipt.memberships.filter(m => organizations.some(o => o.id === m.orgId)) };
        const observed = await observe(scope, false); receipt.census = censusFrom(plan, observed);
      }
      ownerBootstrap = false; await observe();
      receipt.census = censusFrom(plan, previous!);
      for (const alias of members) await authenticate(alias);
    } else {
      for (const alias of ACTORS) {
        await operation({ action: 'create-user', actor: alias }, () => transports.createActor(alias), (value, candidate) => {
          const actor = checkActor(plan, value, alias); requireCondition(!candidate.actors.some(a => a.id === actor.id) && !actor.factors.length, 'SETUP_NEW_ACTOR_REQUIRED');
          candidate.actors.push({ alias, id: actor.id, emailSha256: actor.emailSha256, authenticated: false }); return { id: actor.id };
        }, async candidate => { const a = candidate.actors.find(a => a.alias === alias)!; checkActor(plan, await transports.readActor(alias, a.id), alias, a.id); });
        await authenticate(alias);
      }
      for (const alias of ['A', 'B'] as const) await operation({ action: 'create-organization', actor: owner(alias), organization: alias },
        () => transports.createOrganization(receipt, alias), (value, candidate) => {
          const actor = candidate.actors.find(a => a.alias === owner(alias))!;
          requireCondition(value.alias === alias && value.createdBy === actor.id && value.ownerId === actor.id && value.plan === 'free'
            && !candidate.organizations.some(o => o.id === value.id), 'SETUP_ORG_RESPONSE');
          candidate.organizations.push({ alias, id: uuid.parse(value.id), createdBy: actor.id, ownerId: actor.id }); return { id: value.id };
        });
      fresh(); await observe(); fresh(); requireCondition(receipt.census, 'SETUP_CENSUS_REQUIRED');
      return validateFoundationReceipt({ ...receipt, status: 'AWAITING_ENTITLEMENT_REVIEW' }, plan);
    }
    for (const alias of ['A', 'B'] as const) await operation({ action: 'configure-organization', actor: owner(alias), organization: alias },
      () => transports.configureOrganization(receipt, alias), (value, candidate) => {
        const org = candidate.organizations.find(o => o.alias === alias)!; requireCondition(value.id === org.id && value.ownerId === org.ownerId
          && value.createdBy === org.createdBy && value.plan === 'pro' && value.memberDefaultProjectRole === null, 'SETUP_ORG_CONFIGURATION');
        org.memberDefaultProjectRole = null; return { id: org.id };
      });
    for (const alias of members) await operation({ action: 'add-organization-member', actor: alias, organization: 'A' },
      () => transports.addOrganizationMember(receipt, alias), (membership, candidate) => { candidate.memberships.push(membership); return { id: membership.id }; });
    for (const alias of ['A1', 'A2', 'B1', 'B2'] as const) {
      const orgAlias = alias.startsWith('A') ? 'A' : 'B';
      await operation({ action: 'create-project', actor: owner(orgAlias), organization: orgAlias, project: alias },
        () => transports.createProject(receipt, alias), (project, candidate) => {
          requireCondition(project.alias === alias && !candidate.projects.some(p => p.id === project.id), 'SETUP_NEW_PROJECT_REQUIRED');
          candidate.projects.push({ alias, id: project.id, orgId: project.orgId, createdBy: project.createdBy }); return { id: project.id };
        });
    }
    for (const alias of members) await operation({ action: 'assign-project-role', actor: alias, organization: 'A', project: 'A1' },
      () => transports.assignProjectRole(receipt, alias), (membership, candidate) => { candidate.memberships.push(membership); return { id: membership.id }; });
    await operation({ action: 'enroll-mfa', actor: 'mfa' }, () => transports.enrollMfa(receipt), value => {
      enrollment = projection(z.object({ factorId: uuid, secret: z.string().min(16).max(128).regex(/^[A-Z2-7]+$/) }).strict(), value);
      return { id: enrollment.factorId, mfa: enrollment };
    });
    requireCondition(enrollment, 'SETUP_MFA_REQUIRED'); const factor = enrollment;
    await operation({ action: 'challenge-mfa', actor: 'mfa', factorId: factor.factorId }, () => transports.challengeMfa(receipt, factor.factorId), value => {
      requireCondition(value.factorId === factor.factorId && Number.isSafeInteger(value.expiresAt) && value.expiresAt > Date.now() / 1000, 'SETUP_MFA_CHALLENGE');
      challenge = value; return { id: value.challengeId };
    });
    requireCondition(challenge, 'SETUP_MFA_REQUIRED'); const pendingChallenge = challenge;
    await operation({ action: 'verify-mfa', actor: 'mfa', factorId: factor.factorId, challengeId: pendingChallenge.challengeId }, () => {
      requireCondition(pendingChallenge.expiresAt > Date.now() / 1000, 'SETUP_MFA_CHALLENGE_EXPIRED');
      return transports.verifyMfa(receipt, factor.factorId, pendingChallenge.challengeId, computeTotp(factor.secret, Math.floor(Date.now() / 1000)));
    }, (value, candidate) => {
      requireCondition(value.factorId === factor.factorId, 'SETUP_MFA_FACTOR');
      checkSession({ ...actorFor('mfa'), confirmed: true, factors: [] }, value.session, 'aal2');
      candidate.actors.find(a => a.alias === 'mfa')!.mfa = { factorId: factor.factorId, verified: true }; return { id: factor.factorId };
    }, async () => { await current('mfa', 'aal2'); });
    fresh(); await observe(); fresh(); requireCondition(receipt.census, 'SETUP_CENSUS_REQUIRED');
    return validateFoundationReceipt({ ...receipt, status: 'FOUNDATION_PREPARED' }, plan);
  } catch { return receipt; }
}

export type SetupServerCredentials = { publicKey: string; setupKey: string; setupKeyIdentifier: string;
  credentials: PrivateRecoveryPayload['credentials']; resume?: SetupResume };
const userResponseSchema = z.object({ id: uuid, email: z.string().email().max(254), email_confirmed_at: z.string().datetime({ offset: true }),
  factors: z.array(z.object({ id: uuid, factor_type: z.literal('totp'), status: z.enum(['verified', 'unverified']) })).max(1).optional() });
function projectActorResponse(plan: SetupPlan, alias: ActorAlias, raw: unknown, expectedId?: string): SetupActor {
  const user = projection(userResponseSchema, raw);
  return checkActor(plan, { alias, id: user.id, emailSha256: digest(user.email.toLowerCase()), confirmed: true,
    factors: (user.factors ?? []).map(f => ({ id: f.id, type: f.factor_type, status: f.status })) }, alias, expectedId);
}
export function validateSetupSessionResponse(raw: unknown, expected: SetupActor) {
  const response = projection(z.object({ access_token: z.string().min(40).max(16384), token_type: z.literal('bearer'),
    expires_in: z.number().int().positive().max(86400), user: userResponseSchema }), raw);
  requireCondition(response.user.id === expected.id && digest(response.user.email.toLowerCase()) === expected.emailSha256, 'SETUP_SESSION_USER');
  const parts = response.access_token.split('.'); requireCondition(parts.length === 3 && parts.every(p => /^[A-Za-z0-9_-]+$/.test(p)), 'SETUP_SESSION_TOKEN');
  let value: unknown; let header: unknown;
  try { value = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch { throw new Error('SETUP_SESSION_TOKEN'); }
  projection(z.object({ alg: z.enum(['HS256', 'RS256', 'ES256']), typ: z.literal('JWT').optional() }), header);
  const claims = projection(z.object({ sub: uuid, email: z.string().email(), role: z.literal('authenticated'), aud: z.literal('authenticated'),
    iss: z.literal(`${STAGE_ORIGIN}/auth/v1`), exp: z.number().int().positive(), iat: z.number().int().positive(), session_id: uuid, aal: z.enum(['aal1', 'aal2']) }), value);
  const now = Math.floor(Date.now() / 1000);
  requireCondition(claims.sub === expected.id && digest(claims.email.toLowerCase()) === expected.emailSha256 && claims.iat <= now
    && claims.exp > now && claims.exp > claims.iat && claims.exp <= now + response.expires_in + 5, 'SETUP_SESSION_CLAIMS');
  return { accessToken: response.access_token, session: { actorId: expected.id, emailSha256: expected.emailSha256,
    sessionId: claims.session_id, expiresAt: claims.exp, aal: claims.aal } satisfies SetupSession };
}
/** The creator is authenticated CREATE-call provenance, not a projects column. */
export function projectCreateResponse(plan: SetupPlan, alias: SetupProjectAlias, raw: unknown, organization: SetupOrganization,
  session: SetupSession): SetupProject {
  const row = projection(z.object({ id: uuid, org_id: uuid, name: z.string().max(100), project_number: z.string().max(100) }), raw);
  const requested = plan.projects.find(p => p.alias === alias)!;
  requireCondition(requested.organization === organization.alias && row.org_id === organization.id && row.name === requested.name
    && row.project_number === requested.number && session.actorId === organization.ownerId && session.expiresAt > Date.now() / 1000, 'SETUP_PROJECT_PROVENANCE');
  return { alias, id: row.id, orgId: row.org_id, createdBy: session.actorId, name: row.name, number: row.project_number };
}
/** Decode only a complete zero-offset exact PostgREST census, including empty. */
export function validateExactSetupRows(value: unknown, contentRange: string | null, maximum: number): Record<string, unknown>[] {
  requireCondition(Number.isSafeInteger(maximum) && maximum >= 0 && maximum <= 256 && Array.isArray(value) && value.length <= maximum, 'SETUP_ROW_CAP');
  const rows = value as unknown[];
  const range = /^(0|[1-9][0-9]*)-(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)$/.exec(contentRange ?? '');
  const complete = range && range.slice(1).every(n => Number.isSafeInteger(Number(n)))
    && Number(range[1]) === 0 && Number(range[2]) + 1 === rows.length && Number(range[3]) === rows.length;
  requireCondition(rows.length === 0 ? contentRange === '*/0' : complete, 'SETUP_EXACT_RANGE_REQUIRED');
  return rows.map(row => projection(z.record(z.unknown()), row));
}
export function createSetupTransports(planValue: SetupPlan, credentialsValue: SetupServerCredentials, network: typeof fetch = fetch): SetupTransports {
  const plan = structuredClone(requireFoundationPlan(planValue));
  const credentials = structuredClone(credentialsValue);
  requireCondition(Object.keys(credentials).every(k => ['publicKey', 'setupKey', 'setupKeyIdentifier', 'credentials', 'resume'].includes(k)), 'SETUP_CREDENTIAL_SCHEMA');
  requireCondition(/^sb_publishable_[A-Za-z0-9_-]+$/.test(credentials.publicKey) && /^sb_secret_[A-Za-z0-9_-]+$/.test(credentials.setupKey)
    && credentials.publicKey !== credentials.setupKey && digest(credentials.publicKey) === plan.keyReview.publicKeySha256
    && digest(credentials.setupKey) === plan.keyReview.setupKeySha256 && credentials.setupKeyIdentifier === plan.keyReview.setupKeyIdentifier, 'SETUP_KEY_REVIEW');
  const privateCredentials = projection(z.array(z.object({ alias: z.enum(ACTORS), email: z.string().email(), password: z.string().min(24).max(128),
    mfa: z.object({ factorId: uuid, secret: z.string().min(16).max(128).regex(/^[A-Z2-7]+$/) }).strict().optional() }).strict()).length(7), credentials.credentials);
  requireCondition(new Set(privateCredentials.map(c => c.alias)).size === 7 && new Set(privateCredentials.map(c => c.password)).size === 7
    && privateCredentials.every(c => plan.roster.some(a => a.alias === c.alias && a.email === c.email) && !c.mfa), 'SETUP_PRIVATE_CREDENTIALS');
  const known = new Map<ActorAlias, string>(); const sessions = new Map<ActorAlias, { accessToken: string; session: SetupSession }>();
  const created = new Set<ActorAlias>(); const projectProvenance = new Map<string, string>(); const deadline = Date.now() + 600_000;
  const organizationIds = new Map<SetupOrganizationAlias, string>(); const projectIds = new Map<SetupProjectAlias, string>(); const dispatched = new Set<string>();
  const once = (action: string, alias: string) => { const key = `${action}:${alias}`; requireCondition(!dispatched.has(key), 'SETUP_TRANSPORT_NO_REPLAY'); dispatched.add(key); };
  if (plan.context.phase === 'setup-complete') {
    requireCondition(credentials.resume && plan.prior, 'SETUP_RESUME_REQUIRED');
    validateSetupResume(boundedJson(credentials.resume), digest(boundedJson(credentials.resume)), plan, plan.prior.artifact);
    requireCondition(credentials.resume.recovery.receipt.census, 'SETUP_RESUME_CENSUS_REQUIRED');
    for (const actor of credentials.resume.recovery.receipt.actors) known.set(actor.alias, actor.id);
    for (const organization of credentials.resume.recovery.receipt.organizations) organizationIds.set(organization.alias, organization.id);
    requireCondition(equal(privateCredentials, credentials.resume.recovery.credentials), 'SETUP_RESTORED_CREDENTIALS');
  } else requireCondition(!credentials.resume, 'SETUP_BOOTSTRAP_RESUME_FORBIDDEN');
  const fresh = () => { requireFoundationPlan(plan); requireCondition(Date.now() < deadline, 'SETUP_PHASE_DEADLINE'); };
  const request = async (path: string, method: 'GET' | 'POST' | 'PATCH', headers: Record<string, string>, body?: unknown, exactRows?: number): Promise<unknown> => {
    fresh(); const url = new URL(path, STAGE_ORIGIN);
    requireCondition(url.origin === STAGE_ORIGIN && !url.username && !url.password && !url.hash, 'SETUP_FIXED_TARGET');
    const attempts = method === 'GET' ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController(); let timeout: ReturnType<typeof setTimeout>;
      const expired = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('SETUP_REQUEST_DEADLINE')); }, Math.min(10_000, deadline - Date.now())); });
      try {
        // No caller, callback, environment flag or matching digest can open this dispatch.
        if (method !== 'GET') assertSetupMutationReadiness();
        const response = await Promise.race([expired, network(url, { method, headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation,count=exact' },
          redirect: 'error', signal: controller.signal, ...(body === undefined ? {} : { body: boundedJson(body) }) })]);
        requireCondition(!response.redirected && (!response.url || new URL(response.url).origin === STAGE_ORIGIN), 'SETUP_REDIRECT_REFUSED');
        const length = response.headers.get('content-length'); requireCondition(!length || (/^[0-9]+$/.test(length) && Number(length) <= 1_048_576), 'SETUP_RESPONSE_SIZE');
        requireCondition(response.body, 'SETUP_RESPONSE_EMPTY');
        const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        while (true) { const part = await Promise.race([expired, reader.read()]); if (part.done) break; size += part.value.length;
          if (size > 1_048_576) { await reader.cancel(); throw new Error('SETUP_RESPONSE_SIZE'); } chunks.push(part.value); }
        const raw = Buffer.concat(chunks).toString('utf8'); const value: unknown = JSON.parse(raw);
        if (!response.ok) {
          const parsed = z.object({ code: z.string().max(100).optional(), error_code: z.string().max(100).optional() }).safeParse(value);
          const code = parsed.success ? parsed.data.code ?? parsed.data.error_code : undefined;
          const rejectedCodes = url.pathname.startsWith('/rest/v1/') ? ['42501', '23505', '23503', '23514', 'P0001']
            : ['email_exists', 'user_already_exists', 'validation_failed', 'invalid_credentials', 'bad_jwt', 'no_authorization'];
          if (method !== 'GET' && [400, 401, 403, 404, 409, 422].includes(response.status) && code && rejectedCodes.includes(code)) throw new SetupRejected();
          throw new Error('SETUP_HTTP_FAILURE');
        }
        return exactRows === undefined ? value : validateExactSetupRows(value, response.headers.get('content-range'), exactRows);
      } catch (error) {
        if (method !== 'GET' || attempt + 1 === attempts) throw error instanceof SetupRejected ? error : new Error('SETUP_REQUEST_FAILED');
      } finally { clearTimeout(timeout!); }
      fresh();
    }
    throw new Error('SETUP_REQUEST_FAILED');
  };
  // New API keys belong in apikey. They are not JWT bearer tokens.
  const adminRead = async (alias: ActorAlias, id: string) => {
    requireCondition(known.get(alias) === id && uuid.safeParse(id).success, 'SETUP_EXACT_AUTH_ID_REQUIRED');
    const raw = await request(`/auth/v1/admin/users/${id}`, 'GET', { apikey: credentials.setupKey });
    return projectActorResponse(plan, alias, raw, id);
  };
  const actorHeaders = (alias: ActorAlias) => {
    const state = sessions.get(alias); requireCondition(state && state.session.expiresAt > Date.now() / 1000, 'SETUP_SESSION_REQUIRED');
    requireCondition(!state.accessToken.startsWith('sb_') && state.accessToken !== credentials.setupKey, 'SETUP_CALLER_KEY_FORBIDDEN');
    return { apikey: credentials.publicKey, Authorization: `Bearer ${state.accessToken}` };
  };
  const currentUser = async (alias: ActorAlias, id: string) => {
    requireCondition(known.get(alias) === id, 'SETUP_EXACT_AUTH_ID_REQUIRED'); const state = sessions.get(alias);
    requireCondition(state, 'SETUP_SESSION_REQUIRED');
    const actor = projectActorResponse(plan, alias, await request('/auth/v1/user', 'GET', actorHeaders(alias)), id);
    checkSession(actor, state.session, state.session.aal); return { actor, session: { ...state.session } };
  };
  const caller = async (alias: ActorAlias, path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown, exactRows?: number) => {
    const id = known.get(alias); requireCondition(id, 'SETUP_ACTOR_REQUIRED');
    if (method !== 'GET') await currentUser(alias, id);
    return request(path, method, actorHeaders(alias), body, exactRows);
  };
  const rows = async (alias: ActorAlias, table: string, select: string, filters: Record<string, string>, max: number): Promise<Record<string, unknown>[]> => {
    const query = new URLSearchParams({ select, ...filters, limit: String(max + 1) });
    // Preserve the response's exact range/count through request validation; a
    // server-side cap cannot hide extra rows behind an expected-length array.
    return await caller(alias, `/rest/v1/${table}?${query}`, 'GET', undefined, max) as Record<string, unknown>[];
  };
  const organizationRow = (alias: SetupOrganizationAlias, raw: unknown, ownerId: string): SetupOrganization => {
    const row = projection(z.object({ id: uuid, created_by: uuid, name: z.string(), slug: z.string(), plan: z.enum(['free', 'pro']), member_default_project_role: z.literal('viewer').nullable() }), raw);
    requireCondition(row.created_by === ownerId, 'SETUP_ORG_OWNER');
    return { alias, id: row.id, createdBy: row.created_by, ownerId, name: row.name, slug: row.slug, plan: row.plan, memberDefaultProjectRole: row.member_default_project_role };
  };
  const exactOrg = (scope: FoundationReceipt, alias: SetupOrganizationAlias) => {
    const org = scope.organizations.find(o => o.alias === alias); requireCondition(org && known.get(owner(alias)) === org.ownerId
      && organizationIds.get(alias) === org.id, 'SETUP_ORG_SCOPE'); return org;
  };
  const memberRow = (scope: FoundationReceipt, raw: unknown, orgId: string, projectId?: string): SetupMembership => {
    const row = projection(z.object({ id: uuid, user_id: uuid, role: z.enum(['owner', 'member', 'pm', 'viewer', 'field']), org_id: uuid.optional(), project_id: uuid.optional() }), raw);
    const actor = scope.actors.find(a => a.id === row.user_id); requireCondition(actor && (projectId ? row.project_id === projectId : row.org_id === orgId), 'SETUP_MEMBERSHIP_SCOPE');
    return { id: row.id, actor: actor.alias, userId: row.user_id, orgId, ...(projectId ? { projectId } : {}), role: row.role };
  };
  const one = (value: unknown): unknown => { if (Array.isArray(value)) { requireCondition(value.length === 1, 'SETUP_ONE_ROW_REQUIRED'); return value[0]; } return value; };
  const observe = async (scope: FoundationReceipt): Promise<SetupObservation> => {
    fresh(); const result: SetupObservation = { actors: [], profiles: [], organizations: [], projects: [], memberships: [], children: [], activeCostCodeTemplates: [] };
    const available = ACTORS.find(a => sessions.has(a)); requireCondition(available, 'SETUP_OBSERVER_SESSION_REQUIRED');
    result.activeCostCodeTemplates = (await rows(available, 'default_cost_codes', 'id,cost_code_number,description,category,default_budget_amount::text,sort_order,is_active', { is_active: 'eq.true' }, 256)).map(c => projection(costTemplateSchema, c));
    for (const actor of scope.actors) {
      result.actors.push(await adminRead(actor.alias, actor.id));
      if (sessions.has(actor.alias)) {
        const profile = one(await rows(actor.alias, 'user_profiles', 'id,email,role', { id: `eq.${actor.id}` }, 1));
        const row = projection(z.object({ id: uuid, email: z.string().email(), role: z.literal('user') }), profile);
        requireCondition(row.id === actor.id, 'SETUP_PROFILE_ID'); result.profiles.push({ id: row.id, emailSha256: digest(row.email.toLowerCase()), role: row.role });
      }
    }
    for (const org of scope.organizations) {
      const alias = owner(org.alias); exactOrg(scope, org.alias);
      const orgRaw = one(await rows(alias, 'organizations', 'id,created_by,name,slug,plan,member_default_project_role', { id: `eq.${org.id}` }, 1));
      const membersRaw = await rows(alias, 'organization_members', 'id,org_id,user_id,role', { org_id: `eq.${org.id}` }, 7);
      const orgMembers = membersRaw.map(m => memberRow(scope, m, org.id));
      requireCondition(orgMembers.filter(m => m.role === 'owner' && m.userId === org.ownerId).length === 1, 'SETUP_OWNER_READBACK_REQUIRED');
      result.organizations.push(organizationRow(org.alias, orgRaw, org.ownerId)); result.memberships.push(...orgMembers);
      // Org-wide, bounded read detects extra receipt-unbound projects without a customer scan.
      const projects = await rows(alias, 'projects', 'id,org_id,name,project_number', { org_id: `eq.${org.id}` }, 2);
      for (const raw of projects) {
        const id = uuid.parse(raw.id); const bound = scope.projects.find(p => p.id === id);
        requireCondition(bound && projectProvenance.get(id) === bound.createdBy, 'SETUP_PROJECT_PROVENANCE_REQUIRED');
        const project = projectCreateResponse(plan, bound.alias, raw, result.organizations.at(-1)!, sessions.get(alias)!.session);
        result.projects.push(project);
        result.memberships.push(...(await rows(alias, 'user_projects', 'id,user_id,project_id,role', { project_id: `eq.${id}` }, 6)).map(m => memberRow(scope, m, org.id, id)));
        result.children.push(...await observeChildren(alias, project));
      }
    }
    return result;
  };
  const observeChildren = async (alias: ActorAlias, project: SetupProject): Promise<SetupChild[]> => {
    const children: SetupChild[] = []; const filter = { project_id: `eq.${project.id}` };
    const add = (table: SetupChild['table'], row: Record<string, unknown>, values: NonNullable<SetupChild['values']>) => {
      requireCondition(row.project_id === project.id, 'SETUP_CHILD_PROJECT'); children.push({ table, id: uuid.parse(row.id), projectId: project.id, values });
    };
    const text = (v: unknown) => projection(z.string().max(2048), v); const uid = (v: unknown) => uuid.parse(v);
    const integer = (v: unknown) => projection(z.number().int(), v); const bool = (v: unknown) => projection(z.boolean(), v);
    const record = (v: unknown) => projection(z.record(z.unknown()), v);
    for (const row of await rows(alias, 'project_handoff_items', 'id,project_id,seq,category,created_by,status,description', filter, 36)) add('project_handoff_items', row,
      { seq: integer(row.seq), category: text(row.category), createdBy: uid(row.created_by), status: text(row.status), descriptionSha256: digest(text(row.description)) });
    for (const row of await rows(alias, 'action_items', 'id,project_id,title,category,created_by,status,priority,action_number,project_name,metadata,description', filter, 10)) {
      const metadata = record(row.metadata); add('action_items', row, { title: text(row.title), category: text(row.category), createdBy: uid(row.created_by),
        status: text(row.status), priority: text(row.priority), actionNumber: text(row.action_number), projectName: text(row.project_name), sortOrder: integer(metadata.sort_order), setupItem: bool(metadata.setup_item), descriptionSha256: digest(text(row.description)) });
    }
    for (const row of await rows(alias, 'planner_action_events', 'id,project_id,entity_id,actor_user_id,event_type,entity_type,after_state', filter, 10)) {
      const after = record(row.after_state); add('planner_action_events', row, { entityId: uid(row.entity_id), actorId: uid(row.actor_user_id), eventType: text(row.event_type),
        entityType: text(row.entity_type), title: text(after.title), status: text(after.status), priority: text(after.priority) });
    }
    for (const row of await rows(alias, 'piece_station_configurations', 'id,project_id,station_key,station_name,sort_order,earned_percent::text,is_active,created_by,updated_by', filter, 6)) add('piece_station_configurations', row,
      { stationKey: text(row.station_key), stationName: text(row.station_name), sortOrder: integer(row.sort_order), earnedPercent: decimalIdentity(text(row.earned_percent)), active: bool(row.is_active), createdBy: uid(row.created_by), updatedBy: uid(row.updated_by) });
    const n = plan.prerequisiteDetails!.sideEffects.activeCostCodeTemplates.length;
    for (const row of await rows(alias, 'cost_codes', 'id,project_id,cost_code_number,description,category,phase,budget_amount::text,actual_cost::text,committed_cost::text,forecast_to_complete::text,project_name,created_by,metadata', filter, n)) {
      const metadata = record(row.metadata); add('cost_codes', row, { number: text(row.cost_code_number), description: text(row.description), category: text(row.category), phase: text(row.phase),
        budget: row.budget_amount === null ? null : decimalIdentity(text(row.budget_amount)), actual: decimalIdentity(text(row.actual_cost)), committed: decimalIdentity(text(row.committed_cost)),
        forecast: decimalIdentity(text(row.forecast_to_complete)), projectName: text(row.project_name), createdBy: uid(row.created_by), autoSeeded: bool(metadata.auto_seeded), source: text(metadata.source) });
    }
    for (const row of await rows(alias, 'pma_audit_logs', 'id,project_id,entity_id,changed_by,action,entity_type', filter, n)) add('pma_audit_logs', row,
      { entityId: uid(row.entity_id), actorId: uid(row.changed_by), eventType: text(row.action), entityType: text(row.entity_type) });
    for (const row of await rows(alias, 'member_activity', 'id,project_id,actor_user_id,target_user_id,event_type,new_role,metadata', filter, 6)) add('member_activity', row,
      { membershipId: uid(record(row.metadata).user_project_id), actorId: uid(row.actor_user_id), targetId: uid(row.target_user_id), eventType: text(row.event_type), role: text(row.new_role) });
    for (const row of await rows(alias, 'number_sequences', 'id,project_id,record_type,next_value', filter, 2)) {
      requireCondition(row.project_id === project.id, 'SETUP_CHILD_PROJECT'); children.push({ table: 'number_sequences', id: uid(row.id), projectId: project.id,
        recordType: projection(z.enum(['action_item', 'handoff_item']), row.record_type), nextValue: integer(row.next_value) });
    }
    return children;
  };
  const implementation: SetupTransports = {
    async createActor(alias) {
      assertSetupMutationReadiness();
      requireCondition(plan.context.phase === 'setup-bootstrap' && ACTORS.includes(alias) && !known.has(alias) && !created.has(alias), 'SETUP_CREATE_ONCE');
      created.add(alias); const secret = privateCredentials.find(c => c.alias === alias)!;
      const raw = await request('/auth/v1/admin/users', 'POST', { apikey: credentials.setupKey }, { email: secret.email, password: secret.password, email_confirm: true });
      const actor = projectActorResponse(plan, alias, raw); requireCondition(![...known.values()].includes(actor.id), 'SETUP_AUTH_DUPLICATE'); known.set(alias, actor.id); return actor;
    },
    readActor: adminRead,
    async signIn(alias, id) {
      assertSetupMutationReadiness();
      requireCondition(known.get(alias) === id && !sessions.has(alias), 'SETUP_SIGNIN_ONCE'); const secret = privateCredentials.find(c => c.alias === alias)!;
      const expected = await adminRead(alias, id);
      once('authenticate-user', alias);
      const raw = await request('/auth/v1/token?grant_type=password', 'POST', { apikey: credentials.publicKey }, { email: secret.email, password: secret.password });
      const state = validateSetupSessionResponse(raw, expected); requireCondition(state.session.aal === 'aal1', 'SETUP_AAL1_REQUIRED'); sessions.set(alias, state);
      await currentUser(alias, id); return { ...state.session };
    },
    currentUser, observe,
    async createOrganization(scope, alias) {
      assertSetupMutationReadiness();
      requireCondition(plan.context.phase === 'setup-bootstrap' && !scope.organizations.some(o => o.alias === alias) && !organizationIds.has(alias), 'SETUP_CREATE_ORG_ONCE');
      const description = plan.organizations.find(o => o.alias === alias)!; const actorId = known.get(owner(alias)); requireCondition(actorId, 'SETUP_OWNER_REQUIRED');
      once('create-organization', alias);
      const organization = organizationRow(alias, one(await caller(owner(alias), '/rest/v1/rpc/create_organization', 'POST', { p_name: description.name, p_slug: description.slug })), actorId!);
      requireCondition(![...organizationIds.values()].includes(organization.id), 'SETUP_ORG_REUSED'); organizationIds.set(alias, organization.id); return organization;
    },
    async configureOrganization(scope, alias) {
      assertSetupMutationReadiness();
      const org = exactOrg(scope, alias); requireCondition(plan.context.phase === 'setup-complete', 'SETUP_COMPLETE_REQUIRED');
      once('configure-organization', alias);
      return organizationRow(alias, one(await caller(owner(alias), `/rest/v1/organizations?id=eq.${org.id}&select=id,created_by,name,slug,plan,member_default_project_role`, 'PATCH', { member_default_project_role: null })), org.ownerId);
    },
    async addOrganizationMember(scope, alias) {
      assertSetupMutationReadiness();
      requireCondition(members.includes(alias) && plan.context.phase === 'setup-complete', 'SETUP_MEMBER_REQUIRED'); const org = exactOrg(scope, 'A'); const userId = known.get(alias);
      requireCondition(userId && !scope.memberships.some(m => m.userId === userId && !m.projectId), 'SETUP_MEMBER_ONCE');
      once('add-organization-member', alias);
      return memberRow(scope, one(await caller('admin', '/rest/v1/organization_members?select=id,org_id,user_id,role', 'POST', { org_id: org.id, user_id: userId, role: 'member' })), org.id);
    },
    async createProject(scope, alias) {
      assertSetupMutationReadiness();
      requireCondition(plan.context.phase === 'setup-complete' && !scope.projects.some(p => p.alias === alias) && !projectIds.has(alias), 'SETUP_CREATE_PROJECT_ONCE');
      const description = plan.projects.find(p => p.alias === alias)!; const org = exactOrg(scope, description.organization); const actor = owner(org.alias);
      const session = (await currentUser(actor, org.ownerId)).session;
      once('create-project', alias);
      const raw = one(await caller(actor, '/rest/v1/rpc/create_project', 'POST', { project_data: { name: description.name, project_number: description.number, org_id: org.id } }));
      const project = projectCreateResponse(plan, alias, raw, { ...org, name: '', slug: '', plan: 'pro', memberDefaultProjectRole: null }, session);
      requireCondition(!projectProvenance.has(project.id), 'SETUP_PROJECT_REUSED'); projectProvenance.set(project.id, session.actorId); projectIds.set(alias, project.id); return project;
    },
    async assignProjectRole(scope, alias) {
      assertSetupMutationReadiness();
      requireCondition(members.includes(alias) && plan.context.phase === 'setup-complete', 'SETUP_MEMBER_REQUIRED'); const org = exactOrg(scope, 'A');
      const project = scope.projects.find(p => p.alias === 'A1')!; requireCondition(project && project.orgId === org.id, 'SETUP_PROJECT_REQUIRED');
      const userId = known.get(alias); requireCondition(userId && !scope.memberships.some(m => m.userId === userId && m.projectId === project.id), 'SETUP_ROLE_ONCE');
      requireCondition(projectIds.get('A1') === project.id, 'SETUP_PROJECT_SCOPE'); once('assign-project-role', alias);
      return memberRow(scope, one(await caller('admin', '/rest/v1/user_projects?select=id,user_id,project_id,role', 'POST', { user_id: userId, project_id: project.id, role: roles[alias] })), org.id, project.id);
    },
    async enrollMfa(scope) {
      assertSetupMutationReadiness();
      requireCondition(plan.context.phase === 'setup-complete' && !scope.operations.slice(0, -1).some(o => o.kind === 'intent' && o.action === 'enroll-mfa'), 'SETUP_ENROLL_ONCE');
      const actorId = known.get('mfa'); requireCondition(actorId, 'SETUP_MFA_ACTOR'); requireCondition(!(await currentUser('mfa', actorId!)).actor.factors.length, 'SETUP_MFA_ALREADY_ENROLLED');
      once('enroll-mfa', 'mfa');
      const raw = projection(z.object({ id: uuid, type: z.literal('totp'), totp: z.object({ secret: z.string().min(16).max(128).regex(/^[A-Z2-7]+$/) }) }),
        await caller('mfa', '/auth/v1/factors', 'POST', { factor_type: 'totp' }));
      return { factorId: raw.id, secret: raw.totp.secret };
    },
    async challengeMfa(scope, factorId) {
      assertSetupMutationReadiness();
      validateFoundationReceipt(scope, plan); uuid.parse(factorId);
      requireCondition(scope.operations.some((op, i) => op.kind === 'intent' && op.action === 'enroll-mfa' && scope.operations[i + 1]?.kind === 'result'
        && (scope.operations[i + 1] as SetupResult).observedId === factorId) && !scope.operations.slice(0, -1).some(op => op.kind === 'intent' && op.action === 'challenge-mfa'), 'SETUP_FACTOR_REQUIRED');
      once('challenge-mfa', 'mfa');
      const result = projection(z.object({ id: uuid, type: z.literal('totp'), expires_at: z.number().int().positive() }), await caller('mfa', `/auth/v1/factors/${factorId}/challenge`, 'POST', {}));
      return { factorId, challengeId: result.id, expiresAt: result.expires_at };
    },
    async verifyMfa(scope, factorId, challengeId, code) {
      assertSetupMutationReadiness();
      validateFoundationReceipt(scope, plan); uuid.parse(factorId); uuid.parse(challengeId); requireCondition(/^[0-9]{6}$/.test(code), 'SETUP_TOTP_REQUIRED');
      requireCondition(scope.operations.some((op, i) => op.kind === 'intent' && op.action === 'challenge-mfa' && op.factorId === factorId
        && (scope.operations[i + 1] as SetupResult)?.observedId === challengeId) && !scope.operations.slice(0, -1).some(op => op.kind === 'intent' && op.action === 'verify-mfa'), 'SETUP_CHALLENGE_REQUIRED');
      once('verify-mfa', 'mfa');
      const actorId = known.get('mfa')!; const expected = (await currentUser('mfa', actorId)).actor;
      const state = validateSetupSessionResponse(await caller('mfa', `/auth/v1/factors/${factorId}/verify`, 'POST', { challenge_id: challengeId, code }), expected);
      requireCondition(state.session.aal === 'aal2', 'SETUP_AAL2_REQUIRED'); sessions.set('mfa', state);
      const current = await currentUser('mfa', actorId); requireCondition(current.actor.factors.length === 1 && current.actor.factors[0].id === factorId
        && current.actor.factors[0].status === 'verified', 'SETUP_VERIFIED_FACTOR_REQUIRED'); return { factorId, session: { ...state.session } };
    },
  };
  return implementation;
}

export function parseSetupArguments(args: string[]) {
  requireCondition(args[0] === 'prepare' || args[0] === 'run', 'SETUP_COMMAND_REQUIRED');
  const allowed = ['target', 'expected-ref', 'candidate-sha', 'phase', 'plan-sha256', 'resume-sha256']; const options: Record<string, string> = {};
  for (const argument of args.slice(1)) {
    const match = /^--([a-z0-9-]+)=([^\s=]+)$/.exec(argument); requireCondition(match && allowed.includes(match[1]) && !options[match[1]], 'SETUP_ARGUMENT_REFUSED'); options[match[1]] = match[2];
  }
  requireCondition(options.target === 'staging' && options['expected-ref'] === STAGE_REF && /^[a-f0-9]{40}$/.test(options['candidate-sha'] ?? '')
    && ['setup-bootstrap', 'setup-complete'].includes(options.phase) && /^[a-f0-9]{64}$/.test(options['plan-sha256'] ?? '')
    && (options.phase === 'setup-complete' ? /^[a-f0-9]{64}$/.test(options['resume-sha256'] ?? '') : !options['resume-sha256']), 'SETUP_ARGUMENT_BINDING');
  return { command: args[0] as 'prepare' | 'run', options };
}
export function runSetupCli(args: string[]): never {
  parseSetupArguments(args);
  // Before environment/credential/file access. Task 4 owns checkpoint IO and upload binding.
  return assertSetupMutationReadiness();
}

export function setupRunPaths(runnerTemp: string, workflowRunId: string, attempt: string) {
  requireCondition(isAbsolute(runnerTemp) && !runnerTemp.startsWith('\\\\') && /^[1-9][0-9]{0,19}$/.test(workflowRunId)
    && /^[1-9][0-9]{0,19}$/.test(attempt), 'SETUP_RUN_PATH');
  const root = resolve(runnerTemp); const suffix = `${workflowRunId}-${attempt}`;
  return { root, inputs: join(root, `drawing-foundation-input-${suffix}`), run: join(root, `drawing-foundation-${suffix}`) };
}
/** Task 4 supplies this closure with the independently reviewed initial upload binding.
 * Only private, create-new encrypted checkpoints are written; no final upload is claimed. */
export function createPrivateSetupCheckpoint(initial: PrivateRecoveryPayload, recipientSpki: string, directory: string,
  initialArtifact: ArtifactBinding, independentlyVerifiedArtifact: ArtifactBinding): SetupCheckpoint {
  let payload = structuredClone(validatePrivateRecoveryPayload(initial, initial.receipt.context));
  const persist = async (receipt: FoundationReceipt, kind: 'intent' | 'result', mfa?: { factorId: string; secret: string }) => {
    const next = structuredClone(payload); next.receipt = structuredClone(receipt);
    if (mfa) {
      const intent = receipt.operations.at(-2); const result = receipt.operations.at(-1);
      requireCondition(kind === 'result' && intent?.kind === 'intent' && intent.action === 'enroll-mfa' && intent.actor === 'mfa'
        && result?.kind === 'result' && result.outcome === 'SUCCEEDED' && result.observedId === mfa.factorId, 'SETUP_PRIVATE_DELTA_REFUSED');
      next.credentials.find(c => c.alias === 'mfa')!.mfa = { ...mfa };
    }
    validatePrivateRecoveryPayload(next, receipt.context);
    await writePrivateJson(join(directory, checkpointFilename(receipt.context, kind).replace(/\.json$/, '.enc.json')), encryptRecovery(next, recipientSpki, receipt.context));
    payload = next;
  };
  return {
    async assertInitialUploaded(context) {
      const actual = validateArtifactBinding(initialArtifact, independentlyVerifiedArtifact);
      requireCondition(context.workflowRunId === actual.workflowRunId && context.workflowRunAttempt === actual.workflowRunAttempt
        && context.candidateSha === actual.candidateSha && equal(context, initial.receipt.context), 'SETUP_INITIAL_UPLOAD_CONTEXT'); return actual;
    },
    async persistIntent({ intent, receipt }) { requireCondition(equal(receipt.operations.at(-1), intent), 'SETUP_CHECKPOINT_INTENT'); await persist(receipt, 'intent'); },
    async persistResult({ result, receipt, mfa }) { requireCondition(equal(receipt.operations.at(-1), result), 'SETUP_CHECKPOINT_RESULT'); await persist(receipt, 'result', mfa); },
  };
}
/** The real entry always stops before this offline/file path. It exists so the
 * reviewed prepare/run wiring has fixed paths and no secret-valued CLI switches. */
async function setupCommandFiles(args: string[], environment: NodeJS.ProcessEnv): Promise<FoundationReceipt | undefined> {
  const parsed = parseSetupArguments(args); const workflowRunId = environment.GITHUB_RUN_ID ?? ''; const attempt = environment.GITHUB_RUN_ATTEMPT ?? '';
  const paths = setupRunPaths(environment.RUNNER_TEMP ?? '', workflowRunId, attempt);
  const root = await lstat(paths.root); requireCondition(root.isDirectory() && !root.isSymbolicLink() && resolve(await realpath(paths.root)) === paths.root, 'SETUP_RUN_ROOT');
  const planRaw = await readPrivateText(join(paths.inputs, 'plan.json'));
  const unvalidated = JSON.parse(planRaw) as SetupPlan;
  const context: SetupPlan['context'] = { ...unvalidated.context, projectRef: STAGE_REF, candidateSha: parsed.options['candidate-sha'], workflowRunId,
    workflowRunAttempt: attempt, phase: parsed.options.phase as SetupPlan['context']['phase'], checkpointSequence: 0 };
  const plan = validateSetupPlan(planRaw, parsed.options['plan-sha256'], context); requireFoundationPlan(plan);
  const resume = plan.context.phase === 'setup-complete'
    ? validateSetupResume(await readPrivateText(join(paths.inputs, 'resume.json')), parsed.options['resume-sha256'], plan, plan.prior!.artifact) : null;
  const recipient = await readPrivateText(join(paths.inputs, 'recipient.pem'), 4096);
  if (parsed.command === 'prepare') {
    // mkdir without recursive/exist-ok is the run-specific create-new barrier.
    await mkdir(paths.run, { mode: 0o700 });
    if (process.platform === 'win32') {
      const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
      const wrapper = fileURLToPath(new URL('./drawing-cutover-recovery-local.ps1', import.meta.url));
      await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; . ${quote(wrapper)}; Protect-RecoveryLeaf ${quote(paths.run)}`],
        { windowsHide: true, timeout: 15_000, maxBuffer: 4096, env: { SystemRoot: environment.SystemRoot, WINDIR: environment.WINDIR, PATH: environment.PATH, TEMP: environment.TEMP } });
    }
    const prepared = prepareFoundation(plan, resume, recipient);
    await writePrivateJson(join(paths.run, 'prepared-private.json'), prepared.payload);
    await writePrivateJson(join(paths.run, 'initial.enc.json'), prepared.envelope); return;
  }
  const prepared = validatePrivateRecoveryPayload(await readPrivateJson(join(paths.run, 'prepared-private.json')), plan.context);
  requireCondition(equal(prepared.plan, plan) && prepared.receipt.operations.length === 0 && prepared.receipt.status === 'STOPPED', 'SETUP_PREPARED_INPUT');
  const binding = projection(z.object({ artifact: z.unknown(), independentlyVerifiedExpected: z.unknown() }).strict(), await readPrivateJson(join(paths.inputs, 'initial-upload.json')));
  const artifact = validateArtifactBinding(binding.artifact, binding.independentlyVerifiedExpected as ArtifactBinding);
  requireCondition(artifact.ciphertextSha256 === digest(await readPrivateText(join(paths.run, 'initial.enc.json'), 1_402_200)), 'SETUP_INITIAL_CIPHERTEXT');
  // Setup key stays in this server input and transport closure, never the private recovery payload.
  const keys = projection(z.object({ publicKey: z.string(), setupKey: z.string(), setupKeyIdentifier: z.string() }).strict(), await readPrivateJson(join(paths.inputs, 'server-credentials.json')));
  const transport = createSetupTransports(plan, { ...keys, credentials: prepared.credentials, ...(resume ? { resume } : {}) });
  const checkpoint = createPrivateSetupCheckpoint(prepared, recipient, paths.run, artifact, binding.independentlyVerifiedExpected as ArtifactBinding);
  return runFoundation(plan, resume, transport, checkpoint);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runSetupCli(process.argv.slice(2));
    // This line cannot run until a later reviewed change replaces the unconditional stop.
    void setupCommandFiles(process.argv.slice(2), process.env).then(receipt => { if (receipt) process.stdout.write(`${JSON.stringify(safeSetupStatus(receipt))}\n`); })
      .catch(() => { process.stderr.write('SETUP_REFUSED\n'); process.exitCode = 1; });
  } catch { process.stderr.write('SETUP_REFUSED\n'); process.exitCode = 1; }
}
