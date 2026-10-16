/** Validation only. This module cannot provision users, grant roles, or apply SQL. */
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const STAGE_REF = 'ndyfjffsulfbwpmwdmic';
export const STAGE_ORIGIN = `https://${STAGE_REF}.supabase.co`;
export const PREVIEW_ORIGIN = 'http://127.0.0.1:4173';
export const ACTORS = ['pm', 'viewer', 'field', 'admin', 'foreign', 'removed', 'mfa'] as const;
export type ActorAlias = typeof ACTORS[number];
export const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
export function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
/** No prerequisite verifier exists yet. Only reviewed source work can open writes;
 * flags, actor aliases, manifest assertions and a later reporter cannot do so. */
export function assertDrawingMutationReadiness(): void {
  throw new Error('MUTATION_PREREQUISITES_UNPROVED');
}
const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const alias = z.enum(ACTORS);
const entityTable = z.enum(['drawings', 'drawing_sets', 'drawing_revisions', 'submittals', 'submittal_rounds', 'drawing_holds', 'drawing_zones', 'rfis']);
const fixtureSchema = z.object({
  version: z.literal(1), projectRef: z.literal(STAGE_REF), candidateSha: z.string().regex(/^[a-f0-9]{40}$/), runId: uuid,
  expiresAt: z.string().datetime(), publicKeySha256: hash, review: z.object({ reviewer: z.string().min(1), evidenceSha256: hash }).strict(),
  organizations: z.array(uuid).length(2),
  projects: z.array(z.object({ id: uuid, orgId: uuid, createdBy: uuid }).strict()).length(4),
  actors: z.array(z.object({ alias, id: uuid, orgId: uuid, emailSha256: hash, factorId: uuid.optional() }).strict()).length(7),
  entities: z.array(z.object({ table: entityTable, id: uuid, projectId: uuid }).strict()).max(250),
  storage: z.array(z.object({ projectId: uuid, path: z.string().max(512), sha256: hash, pages: z.number().int().positive().max(250) }).strict()).min(1).max(20),
  fab: z.object({ projectId: uuid, blockedDrawingId: uuid, cleanDrawingId: uuid }).strict().optional(),
}).strict();
export type FixtureManifest = z.infer<typeof fixtureSchema>;
const credentialSchema = z.object({ email: z.string().email(), password: z.string().min(1), totpSecret: z.string().optional() }).strict();
export type ActorCredential = z.infer<typeof credentialSchema>;
export type RunConfig = {
  phase: 'preflight' | 'acceptance'; candidateSha: string; manifest: FixtureManifest;
  manifestSha256: string; anonKey: string; actors: Record<ActorAlias, ActorCredential>;
};
export function validateFixture(text: string, expectedDigest: string, candidateSha: string, now = Date.now()): FixtureManifest {
  requireCondition(Buffer.byteLength(text) <= 1_048_576 && /^[a-f0-9]{64}$/.test(expectedDigest) && digest(text) === expectedDigest, 'FIXTURE_REVIEW_DIGEST_REQUIRED');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('FIXTURE_JSON_INVALID'); }
  const parsed = fixtureSchema.safeParse(value);
  requireCondition(parsed.success, 'FIXTURE_SCHEMA_INVALID');
  const fixture = parsed.data;
  requireCondition(fixture.candidateSha === candidateSha && Date.parse(fixture.expiresAt) > now, 'FIXTURE_SOURCE_OR_EXPIRY');
  requireCondition(new Set(fixture.organizations).size === 2 && new Set(fixture.projects.map(p => p.id)).size === 4
    && new Set(fixture.actors.map(a => a.id)).size === 7 && new Set(fixture.actors.map(a => a.alias)).size === 7, 'FIXTURE_DUPLICATE_IDENTITY');
  for (const org of fixture.organizations) requireCondition(fixture.projects.filter(p => p.orgId === org).length === 2, 'FIXTURE_PROJECT_MATRIX');
  for (const actor of fixture.actors) requireCondition(fixture.organizations.includes(actor.orgId), 'FIXTURE_ACTOR_ORG');
  for (const project of fixture.projects) requireCondition(fixture.actors.some(a => a.id === project.createdBy && a.orgId === project.orgId), 'FIXTURE_CREATOR');
  for (const entity of fixture.entities) requireCondition(fixture.projects.some(p => p.id === entity.projectId), 'FIXTURE_ENTITY_PROJECT');
  requireCondition(new Set(fixture.entities.map(e => e.id)).size === fixture.entities.length, 'FIXTURE_DUPLICATE_ENTITY');
  for (const source of fixture.storage) {
    const project = fixture.projects.find(p => p.id === source.projectId);
    requireCondition(project && source.path.startsWith(`${project.orgId}/uploads/${project.id}/`)
      && source.path.split('/').length === 4 && /^[A-Za-z0-9_-]+\.pdf$/.test(source.path.split('/')[3] ?? ''), 'FIXTURE_SOURCE_PATH');
  }
  if (fixture.fab) {
    requireCondition(fixture.fab.blockedDrawingId !== fixture.fab.cleanDrawingId, 'FAB_FIXTURE_DISTINCT_REQUIRED');
    for (const id of [fixture.fab.blockedDrawingId, fixture.fab.cleanDrawingId]) requireCondition(fixture.entities.some(e => e.table === 'drawings' && e.id === id && e.projectId === fixture.fab!.projectId), 'FAB_FIXTURE_BINDING');
  }
  return fixture;
}
export function validateCredentials(value: string | undefined, fixture: FixtureManifest): Record<ActorAlias, ActorCredential> {
  let raw: unknown;
  try { raw = JSON.parse(value ?? ''); } catch { throw new Error('ACTOR_CREDENTIALS_REQUIRED'); }
  const parsed = z.record(alias, credentialSchema).safeParse(raw);
  requireCondition(parsed.success, 'ACTOR_CREDENTIALS_REQUIRED');
  for (const actor of fixture.actors) {
    const credential = parsed.data[actor.alias];
    requireCondition(credential && digest(credential.email.toLowerCase()) === actor.emailSha256, 'ACTOR_CREDENTIAL_BINDING');
  }
  return parsed.data as Record<ActorAlias, ActorCredential>;
}

