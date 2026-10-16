#!/usr/bin/env node
/** Offline review only. No database client, credentials, SQL execution, or apply mode. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const STAGING = 'ndyfjffsulfbwpmwdmic';
const API_ROLES = ['anon', 'authenticated', 'service_role'];
const CORE_TABLES = ['public.drawings', 'public.drawing_sets', 'public.drawing_revisions'];
/** Frozen conservative Task 4 grant matrix; every other current/future column is protected. */
export const DRAWING_METADATA_UPDATES: Readonly<Record<string, readonly string[]>> = {
  'public.drawings': ['notes', 'reviewer', 'due_date', 'spec_section', 'priority_flag', 'fabrication_start_date',
    'fabrication_finish_date', 'ready_for_install_date', 'final_delivery_date', 'markup_scale', 'scale_status'],
  'public.drawing_sets': ['description', 'notes', 'due_date', 'eor_reviewer', 'area_sequence', 'material_impacted',
    'long_lead_impact', 'titleblock_title_rect', 'titleblock_number_rect', 'titleblock_revision_rect'],
  'public.drawing_revisions': [],
};
const COMMANDS = [
  { operation: 'create_set', signature: 'public.create_drawing_set_from_review(uuid,jsonb)', status: 'required' },
  { operation: 'revise_set', signature: 'public.apply_drawing_set_revision(uuid,jsonb)', status: 'required' },
  { operation: 'source_lookup', signature: 'public.get_drawing_revision_sources(uuid,text[])', status: 'required' },
  { operation: 'receipt_lookup', signature: 'public.get_drawing_command_receipt(uuid,text,jsonb)', status: 'required' },
  { operation: 'capabilities', signature: 'public.get_drawing_command_capabilities(uuid)', status: 'required' },
  { operation: 'workflow', signature: 'public.apply_submittal_round_workflow(uuid,uuid,timestamp with time zone,text,uuid,uuid[],jsonb,boolean)', status: 'preserve-reviewed' },
  { operation: 'reconcile_workflow_evidence', signature: 'public.reconcile_submittal_round_evidence(uuid,uuid,timestamp with time zone,text,uuid,uuid[],text)', status: 'preserve-reviewed' },
  { operation: 'publish', signature: 'public.publish_drawing_revision(uuid,text)', status: 'replace-preserving-signature' },
  { operation: 'place_hold', signature: 'public.place_drawing_hold(uuid,text)', status: 'replace-preserving-field-threshold' },
  { operation: 'release_hold', signature: 'public.release_drawing_hold(uuid,text)', status: 'replace-preserving-field-threshold' },
  { operation: 'lock', signature: 'public.set_drawing_set_lock(uuid,boolean,text,timestamp with time zone)', status: 'required' },
  { operation: 'archive_set', signature: 'public.delete_drawing_set(uuid)', status: 'hold-until-cascade-verified' },
  { operation: 'erase_record', signature: 'public.hard_delete_record(text,uuid,text)', status: 'preserve-erasure-owner-review' },
  { operation: 'erase_records', signature: 'public.hard_delete_records(text,uuid[],text)', status: 'preserve-erasure-owner-review' },
  { operation: 'erase_project', signature: 'public.hard_delete_project(uuid,text)', status: 'preserve-erasure-owner-review' },
  { operation: 'erase_organization', signature: 'public.hard_delete_organization(uuid,text)', status: 'preserve-erasure-owner-review' },
  { operation: 'reset_organization', signature: 'public.reset_org_data(uuid,text)', status: 'preserve-erasure-owner-review' },
  { operation: 'erase_account', signature: 'public.erase_my_account(text)', status: 'preserve-service-only-erasure' },
  { operation: 'erase_sole_member_workspaces', signature: 'public.erase_my_sole_member_workspaces(text)', status: 'preserve-erasure-owner-review' },
] as const;
export const DRAWING_CALLER_PATHS = [
  'src/api/client/entities.ts', 'src/lib/drawingHub/revisions.js', 'src/lib/drawingHub/proposals.js',
  'src/lib/drawingHub/setLock.js', 'src/pages/DrawingViewer.jsx', 'src/pages/drawingViewer/useZoneData.js',
  'src/components/drawings/RevisionCompareModal.jsx', 'src/components/drawings/DrawingLogImportModal.jsx',
  'src/components/drawings/TitleblockMarkerModal.jsx', 'src/components/drawings/BulkEditModal.jsx',
  'src/components/drawings/RenameSetModal.jsx', 'src/components/drawings/register/registerProvision.ts',
  'src/components/drawings/register/HoldsPanel.tsx', 'src/hooks/useDrawings.ts', 'src/hooks/usePublishRevision.ts',
  'src/pages/drawings/drawingMutationHelpers.ts', 'src/pages/drawings/useDrawingsPageController.ts',
  'src/components/drawings/upload/useDrawingSetCreation.js', 'src/components/drawings/RevisionUploadModal.jsx',
  'src/pages/DrawingSubmittalHub.tsx', 'src/components/drawings/viewer/useMarkup.js',
  'src/pages/drawingViewer/useAutoScaleOnLoad.js', 'supabase/functions/project-export/exportShape.ts',
  'supabase/functions/account-delete/index.ts', 'src/api/client/softDelete.ts',
] as const;
const SIBLING_PATHS = ['src/api/client/drawings.ts', 'src/api/client/drawingUploads.ts', 'src/api/client/drawingFiles.ts',
  'src/api/client/drawingSetRevisions.ts', 'src/api/client/titleBlock.ts', 'src/hooks/useDrawings.ts'];

