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