// Setup is a separate contract: none of these types proves drawing acceptance.
export const PRIVATE_PAYLOAD_LIMIT = 1_048_576;
const decimalId = z.string().regex(/^[1-9][0-9]{0,19}$/);
const sequence = z.number().int().min(0).max(999_999_999);
const label = z.string().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/);
const organizationAlias = z.enum(['A', 'B']);
const projectAlias = z.enum(['A1', 'A2', 'B1', 'B2']);
export const setupContextSchema = z.object({
  version: z.literal(1), projectRef: z.literal(STAGE_REF), candidateSha: z.string().regex(/^[a-f0-9]{40}$/), runId: uuid,
  workflowRunId: decimalId, workflowRunAttempt: decimalId, phase: z.enum(['setup-bootstrap', 'setup-complete']),
  checkpointSequence: sequence, recipientSha256: hash,
}).strict();
export type SetupContext = z.infer<typeof setupContextSchema>;
const artifactSchema = z.object({
  artifactId: decimalId, repository: z.literal('lorteezy87/SteelBuild-Pro-Rev.2'), workflow: z.literal('.github/workflows/drawing-cutover-staging.yml'),
  workflowRunId: decimalId, workflowRunAttempt: decimalId, candidateSha: z.string().regex(/^[a-f0-9]{40}$/), archiveSha256: hash, ciphertextSha256: hash,
}).strict();
export type ArtifactBinding = z.infer<typeof artifactSchema>;
const setupPlanSchema = z.object({
  context: setupContextSchema, createdAt: z.string().datetime(), expiresAt: z.string().datetime(),
  roster: z.array(z.object({ alias, email: z.string().email().max(254) }).strict()).length(7),
  organizations: z.array(z.object({ alias: organizationAlias, name: label, slug: z.string().min(1).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }).strict()).length(2),
  projects: z.array(z.object({ alias: projectAlias, organization: organizationAlias, name: label, number: label }).strict()).length(4),
  keyReview: z.object({ publicKeySha256: hash, setupKeySha256: hash, setupKeyIdentifier: label, ownerAttestationSha256: hash }).strict(),
  prerequisites: z.object({ scenarioSourceSha256: hash, sourceJobsSha256: hash, immutableBuildSha256: hash, packageSha256: hash,
    ownershipSha256: hash, sideEffectsSha256: hash, healthSha256: hash, noEmailSha256: hash, settingsAuthoritySha256: hash }).strict(),
  prior: z.object({ receiptSha256: hash, artifact: artifactSchema }).strict().optional(),
}).strict();
export type SetupPlan = z.infer<typeof setupPlanSchema>;
const operationIntentSchema = z.object({
  sequence, kind: z.literal('intent'), operationId: uuid,
  action: z.enum(['create-user', 'authenticate-user', 'create-organization', 'configure-organization', 'add-organization-member',
    'create-project', 'assign-project-role', 'enroll-mfa', 'verify-mfa']), actor: alias,
  organization: organizationAlias.optional(), project: projectAlias.optional(),
}).strict();
const operationResultSchema = z.object({ sequence, kind: z.literal('result'), operationId: uuid,
  outcome: z.enum(['SUCCEEDED', 'REJECTED', 'UNKNOWN']), observedId: uuid.optional() }).strict();