const acl = z.array(z.object({ grantee: z.string().min(1), privilege: z.string().min(1) }).passthrough());
const privilege = z.object({ role: z.string(), insert: z.boolean(), update: z.boolean(), references: z.boolean() }).passthrough();
const hashed = z.object({ identity: z.string().min(1), definitionHash: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough();
const catalogSchema = z.object({
  schemaVersion: z.literal(1), capturedAt: z.string().datetime({ offset: true }), database: z.string().min(1), serverVersion: z.string().min(1),
  tables: z.array(z.object({ identity: z.string(), rls: z.boolean(), forceRls: z.boolean(), owner: z.string(), acl,
    privileges: z.array(privilege.extend({ delete: z.boolean(), truncate: z.boolean(), trigger: z.boolean() })) }).passthrough()),
  columns: z.array(z.object({ table: z.string(), name: z.string(), type: z.string(), default: z.string().nullable(),
    notNull: z.boolean(), identity: z.string(), generated: z.string(), acl, privileges: z.array(privilege) }).passthrough()),
  roles: z.array(z.object({ name: z.string(), inherits: z.boolean(), superuser: z.boolean(), bypassRls: z.boolean(),
    createRole: z.boolean(), createDb: z.boolean(), replication: z.boolean(), config: z.array(z.string()) })),
  roleMemberships: z.array(z.object({ member: z.string(), role: z.string(), inherit: z.boolean(), set: z.boolean() })),
  functions: z.array(hashed.extend({ schema: z.string(), name: z.string(), owner: z.string(), securityDefiner: z.boolean(), volatility: z.string(),
    returns: z.string().nullable(), sourceMentionsProtected: z.boolean(), hasMutationTokens: z.boolean(), dynamicSql: z.boolean(),
    calls: z.array(z.string()), config: z.array(z.string()), acl,
    privileges: z.array(z.object({ role: z.string(), execute: z.boolean(), schemaUsage: z.boolean() })) })),
  policies: z.array(hashed.extend({ table: z.string(), permissive: z.boolean(), command: z.string() })),
  triggers: z.array(hashed.extend({ table: z.string(), enabled: z.string(), function: z.string(), definition: z.string() })),
  constraints: z.array(hashed), indexes: z.array(hashed), views: z.array(hashed),
  schemas: z.array(z.object({ identity: z.string(), owner: z.string(), acl: z.string().nullable() })), defaultPrivileges: z.array(z.record(z.unknown())),
  settings: z.array(z.object({ database: z.string().nullable(), role: z.string().nullable(), config: z.array(z.string()) })),
  counts: z.record(z.number().int().nonnegative()),
});
const callerReview = z.object({ path: z.string(), decision: z.enum(['migrated', 'held', 'read-only', 'metadata-only', 'rpc-only']),
  evidence: z.string().min(12) });
const reviewSchema = z.object({
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), catalogSha256: z.string().regex(/^[a-f0-9]{64}$/),
  callers: z.array(callerReview), siblingCallers: z.array(callerReview.extend({ commit: z.string().regex(/^[a-f0-9]{40}$/) })),
  definitions: z.array(z.object({ identity: z.string(), definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(['approved-command', 'reviewed-non-drawing', 'internal-only']), evidence: z.string().min(12) })),
  guardBindings: z.array(z.object({ table: z.string(), triggerIdentity: z.string(), functionIdentity: z.string() })),
  // Explicit review evidence, never booleans inferred from object/function names.
  boundaryEvidence: z.string().min(12), sourceProtectionEvidence: z.string().min(12), erasureExportEvidence: z.string().min(12),
  storageEvidence: z.string().min(12), authEvidence: z.string().min(12),
});
const snapshotSchema = z.object({ projectRef: z.string(), capture: z.object({ transport: z.literal('supabase_execute_sql'), readOnly: z.literal(true) }),
  catalog: catalogSchema, review: z.unknown().optional() });
export type PreflightFinding = { code: string; identity?: string; detail: string };
export type PreflightReport = {
  target: { projectRef: string | null; expectedRef: string; capturedAt: string | null; originProof: 'operator-envelope-only' };
  readyForStaging: boolean; findings: PreflightFinding[];
  operationMatrix: { directUpdates: typeof DRAWING_METADATA_UPDATES; protectedColumns: Record<string, string[]>;
    commands: typeof COMMANDS; oldClientBehavior: string };
  privilegedWriters: { identity: string; definitionHash: string; classified: boolean }[];
  apiDeadlines: { role: string; statementTimeout: string | null }[];
};

export function validateDrawingCutoverPreflight(snapshot: unknown, expectedRef: string): PreflightReport {
  const report: PreflightReport = { target: { projectRef: null, expectedRef, capturedAt: null, originProof: 'operator-envelope-only' },
    readyForStaging: false, findings: [], privilegedWriters: [], apiDeadlines: [],
    operationMatrix: { directUpdates: DRAWING_METADATA_UPDATES, protectedColumns: {}, commands: COMMANDS,
      oldClientBehavior: 'Deny protected INSERT/UPSERT/PATCH/DELETE/TRUNCATE; require reviewed commands. Never fall back to split writes.' } };
  const finding = (code: string, detail: string, identity?: string) => report.findings.push({ code, detail, ...(identity ? { identity } : {}) });
  if (expectedRef !== STAGING) finding('STAGING_TARGET_REQUIRED', 'Only the fixed staging ref may be ready; production remains read-only.');
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) { finding('INCOMPLETE_SNAPSHOT', 'Missing or malformed catalog/capture fields.'); return report; }
  const { catalog, projectRef } = parsed.data;
  report.target.projectRef = projectRef; report.target.capturedAt = catalog.capturedAt;
  if (projectRef !== expectedRef) finding('TARGET_MISMATCH', 'Capture target does not match the independently supplied expected ref.');
  if (projectRef !== STAGING) finding('STAGING_TARGET_REQUIRED', 'Production/unknown projects cannot become staging by relabeling expectedRef.');
  const seen = new Set<string>();
  for (const [key, rows] of Object.entries(catalog)) if (Array.isArray(rows)) {
    if (catalog.counts[key] !== rows.length) finding('INCOMPLETE_SNAPSHOT', `Catalog count mismatch: ${key}.`);
  }
  for (const key of ['policies', 'triggers', 'constraints', 'indexes', 'schemas'] as const)
    if (!catalog[key].length) finding('INCOMPLETE_SNAPSHOT', `Required catalog section is empty: ${key}.`);
  for (const table of catalog.tables) {
    if (seen.has(table.identity)) finding('INCOMPLETE_SNAPSHOT', 'Duplicate table identity.', table.identity);
    seen.add(table.identity);
    for (const role of API_ROLES) if (!table.privileges.some(p => p.role === role)) finding('INCOMPLETE_SNAPSHOT', `Missing effective table privileges for ${role}.`, table.identity);
  }
  for (const table of CORE_TABLES) {
    const relation = catalog.tables.find(row => row.identity === table);
    if (!relation || !relation.rls) finding('INCOMPLETE_SNAPSHOT', 'Required table/RLS missing.', table);
    const columns = catalog.columns.filter(c => c.table === table);
    const names = columns.map(c => c.name);
    const required = ['id', 'project_id', 'file_url', ...(table === 'public.drawings'
      ? ['drawing_set_id', 'pdf_page', 'revision_number', 'sheet_number', 'title']
      : table === 'public.drawing_sets' ? ['set_name', 'revision'] : ['drawing_id', 'pdf_page', 'revision_code', 'is_current', 'release_status'])];
    if ([...required, ...DRAWING_METADATA_UPDATES[table]].some(name => !names.includes(name)) || new Set(names).size !== names.length)
      finding('INCOMPLETE_SNAPSHOT', 'Required columns missing or duplicated.', table);
    report.operationMatrix.protectedColumns[table] = names.filter(name => !DRAWING_METADATA_UPDATES[table].includes(name)).sort();
  }
  // Include NOINHERIT but SET-able memberships conservatively: they must not provide a bypass either.
  const accessible = new Set(['PUBLIC', ...API_ROLES]);
  let changed = true;
  while (changed) { changed = false; for (const m of catalog.roleMemberships) if (accessible.has(m.member)
    && (m.inherit || m.set) && !accessible.has(m.role)) { accessible.add(m.role); changed = true; } }
  // ACL revocation does not remove an owner's ALTER/GRANT authority. Keep each
  // API principal separate so anon/authenticated cannot inherit service_role's
  // intentional platform bypass exception through a SET-able membership.
  for (const root of API_ROLES) {
    const reachable = new Set([root]);
    changed = true;
    while (changed) { changed = false; for (const m of catalog.roleMemberships) if (reachable.has(m.member)
      && (m.inherit || m.set) && !reachable.has(m.role)) { reachable.add(m.role); changed = true; } }
    for (const role of reachable) {
      const entry = catalog.roles.find(r => r.name === role);
      if (!entry) finding('INCOMPLETE_SNAPSHOT', `Missing reachable role attributes for ${root}.`, role);
      else if (entry.superuser || entry.createRole || entry.createDb || entry.replication
        || (entry.bypassRls && !(root === 'service_role' && role === 'service_role')))
        finding('API_REACHABLE_ROLE_UNSAFE', `${root} can reach a role with administrative or RLS-bypass attributes.`, role);
    }
    for (const owned of [...catalog.tables, ...catalog.schemas, ...catalog.functions]) if (reachable.has(owned.owner))
      finding('API_REACHABLE_OWNER', `${root} can reach owner ${owned.owner}; revoked DML/EXECUTE ACLs do not remove ownership authority.`, owned.identity);
  }
  for (const table of catalog.tables.filter(t => CORE_TABLES.includes(t.identity) || t.identity.startsWith('steelbuild_drawing_revision.'))) {
    if (table.privileges.some(p => API_ROLES.includes(p.role) && (p.insert || p.update || p.delete || p.truncate || p.trigger || p.references))
      || table.acl.some(a => accessible.has(a.grantee) && ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'].includes(a.privilege)))
      finding('DIRECT_TABLE_WRITE', 'Effective or PUBLIC/inherited table privilege bypasses the column/command boundary.', table.identity);
  }
  for (const column of catalog.columns.filter(c => CORE_TABLES.includes(c.table) || c.table.startsWith('steelbuild_drawing_revision.'))) {
    const permitted = DRAWING_METADATA_UPDATES[column.table]?.includes(column.name) ?? false;
    for (const role of API_ROLES) if (!column.privileges.some(p => p.role === role)) finding('INCOMPLETE_SNAPSHOT', `Missing effective column privilege for ${role}.`, `${column.table}.${column.name}`);
    if (column.privileges.some(p => API_ROLES.includes(p.role) && (p.insert || p.references || (p.update && (!permitted || p.role !== 'authenticated'))))
      || column.acl.some(a => accessible.has(a.grantee) && (['INSERT','REFERENCES'].includes(a.privilege)
        || (a.privilege === 'UPDATE' && (!permitted || a.grantee !== 'authenticated')))))
      finding('PROTECTED_COLUMN_WRITE', 'Protected column is writable through a direct, PUBLIC or inherited privilege.', `${column.table}.${column.name}`);
  }
  const effectiveSetting = (role: string, key: string): string | null => {
    const prefix = `${key}=`;
    const configValue = (config: readonly string[]) => config.find(v => v.startsWith(prefix))?.slice(prefix.length);
    const scoped = (database: string | null, principal: string | null) => configValue(catalog.settings
      .find(s => s.database === database && s.role === principal)?.config ?? []);
    // PostgreSQL precedence: database < role < database-and-role. Preserve an
    // explicit empty value; it disables a pre-request hook rather than falling back.
    return scoped(catalog.database, role) ?? scoped(null, role)
      ?? configValue(catalog.roles.find(r => r.name === role)?.config ?? [])
      ?? scoped(catalog.database, null) ?? null;
  };
  for (const role of ['anon', 'authenticated', 'authenticator']) {
    const entry = catalog.roles.find(r => r.name === role);
    const timeout = effectiveSetting(role, 'statement_timeout');
    report.apiDeadlines.push({ role, statementTimeout: timeout });
    if (!entry || entry.superuser || entry.bypassRls) finding('API_ROLE_UNSAFE', 'API role missing or bypasses RLS.', role);
    if (!timeout || !/^(?:\d+(?:\.\d+)?)(?:ms|s|min|h|d)?$/.test(timeout) || Number.parseFloat(timeout) <= 0)
      finding('API_DEADLINE_UNBOUNDED', 'Missing/unbounded installed API deadline; no shared role setting may be changed implicitly.', role);
  }
  if (effectiveSetting('authenticator', 'pgrst.db_pre_request') !== 'steelbuild_security.check_request_mfa')
    finding('MFA_HOOK_UNREVIEWED', 'Expected installed PostgREST MFA hook is absent.');
  const reviewResult = reviewSchema.safeParse(parsed.data.review);
  const review = reviewResult.success ? reviewResult.data : null;
  if (!review) finding('SOURCE_REVIEW_REQUIRED', 'Complete source, definition, Storage, Auth, export/erasure and caller review is required.');
  // Hash the captured serialization, not Zod's reconstructed property order.
  const hash = createHash('sha256').update(JSON.stringify((snapshot as { catalog: unknown }).catalog)).digest('hex');
  if (review && review.catalogSha256 !== hash) finding('CATALOG_DRIFT', 'Review fingerprint does not match this exact catalog serialization.');
  const approved = (identity: string, definitionHash: string, decision?: string) => review?.definitions.some(d =>
    d.identity === identity && d.definitionHash === definitionHash && (!decision || d.decision === decision)) ?? false;
  const canonicalSignature = (signature: string) => signature.replace(/,\s*/g, ',');
  const guardQueue = [...catalog.triggers.map(t => t.function), 'steelbuild_security.check_request_mfa()'];
  const checkedGuards = new Set<string>();
  while (guardQueue.length) {
    const identity = guardQueue.pop()!;
    const key = canonicalSignature(identity);
    if (checkedGuards.has(key)) continue;
    checkedGuards.add(key);
    const guard = catalog.functions.find(f => canonicalSignature(f.identity) === key);
    if (!guard) { finding('GUARD_FUNCTION_MISSING', 'A captured guard or helper dependency has no captured function body/hash.', identity); continue; }
    if (!approved(guard.identity, guard.definitionHash))
      finding('GUARD_FUNCTION_NOT_REVIEWED', 'Guard/helper implementation requires approval for this exact definition hash.', guard.identity);
    guardQueue.push(...guard.calls);
  }
  // Volatile definers can dispatch through helpers/extensions without recognizable DML.
  // Classify all callable ones conservatively, not only names or bodies that mention drawings.
  const dangerous = new Set(catalog.functions.filter(f => f.volatility === 'v' || f.dynamicSql
    || (f.sourceMentionsProtected && f.hasMutationTokens)).map(f => f.identity));
  changed = true;
  while (changed) { changed = false; for (const f of catalog.functions) if (!dangerous.has(f.identity)
    && f.calls.some(c => dangerous.has(c))) { dangerous.add(f.identity); changed = true; } }
  for (const f of catalog.functions) {
    for (const role of API_ROLES) if (!f.privileges.some(p => p.role === role))
      finding('INCOMPLETE_SNAPSHOT', `Missing effective function privileges for ${role}.`, f.identity);
    if (f.config.some(v => v.startsWith('statement_timeout=') && Number.parseFloat(v.slice('statement_timeout='.length)) === 0))
      finding('COMMAND_DEADLINE_UNBOUNDED', 'A function overrides its installed API deadline with an unbounded timeout.', f.identity);
    if (!f.securityDefiner || !dangerous.has(f.identity) || f.returns === 'trigger' || f.returns === 'event_trigger') continue;
    const callable = f.privileges.some(p => accessible.has(p.role) && p.execute && p.schemaUsage)
      || f.acl.some(a => accessible.has(a.grantee) && a.privilege === 'EXECUTE');
    if (!callable) continue;
    const classified = approved(f.identity, f.definitionHash);
    report.privilegedWriters.push({ identity: f.identity, definitionHash: f.definitionHash, classified });
    if (!classified) finding('UNCLASSIFIED_DEFINER_WRITER', 'Callable privileged mutation/dynamic or transitive path needs exact-hash source/ownership review; do not revoke it broadly.', f.identity);
    if (approved(f.identity, f.definitionHash, 'internal-only'))
      finding('INTERNAL_WRITER_CALLABLE', 'A reviewed internal helper still has API/PUBLIC/inherited EXECUTE.', f.identity);
    if (!f.config.some(v => v.startsWith('search_path='))) finding('DEFINER_SEARCH_PATH', 'Callable privileged writer has no fixed search_path.', f.identity);
  }
  for (const command of COMMANDS) {
    const installed = catalog.functions.find(f => canonicalSignature(f.identity) === canonicalSignature(command.signature));
    if (!installed || !approved(installed.identity, installed.definitionHash, 'approved-command'))
      finding('COMMAND_NOT_REVIEWED', 'Required exact command definition has not been reviewed as installed.', command.signature);
  }
  for (const identity of ['steelbuild_drawing_revision.requests', 'steelbuild_drawing_revision.source_observations'])
    if (!catalog.tables.some(t => t.identity === identity)) finding('SOURCE_PROTECTION_MISSING', 'Private receipt/source observations are not installed.', identity);
  for (const definition of [...catalog.policies, ...catalog.triggers, ...catalog.views, ...catalog.indexes, ...catalog.constraints]) {
    if (!approved(definition.identity, definition.definitionHash)) finding('DEFINITION_NOT_REVIEWED', 'Policy/trigger/view hash needs explicit review, including restrictive policies and source-bound callers.', definition.identity);
  }
  for (const table of CORE_TABLES) {
    const bindings = review?.guardBindings.filter(b => b.table === table) ?? [];
    if (!bindings.length || bindings.some(binding => !catalog.triggers.some(t => t.table === table
      && t.identity === binding.triggerIdentity && ['O','A'].includes(t.enabled)
      && canonicalSignature(t.function) === canonicalSignature(binding.functionIdentity))))
      finding('SOURCE_GUARD_BINDING_MISSING', 'The exact reviewed source-guard declaration/function binding must be present and enabled; an arbitrary trigger is insufficient.', table);
  }
  for (const path of DRAWING_CALLER_PATHS) if (!review?.callers.some(c => c.path === path)) finding('CALLER_UNRESOLVED', 'Runtime writer/consumer must be migrated, read-only, metadata-only, RPC-only or explicitly held.', path);
  if (SIBLING_PATHS.some(path => !review?.siblingCallers.some(c => c.path === path)))
    finding('SIBLING_CALLERS_UNRESOLVED', 'Pinned sibling split writers require a coordinated caller/owner decision; names/hashes never imply compatibility.');
  report.readyForStaging = report.findings.length === 0;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.some(arg => arg.startsWith('--'))) {
    console.error('Usage: node --experimental-strip-types scripts/drawing-cutover-preflight.ts <saved-catalog.json> <expected-ref>');
    process.exitCode = 2;
  } else {
    try {
      const report = validateDrawingCutoverPreflight(JSON.parse(readFileSync(args[0], 'utf8')), args[1]);
      console.log(JSON.stringify(report, null, 2)); process.exitCode = report.readyForStaging ? 0 : 1;
    } catch { console.error('Unable to read or parse the saved catalog JSON.'); process.exitCode = 2; }
  }
}