const receiptSchema = z.object({
  context: setupContextSchema, planSha256: hash,
  status: z.enum(['AWAITING_ENTITLEMENT_REVIEW', 'FOUNDATION_PREPARED', 'STOPPED', 'UNKNOWN_COMMIT_STATE']),
  operations: z.array(z.discriminatedUnion('kind', [operationIntentSchema, operationResultSchema])).max(100),
  actors: z.array(z.object({ alias, id: uuid, emailSha256: hash, authenticated: z.boolean(),
    mfa: z.object({ factorId: uuid, verified: z.literal(true) }).strict().optional() }).strict()).max(7),
  organizations: z.array(z.object({ alias: organizationAlias, id: uuid, createdBy: uuid, ownerId: uuid,
    memberDefaultProjectRole: z.null().optional() }).strict()).max(2),
  projects: z.array(z.object({ alias: projectAlias, id: uuid, orgId: uuid, createdBy: uuid }).strict()).max(4),
  memberships: z.array(z.object({ id: uuid, actor: alias, userId: uuid, orgId: uuid, projectId: uuid.optional(),
    role: z.enum(['owner', 'member', 'pm', 'viewer', 'field']) }).strict()).max(12),
}).strict();
export type FoundationReceipt = z.infer<typeof receiptSchema>;
const privateCredentialSchema = z.object({ alias, email: z.string().email().max(254), password: z.string().min(24).max(128),
  mfa: z.object({ factorId: uuid, secret: z.string().min(16).max(128).regex(/^[A-Z2-7]+$/) }).strict().optional() }).strict();
const recoveryPayloadSchema = z.object({ plan: setupPlanSchema, receipt: receiptSchema, credentials: z.array(privateCredentialSchema).length(7) }).strict();
export type PrivateRecoveryPayload = z.infer<typeof recoveryPayloadSchema>;
const resumeSchema = z.object({ context: setupContextSchema, planSha256: hash, recovery: recoveryPayloadSchema,
  artifact: artifactSchema, receiptSha256: hash, reviewedAt: z.string().datetime(), reviewSha256: hash,
  entitlements: z.array(z.object({ organization: organizationAlias, orgId: uuid, createdBy: uuid, plan: z.literal('pro'),
    observedAt: z.string().datetime(), readbackSha256: hash }).strict()).length(2),
}).strict();
export type SetupResume = z.infer<typeof resumeSchema>;

function strictValue<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
  const parsed = schema.safeParse(value);
  requireCondition(parsed.success, code); return parsed.data;
}
export function boundedJson(value: unknown, limit = PRIVATE_PAYLOAD_LIMIT): string {
  let raw: string | undefined;
  try { raw = JSON.stringify(value); } catch { throw new Error('PRIVATE_JSON_INVALID'); }
  requireCondition(raw !== undefined && Buffer.byteLength(raw) <= limit, 'PRIVATE_JSON_SIZE'); return raw;
}
function reviewedJson(raw: string, expectedDigest: string): unknown {
  requireCondition(Buffer.byteLength(raw) <= PRIVATE_PAYLOAD_LIMIT && hash.safeParse(expectedDigest).success && digest(raw) === expectedDigest, 'SETUP_REVIEW_DIGEST_REQUIRED');
  try {
    const value: unknown = JSON.parse(raw);
    // Compact JSON prevents whitespace/duplicate-key encodings from losing their
    // reviewed byte identity when the object is embedded in a recovery payload.
    requireCondition(JSON.stringify(value) === raw, 'SETUP_JSON_CANONICAL_REQUIRED'); return value;
  } catch { throw new Error('SETUP_JSON_INVALID'); }
}
export function canonicalSetupContext(value: unknown): string {
  const context = strictValue(setupContextSchema, value, 'SETUP_CONTEXT_INVALID');
  // Fixed order, fixed field set: never rely on caller insertion order for AAD.
  return JSON.stringify({ version: context.version, projectRef: context.projectRef, candidateSha: context.candidateSha,
    runId: context.runId, workflowRunId: context.workflowRunId, workflowRunAttempt: context.workflowRunAttempt,
    phase: context.phase, checkpointSequence: context.checkpointSequence, recipientSha256: context.recipientSha256 });
}
function sameExecution(actual: SetupContext, expected: SetupContext): void {
  requireCondition(canonicalSetupContext({ ...actual, checkpointSequence: expected.checkpointSequence }) === canonicalSetupContext(expected), 'SETUP_EXECUTION_MISMATCH');
}
function unique(values: string[]): boolean { return new Set(values).size === values.length; }
function planShape(value: unknown): SetupPlan {
  boundedJson(value); const plan = strictValue(setupPlanSchema, value, 'SETUP_PLAN_SCHEMA');
  requireCondition(plan.context.checkpointSequence === 0, 'SETUP_PLAN_INITIAL_CONTEXT');
  requireCondition(unique(plan.roster.map(a => a.alias)) && unique(plan.roster.map(a => a.email.toLowerCase())), 'SETUP_ROSTER_DUPLICATE');
  requireCondition(unique(plan.organizations.map(o => o.alias)) && unique(plan.organizations.map(o => o.name.toLowerCase()))
    && unique(plan.organizations.map(o => o.slug)), 'SETUP_ORGANIZATIONS_DUPLICATE');
  requireCondition(unique(plan.projects.map(p => p.alias)) && unique(plan.projects.map(p => p.name.toLowerCase()))
    && unique(plan.projects.map(p => p.number.toLowerCase())), 'SETUP_PROJECTS_DUPLICATE');
  const organizationFor = { A1: 'A', A2: 'A', B1: 'B', B2: 'B' } as const;
  for (const project of plan.projects) requireCondition(project.organization === organizationFor[project.alias], 'SETUP_PROJECT_MATRIX');
  const created = Date.parse(plan.createdAt); const expires = Date.parse(plan.expiresAt);
  requireCondition(created < expires && expires <= created + 86_400_000, 'SETUP_PLAN_LIFETIME');
  requireCondition((plan.context.phase === 'setup-complete') === Boolean(plan.prior), 'SETUP_PRIOR_BINDING');
  if (plan.prior) requireCondition(plan.prior.artifact.candidateSha === plan.context.candidateSha, 'SETUP_PRIOR_SOURCE');
  return value as SetupPlan;
}
export function validateSetupPlan(raw: string, expectedDigest: string, context: SetupContext, now = Date.now()): SetupPlan {
  const plan = planShape(reviewedJson(raw, expectedDigest));
  requireCondition(canonicalSetupContext(plan.context) === canonicalSetupContext(context), 'SETUP_PLAN_CONTEXT');
  requireCondition(Date.parse(plan.createdAt) <= now && now < Date.parse(plan.expiresAt), 'SETUP_PLAN_EXPIRY'); return plan;
}
export function validateArtifactBinding(value: unknown, independentlyVerifiedExpected: ArtifactBinding): ArtifactBinding {
  const actual = strictValue(artifactSchema, value, 'ARTIFACT_SCHEMA');
  const expected = strictValue(artifactSchema, independentlyVerifiedExpected, 'ARTIFACT_EXPECTED_REQUIRED');
  for (const key of Object.keys(expected) as (keyof ArtifactBinding)[]) requireCondition(actual[key] === expected[key], 'ARTIFACT_BINDING_MISMATCH');
  return actual;
}
export function validateFoundationReceipt(value: unknown, planValue: SetupPlan): FoundationReceipt {
  boundedJson(value); const plan = planShape(planValue); const receipt = strictValue(receiptSchema, value, 'RECEIPT_SCHEMA');
  sameExecution(receipt.context, plan.context);
  // The digest binds the exact reviewed plan serialization, not a reserialized schema projection.
  requireCondition(receipt.planSha256 === digest(boundedJson(planValue)), 'RECEIPT_PLAN_BINDING');
  requireCondition(receipt.context.checkpointSequence === receipt.operations.length, 'RECEIPT_SEQUENCE');
  let pending: z.infer<typeof operationIntentSchema> | undefined;
  const operationIds = new Set<string>(); let ambiguous = false; let rejected = false;
  const succeeded: { intent: z.infer<typeof operationIntentSchema>; observedId: string }[] = [];
  for (const [index, operation] of receipt.operations.entries()) {
    requireCondition(operation.sequence === index + 1 && !ambiguous && !rejected, 'RECEIPT_SEQUENCE');
    if (operation.kind === 'intent') {
      requireCondition(!pending && !operationIds.has(operation.operationId), 'RECEIPT_INTENT');
      operationIds.add(operation.operationId); pending = operation;
      requireCondition(receipt.context.phase === 'setup-bootstrap'
        ? ['create-user', 'authenticate-user', 'create-organization'].includes(operation.action)
        : !['create-user', 'create-organization'].includes(operation.action), 'RECEIPT_OPERATION_PHASE');
      if (['create-user', 'authenticate-user', 'enroll-mfa', 'verify-mfa'].includes(operation.action)) {
        requireCondition(!operation.organization && !operation.project, 'RECEIPT_OPERATION_SCOPE');
        if (operation.action.endsWith('mfa')) requireCondition(operation.actor === 'mfa', 'RECEIPT_MFA_ACTOR');
      } else {
        requireCondition(operation.organization !== undefined, 'RECEIPT_OPERATION_SCOPE');
        if (operation.project) requireCondition(plan.projects.some(p => p.alias === operation.project && p.organization === operation.organization), 'RECEIPT_OPERATION_SCOPE');
        requireCondition(['create-project', 'assign-project-role'].includes(operation.action) === Boolean(operation.project), 'RECEIPT_OPERATION_SCOPE');
        if (['create-organization', 'configure-organization', 'create-project'].includes(operation.action)) {
          requireCondition(operation.actor === (operation.organization === 'A' ? 'admin' : 'foreign'), 'RECEIPT_OPERATION_OWNER');
        } else requireCondition(operation.organization === 'A' && !['admin', 'foreign'].includes(operation.actor)
          && (operation.action !== 'assign-project-role' || operation.project === 'A1'), 'RECEIPT_OPERATION_MEMBER');
      }
    } else {
      requireCondition(pending && pending.operationId === operation.operationId, 'RECEIPT_RESULT_WITHOUT_INTENT');
      requireCondition(operation.outcome !== 'REJECTED' || !operation.observedId, 'RECEIPT_REJECTED_ID');
      if (operation.outcome === 'SUCCEEDED') {
        requireCondition(operation.observedId, 'RECEIPT_SUCCESS_ID_REQUIRED');
        succeeded.push({ intent: pending, observedId: operation.observedId });
      }
      ambiguous = operation.outcome === 'UNKNOWN'; rejected = operation.outcome === 'REJECTED'; pending = undefined;
    }
  }
  requireCondition(Boolean(pending || ambiguous) === (receipt.status === 'UNKNOWN_COMMIT_STATE'), 'RECEIPT_UNKNOWN_COMMIT_STATE');
  if (rejected) requireCondition(receipt.status === 'STOPPED', 'RECEIPT_KNOWN_REJECTION');
  requireCondition(unique(receipt.actors.map(a => a.alias)) && unique(receipt.actors.map(a => a.id))
    && unique(receipt.organizations.map(o => o.alias)) && unique(receipt.organizations.map(o => o.id))
    && unique(receipt.projects.map(p => p.alias)) && unique(receipt.projects.map(p => p.id))
    && unique(receipt.memberships.map(m => m.id)), 'RECEIPT_DUPLICATE_IDENTITY');
  for (const actor of receipt.actors) {
    requireCondition(actor.emailSha256 === digest(plan.roster.find(a => a.alias === actor.alias)!.email.toLowerCase()), 'RECEIPT_ACTOR_BINDING');
    requireCondition(!actor.mfa || (actor.alias === 'mfa' && actor.authenticated), 'RECEIPT_MFA_BINDING');
  }
  for (const org of receipt.organizations) {
    const owner = receipt.actors.find(a => a.alias === (org.alias === 'A' ? 'admin' : 'foreign'));
    requireCondition(owner?.authenticated && org.createdBy === owner.id && org.ownerId === owner.id, 'RECEIPT_ORG_CREATOR');
  }
  for (const project of receipt.projects) {
    const binding = plan.projects.find(p => p.alias === project.alias)!;
    const org = receipt.organizations.find(o => o.alias === binding.organization);
    requireCondition(org && project.orgId === org.id && project.createdBy === org.ownerId, 'RECEIPT_PROJECT_CREATOR');
  }
  const memberRoles = { pm: 'pm', viewer: 'viewer', field: 'field', removed: 'field', mfa: 'pm' } as const;
  const memberKeys: string[] = [];
  for (const member of receipt.memberships) {
    const actor = receipt.actors.find(a => a.alias === member.actor); const org = receipt.organizations.find(o => o.id === member.orgId);
    requireCondition(actor && actor.id === member.userId && org, 'RECEIPT_MEMBER_BINDING');
    memberKeys.push(`${member.userId}:${member.orgId}:${member.projectId ?? 'organization'}`);
    if (member.actor === 'admin' || member.actor === 'foreign') {
      requireCondition(!member.projectId && member.role === 'owner' && org.ownerId === member.userId, 'RECEIPT_OWNER_ROLE');
    } else {
      requireCondition(org.alias === 'A', 'RECEIPT_MEMBER_ORG');
      if (member.projectId) requireCondition(receipt.projects.some(p => p.alias === 'A1' && p.id === member.projectId) && member.role === memberRoles[member.actor], 'RECEIPT_PROJECT_ROLE');
      else requireCondition(member.role === 'member', 'RECEIPT_ORG_ROLE');
    }
  }
  requireCondition(unique(memberKeys), 'RECEIPT_DUPLICATE_MEMBERSHIP');
  const hasResult = (action: z.infer<typeof operationIntentSchema>['action'], actor: ActorAlias, observedId: string) =>
    succeeded.some(result => result.intent.action === action && result.intent.actor === actor && result.observedId === observedId);
  // A receipt cannot claim success merely by adding observed identities to arrays.
  // In complete, bootstrap actors/orgs are inherited and bound by validateSetupResume.
  if (receipt.context.phase === 'setup-bootstrap') {
    for (const actor of receipt.actors) {
      requireCondition(hasResult('create-user', actor.alias, actor.id), 'RECEIPT_ACTOR_RESULT');
      if (actor.authenticated) requireCondition(hasResult('authenticate-user', actor.alias, actor.id), 'RECEIPT_AUTH_RESULT');
    }
    for (const org of receipt.organizations) requireCondition(hasResult('create-organization', org.alias === 'A' ? 'admin' : 'foreign', org.id), 'RECEIPT_ORG_RESULT');
  }
  for (const result of succeeded) {
    const { action, actor, organization, project } = result.intent;
    if (action === 'create-user' || action === 'authenticate-user') requireCondition(receipt.actors.some(a => a.alias === actor && a.id === result.observedId
      && (action !== 'authenticate-user' || a.authenticated)), 'RECEIPT_ACTOR_RESULT');
    if (action === 'create-organization' || action === 'configure-organization') requireCondition(receipt.organizations.some(o => o.alias === organization && o.id === result.observedId
      && (action !== 'configure-organization' || o.memberDefaultProjectRole === null)), 'RECEIPT_ORG_RESULT');
    if (action === 'create-project') requireCondition(receipt.projects.some(p => p.alias === project && p.id === result.observedId), 'RECEIPT_PROJECT_RESULT');
    if (action === 'add-organization-member' || action === 'assign-project-role') requireCondition(receipt.memberships.some(m => m.actor === actor && m.id === result.observedId
      && Boolean(m.projectId) === (action === 'assign-project-role')), 'RECEIPT_MEMBERSHIP_RESULT');
    if (action === 'verify-mfa') requireCondition(receipt.actors.some(a => a.alias === 'mfa' && a.mfa?.factorId === result.observedId), 'RECEIPT_MFA_RESULT');
  }
  for (const project of receipt.projects) requireCondition(hasResult('create-project', project.alias.startsWith('A') ? 'admin' : 'foreign', project.id), 'RECEIPT_PROJECT_RESULT');
  for (const member of receipt.memberships.filter(m => m.role !== 'owner')) requireCondition(hasResult(member.projectId ? 'assign-project-role' : 'add-organization-member', member.actor, member.id), 'RECEIPT_MEMBERSHIP_RESULT');
  for (const actor of receipt.actors.filter(a => a.mfa)) requireCondition(hasResult('enroll-mfa', 'mfa', actor.mfa!.factorId) && hasResult('verify-mfa', 'mfa', actor.mfa!.factorId), 'RECEIPT_MFA_RESULT');
  if (receipt.status === 'AWAITING_ENTITLEMENT_REVIEW' || receipt.status === 'FOUNDATION_PREPARED') {
    requireCondition(receipt.actors.length === 7 && receipt.actors.every(a => a.authenticated) && receipt.organizations.length === 2, 'RECEIPT_FOUNDATION_INCOMPLETE');
    if (receipt.status === 'AWAITING_ENTITLEMENT_REVIEW') requireCondition(receipt.context.phase === 'setup-bootstrap'
      && receipt.projects.length === 0 && receipt.memberships.length === 2 && receipt.memberships.every(m => m.role === 'owner'), 'RECEIPT_BOOTSTRAP_INCOMPLETE');
    else requireCondition(receipt.context.phase === 'setup-complete' && receipt.projects.length === 4 && receipt.memberships.length === 12
      && receipt.organizations.every(o => o.memberDefaultProjectRole === null) && receipt.actors.some(a => a.alias === 'mfa' && a.mfa?.verified), 'RECEIPT_COMPLETE_INCOMPLETE');
  }
  return value as FoundationReceipt;
}
export function validatePrivateRecoveryPayload(value: unknown, context: SetupContext): PrivateRecoveryPayload {
  boundedJson(value); const parsed = strictValue(recoveryPayloadSchema, value, 'PRIVATE_RECOVERY_SCHEMA');
  // Preserve reviewed plan byte ordering for its digest when parsing an envelope.
  const raw = value as { plan: SetupPlan; receipt: FoundationReceipt };
  planShape(raw.plan); validateFoundationReceipt(raw.receipt, raw.plan);
  requireCondition(canonicalSetupContext(parsed.receipt.context) === canonicalSetupContext(context), 'PRIVATE_RECOVERY_CONTEXT');
  requireCondition(unique(parsed.credentials.map(c => c.alias)) && unique(parsed.credentials.map(c => c.password)), 'PRIVATE_CREDENTIAL_DUPLICATE');
  for (const credential of parsed.credentials) {
    requireCondition(parsed.plan.roster.some(a => a.alias === credential.alias && a.email === credential.email), 'PRIVATE_CREDENTIAL_BINDING');
    if (credential.mfa) {
      requireCondition(credential.alias === 'mfa', 'PRIVATE_MFA_BINDING');
      requireCondition(parsed.receipt.operations.some((operation, index) => operation.kind === 'intent' && operation.action === 'enroll-mfa'
        && operation.actor === 'mfa' && parsed.receipt.operations[index + 1]?.kind === 'result'
        && (parsed.receipt.operations[index + 1] as z.infer<typeof operationResultSchema>).outcome === 'SUCCEEDED'
        && (parsed.receipt.operations[index + 1] as z.infer<typeof operationResultSchema>).observedId === credential.mfa!.factorId), 'PRIVATE_MFA_BINDING');
      const observed = parsed.receipt.actors.find(a => a.alias === 'mfa')?.mfa;
      if (observed) requireCondition(observed.factorId === credential.mfa.factorId, 'PRIVATE_MFA_BINDING');
    }
  }
  // No clock check here: an expired checkpoint remains decryptable for recovery,
  // but cannot pass validateSetupPlan for execution without fresh review.
  return value as PrivateRecoveryPayload;
}
export function validateSetupResume(raw: string, expectedDigest: string, plan: SetupPlan, expectedArtifact: ArtifactBinding, now = Date.now()): SetupResume {
  const value = reviewedJson(raw, expectedDigest); const resume = strictValue(resumeSchema, value, 'SETUP_RESUME_SCHEMA');
  validateSetupPlan(boundedJson(plan), digest(boundedJson(plan)), plan.context, now);
  requireCondition(plan.context.phase === 'setup-complete' && plan.prior, 'SETUP_RESUME_PHASE');
  requireCondition(canonicalSetupContext(resume.context) === canonicalSetupContext(plan.context) && resume.planSha256 === digest(boundedJson(plan)), 'SETUP_RESUME_PLAN');
  const original = value as SetupResume;
  const prior = validatePrivateRecoveryPayload(original.recovery, original.recovery.receipt.context);
  const priorContext = prior.receipt.context;
  requireCondition(priorContext.phase === 'setup-bootstrap' && priorContext.runId === plan.context.runId && priorContext.candidateSha === plan.context.candidateSha
    && priorContext.recipientSha256 === plan.context.recipientSha256 && prior.receipt.status === 'AWAITING_ENTITLEMENT_REVIEW', 'SETUP_RESUME_BOOTSTRAP');
  requireCondition(priorContext.workflowRunId !== plan.context.workflowRunId || priorContext.workflowRunAttempt !== plan.context.workflowRunAttempt, 'SETUP_RESUME_EXECUTION');
  validateArtifactBinding(resume.artifact, expectedArtifact); validateArtifactBinding(resume.artifact, plan.prior.artifact);
  requireCondition(resume.artifact.workflowRunId === priorContext.workflowRunId && resume.artifact.workflowRunAttempt === priorContext.workflowRunAttempt
    && resume.artifact.candidateSha === priorContext.candidateSha, 'SETUP_RESUME_ARTIFACT_SOURCE');
  requireCondition(resume.receiptSha256 === digest(boundedJson(prior.receipt)) && resume.receiptSha256 === plan.prior.receiptSha256, 'SETUP_RESUME_RECEIPT');
  requireCondition(Date.parse(plan.createdAt) <= Date.parse(resume.reviewedAt) && Date.parse(resume.reviewedAt) <= now, 'SETUP_RESUME_REVIEW_TIME');
  requireCondition(unique(resume.entitlements.map(e => e.organization)) && unique(resume.entitlements.map(e => e.orgId)), 'SETUP_RESUME_ENTITLEMENTS');
  for (const entitlement of resume.entitlements) {
    const org = prior.receipt.organizations.find(o => o.alias === entitlement.organization);
    requireCondition(org && org.id === entitlement.orgId && org.createdBy === entitlement.createdBy
      && Date.parse(entitlement.observedAt) >= Date.parse(plan.createdAt) && Date.parse(entitlement.observedAt) <= Date.parse(resume.reviewedAt), 'SETUP_RESUME_ENTITLEMENT_BINDING');
  }
  requireCondition(JSON.stringify(plan.roster) === JSON.stringify(prior.plan.roster) && JSON.stringify(plan.organizations) === JSON.stringify(prior.plan.organizations)
    && JSON.stringify(plan.projects) === JSON.stringify(prior.plan.projects), 'SETUP_RESUME_ROSTER');
  return original;
}
