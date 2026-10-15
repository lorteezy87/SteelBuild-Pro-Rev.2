import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateDrawingCutoverPreflight } from '../drawing-cutover-preflight.js';

const STAGING = 'ndyfjffsulfbwpmwdmic';
const PRODUCTION = 'kjrwqagyeswwoxpjkcko';
const HASH = 'a'.repeat(64);
const permissions = () => ['anon', 'authenticated', 'service_role'].map(role => ({
  role, insert: false, update: false, delete: false, truncate: false, trigger: false, references: false,
}));

// Synthetic catalog, never presented as hosted acceptance. No fixture/network dependency.
function snapshot() {
  const catalog = {
    schemaVersion: 1, capturedAt: '2026-10-15T12:00:00Z', database: 'postgres', serverVersion: '17.6',
    tables: ['public.drawings', 'public.drawing_sets', 'public.drawing_revisions'].map(identity => ({
      identity, rls: true, forceRls: false, owner: 'postgres', acl: [], privileges: permissions(),
    })),
    columns: [
      ...['id', 'project_id', 'drawing_set_id', 'file_url', 'pdf_page', 'revision_number', 'sheet_number', 'title',
        'notes', 'reviewer', 'due_date', 'spec_section', 'priority_flag', 'fabrication_start_date',
        'fabrication_finish_date', 'ready_for_install_date', 'final_delivery_date', 'markup_scale', 'scale_status']
        .map(name => ({ table: 'public.drawings', name, type: 'text', default: null, notNull: false,
          identity: '', generated: '', acl: [], privileges: permissions().map(p => ({ ...p,
            update: p.role === 'authenticated' && ['notes', 'reviewer', 'due_date', 'spec_section', 'priority_flag',
              'fabrication_start_date', 'fabrication_finish_date', 'ready_for_install_date', 'final_delivery_date',
              'markup_scale', 'scale_status'].includes(name),
          })) })),
      ...['id', 'project_id', 'set_name', 'file_url', 'revision', 'description', 'notes', 'due_date', 'eor_reviewer',
        'area_sequence', 'material_impacted', 'long_lead_impact', 'titleblock_title_rect', 'titleblock_number_rect',
        'titleblock_revision_rect'].map(name => ({ table: 'public.drawing_sets', name, type: 'text', default: null,
        notNull: false, identity: '', generated: '', acl: [], privileges: permissions().map(p => ({ ...p,
          update: p.role === 'authenticated' && !['id', 'project_id', 'set_name', 'file_url', 'revision'].includes(name),
        })) })),
      ...['id', 'project_id', 'drawing_id', 'file_url', 'pdf_page', 'revision_code', 'is_current', 'release_status']
        .map(name => ({ table: 'public.drawing_revisions', name, type: 'text', default: null, notNull: false,
          identity: '', generated: '', acl: [], privileges: permissions() })),
    ],
    roles: ['anon', 'authenticated', 'service_role', 'authenticator'].map(name => ({
      name, superuser: false, bypassRls: name === 'service_role', inherits: true,
      createRole: false, createDb: false, replication: false,
      config: ['statement_timeout=8s', ...(name === 'authenticator'
        ? ['pgrst.db_pre_request=steelbuild_security.check_request_mfa'] : [])],
    })),
    roleMemberships: [] as { member: string; role: string; inherit: boolean; set: boolean }[],
    functions: [{ identity: 'public.rogue_writer()', definitionHash: HASH, schema: 'public', name: 'rogue_writer',
      owner: 'postgres',
      securityDefiner: true, volatility: 'v', returns: 'void', sourceMentionsProtected: true,
      hasMutationTokens: true, dynamicSql: false, calls: [] as string[], config: ['search_path=public'], acl: [],
      privileges: ['anon', 'authenticated', 'service_role'].map(role => ({ role, execute: role === 'authenticated', schemaUsage: true })) }],
    policies: [], triggers: [], indexes: [], constraints: [], views: [], schemas: [], defaultPrivileges: [], settings: [],
    counts: {} as Record<string, number>,
  };
  for (const [key, rows] of Object.entries(catalog)) if (Array.isArray(rows)) catalog.counts[key] = rows.length;
  return { projectRef: STAGING, capture: { transport: 'supabase_execute_sql', readOnly: true }, catalog };
}

describe('drawing cutover preflight', () => {
  it('rejectsProductionAsStaging', () => {
    const input = snapshot(); input.projectRef = PRODUCTION;
    const report = validateDrawingCutoverPreflight(input, STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'TARGET_MISMATCH')).toBe(true);
    expect(validateDrawingCutoverPreflight(input, PRODUCTION).readyForStaging).toBe(false);
  });

  it('rejectsInheritedProtectedWrite', () => {
    const input = snapshot();
    input.catalog.roleMemberships.push({ member: 'authenticated', role: 'legacy_writer', inherit: true, set: true });
    input.catalog.counts.roleMemberships = 1;
    input.catalog.columns.find(c => c.table === 'public.drawings' && c.name === 'file_url')!.acl
      .push({ grantee: 'legacy_writer', privilege: 'UPDATE' } as never);
    const report = validateDrawingCutoverPreflight(input, STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'PROTECTED_COLUMN_WRITE' && f.identity === 'public.drawings.file_url')).toBe(true);
  });

  it('rejectsUnclassifiedDefinerWriter', () => {
    const report = validateDrawingCutoverPreflight(snapshot(), STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'UNCLASSIFIED_DEFINER_WRITER' && f.identity === 'public.rogue_writer()')).toBe(true);
  });

  it.each([undefined, null, {}, [], { projectRef: STAGING }, { projectRef: STAGING, catalog: {} }])(
    'rejects empty or partial snapshot %j', input => {
      const report = validateDrawingCutoverPreflight(input, STAGING);
      expect(report.readyForStaging).toBe(false);
      expect(report.findings.some(f => f.code === 'INCOMPLETE_SNAPSHOT')).toBe(true);
    });

  it('detects truncated catalogs even when the needed row remains', () => {
    const input = snapshot(); input.catalog.counts.columns++;
    expect(validateDrawingCutoverPreflight(input, STAGING).findings.some(f => f.code === 'INCOMPLETE_SNAPSHOT')).toBe(true);
  });

  it('reports missing or unbounded API deadline independently of management SQL deadline', () => {
    const input = snapshot();
    input.catalog.roles.find(r => r.name === 'authenticated')!.config = ['statement_timeout=0'];
    const report = validateDrawingCutoverPreflight(input, STAGING);
    expect(report.findings.some(f => f.code === 'API_DEADLINE_UNBOUNDED' && f.identity === 'authenticated')).toBe(true);
  });

  it('denies PUBLIC TRUNCATE even with no authenticated direct ACL', () => {
    const input = snapshot();
    input.catalog.tables[0].acl.push({ grantee: 'PUBLIC', privilege: 'TRUNCATE' } as never);
    const report = validateDrawingCutoverPreflight(input, STAGING);
    expect(report.findings.some(f => f.code === 'DIRECT_TABLE_WRITE')).toBe(true);
  });

  it('does not mistake a definer wrapper with no direct DML for a read-only function', () => {
    const input = snapshot();
    input.catalog.functions.push({ ...input.catalog.functions[0], identity: 'public.wrapper()', name: 'wrapper',
      sourceMentionsProtected: false, hasMutationTokens: false, calls: ['public.rogue_writer()'] });
    input.catalog.counts.functions++;
    const report = validateDrawingCutoverPreflight(input, STAGING);
    expect(report.findings.some(f => f.code === 'UNCLASSIFIED_DEFINER_WRITER' && f.identity === 'public.wrapper()')).toBe(true);
  });

  it('returns the conservative matrix and protects unknown schema additions', () => {
    const input = snapshot();
    input.catalog.columns.push({ ...input.catalog.columns[0], name: 'new_authority', acl: [], privileges: permissions() });
    input.catalog.counts.columns++;
    const report = validateDrawingCutoverPreflight(input, STAGING);
    expect(report.operationMatrix.directUpdates['public.drawings']).toContain('markup_scale');
    expect(report.operationMatrix.directUpdates['public.drawings']).not.toContain('metadata');
    expect(report.operationMatrix.protectedColumns['public.drawings']).toContain('new_authority');
    expect(report.operationMatrix.protectedColumns['public.drawings']).toContain('file_url');
    expect(report.operationMatrix.commands.find(c => c.operation === 'lock')?.signature)
      .toBe('public.set_drawing_set_lock(uuid,boolean,text,timestamp with time zone)');
    expect(report.findings.some(f => f.code === 'SIBLING_CALLERS_UNRESOLVED')).toBe(true);
  });

  it('rejects a malformed row without throwing or trusting truthy strings', () => {
    const input = snapshot(); input.catalog.tables[0].rls = 'false' as never;
    expect(validateDrawingCutoverPreflight(input, STAGING).findings.some(f => f.code === 'INCOMPLETE_SNAPSHOT')).toBe(true);
  });
  it('includes the existing erasure and reset operations with their exact argument types', () => {
    const commands = validateDrawingCutoverPreflight(snapshot(), STAGING).operationMatrix.commands;
    expect(commands.find(c => c.operation === 'erase_records')?.signature).toBe('public.hard_delete_records(text,uuid[],text)');
    expect(commands.find(c => c.operation === 'reset_organization')?.signature).toBe('public.reset_org_data(uuid,text)');
    expect(commands.find(c => c.operation === 'erase_account')?.signature).toBe('public.erase_my_account(text)');
    expect(commands.find(c => c.operation === 'reconcile_workflow_evidence')?.signature)
      .toBe('public.reconcile_submittal_round_evidence(uuid,uuid,timestamp with time zone,text,uuid,uuid[],text)');
  });
});

// A declared fully reviewed package permits readiness; this prevents an always-false validator.
// These generated hashes identify synthetic definitions only, never deployed SQL.
function reviewedSnapshot() {
  const input = snapshot();
  input.catalog.functions = [
    'create_drawing_set_from_review(uuid, jsonb)', 'apply_drawing_set_revision(uuid, jsonb)',
    'get_drawing_revision_sources(uuid, text[])', 'get_drawing_command_receipt(uuid, text, jsonb)',
    'get_drawing_command_capabilities(uuid)',
    'apply_submittal_round_workflow(uuid, uuid, timestamp with time zone, text, uuid, uuid[], jsonb, boolean)',
    'publish_drawing_revision(uuid, text)', 'place_drawing_hold(uuid, text)', 'release_drawing_hold(uuid, text)',
    'set_drawing_set_lock(uuid, boolean, text, timestamp with time zone)', 'delete_drawing_set(uuid)',
    'hard_delete_record(text, uuid, text)', 'hard_delete_records(text, uuid[], text)', 'hard_delete_project(uuid, text)',
    'hard_delete_organization(uuid, text)', 'reset_org_data(uuid, text)', 'erase_my_account(text)', 'erase_my_sole_member_workspaces(text)',
    'reconcile_submittal_round_evidence(uuid, uuid, timestamp with time zone, text, uuid, uuid[], text)',
  ].map(signature => ({ ...input.catalog.functions[0], identity: `public.${signature}`, name: signature.split('(')[0] }));
  input.catalog.functions.push(...[
    { identity: 'private.guard()', name: 'guard', returns: 'trigger', calls: ['private.guard_helper()'] },
    { identity: 'private.guard_helper()', name: 'guard_helper', returns: 'boolean', calls: [] },
    { identity: 'steelbuild_security.check_request_mfa()', name: 'check_request_mfa', returns: 'void', calls: ['steelbuild_security.satisfies_mfa()'] },
    { identity: 'steelbuild_security.satisfies_mfa()', name: 'satisfies_mfa', returns: 'boolean', calls: [] },
  ].map(fields => ({ ...input.catalog.functions[0], ...fields, schema: fields.identity.split('.')[0], volatility: 's',
    privileges: ['anon', 'authenticated', 'service_role'].map(role => ({ role, execute: false, schemaUsage: false })) })));
  input.catalog.tables.push(...['steelbuild_drawing_revision.requests', 'steelbuild_drawing_revision.source_observations']
    .map(identity => ({ ...input.catalog.tables[0], identity, privileges: permissions() })));
  const record = (identity: string) => ({ identity, definitionHash: HASH });
  Object.assign(input.catalog, {
    triggers: ['public.drawings', 'public.drawing_sets', 'public.drawing_revisions'].map(table => ({
      ...record(`${table}.boundary`), table, enabled: 'O', function: 'private.guard()', definition: 'BEFORE UPDATE guard',
    })),
    policies: [{ ...record('storage.objects.source_protection'), table: 'storage.objects', permissive: false, command: '*' }],
    constraints: [record('public.drawings.source_check')], indexes: [record('public.drawings.source_unique')],
    schemas: [{ identity: 'public', owner: 'postgres', acl: null }, { identity: 'private', owner: 'postgres', acl: null }],
  });
  for (const [key, rows] of Object.entries(input.catalog)) if (Array.isArray(rows)) input.catalog.counts[key] = rows.length;
  const paths = ['src/api/client/entities.ts', 'src/lib/drawingHub/revisions.js', 'src/lib/drawingHub/proposals.js',
    'src/lib/drawingHub/setLock.js', 'src/pages/DrawingViewer.jsx', 'src/pages/drawingViewer/useZoneData.js',
    'src/components/drawings/RevisionCompareModal.jsx', 'src/components/drawings/DrawingLogImportModal.jsx',
    'src/components/drawings/TitleblockMarkerModal.jsx', 'src/components/drawings/BulkEditModal.jsx',
    'src/components/drawings/RenameSetModal.jsx', 'src/components/drawings/register/registerProvision.ts',
    'src/components/drawings/register/HoldsPanel.tsx', 'src/hooks/useDrawings.ts', 'src/hooks/usePublishRevision.ts',
    'src/pages/drawings/drawingMutationHelpers.ts', 'src/pages/drawings/useDrawingsPageController.ts',
    'src/components/drawings/upload/useDrawingSetCreation.js', 'src/components/drawings/RevisionUploadModal.jsx',
    'src/pages/DrawingSubmittalHub.tsx', 'src/components/drawings/viewer/useMarkup.js',
    'src/pages/drawingViewer/useAutoScaleOnLoad.js', 'supabase/functions/project-export/exportShape.ts',
    'supabase/functions/account-delete/index.ts', 'src/api/client/softDelete.ts'];
  return { ...input, review: {
    sourceCommit: 'b'.repeat(40), catalogSha256: createHash('sha256').update(JSON.stringify(input.catalog)).digest('hex'),
    callers: paths.map(path => ({ path, decision: 'held', evidence: 'Synthetic reviewed caller fixture' })),
    siblingCallers: ['src/api/client/drawings.ts', 'src/api/client/drawingUploads.ts', 'src/api/client/drawingFiles.ts',
      'src/api/client/drawingSetRevisions.ts', 'src/api/client/titleBlock.ts', 'src/hooks/useDrawings.ts']
      .map(path => ({ path, commit: 'c'.repeat(40), decision: 'held', evidence: 'Synthetic coordinated caller hold' })),
    definitions: [...input.catalog.functions, ...input.catalog.triggers, ...input.catalog.policies,
      ...input.catalog.indexes, ...input.catalog.constraints].map(d => ({ identity: (d as { identity: string }).identity,
      definitionHash: HASH, decision: 'approved-command', evidence: 'Synthetic reviewed definition fixture' })),
    guardBindings: ['public.drawings', 'public.drawing_sets', 'public.drawing_revisions'].map(table => ({
      table, triggerIdentity: `${table}.boundary`, functionIdentity: 'private.guard()',
    })),
    boundaryEvidence: 'Synthetic reviewed boundary', sourceProtectionEvidence: 'Synthetic source protections',
    erasureExportEvidence: 'Synthetic erasure and export', storageEvidence: 'Synthetic reviewed Storage', authEvidence: 'Synthetic reviewed Auth',
  } };
}

describe('reviewed package evidence', () => {
  it('accepts a fully reviewed synthetic package and matches canonical PostgreSQL signatures', () => {
    expect(validateDrawingCutoverPreflight(reviewedSnapshot(), STAGING).findings).toEqual([]);
    expect(validateDrawingCutoverPreflight(reviewedSnapshot(), STAGING).readyForStaging).toBe(true);
  });
  it('rejects stale review hashes after catalog changes', () => {
    const input = reviewedSnapshot(); input.catalog.functions[0].definitionHash = 'd'.repeat(64);
    const report = validateDrawingCutoverPreflight(input, STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'CATALOG_DRIFT')).toBe(true);
    expect(report.findings.some(f => f.code === 'COMMAND_NOT_REVIEWED')).toBe(true);
  });
  it('rejects an unbounded database-role API override', () => {
    const input = reviewedSnapshot();
    Object.assign(input.catalog, { settings: [{ database: 'postgres', role: 'authenticated', config: ['statement_timeout=0'] }] });
    input.catalog.counts.settings = 1;
    const report = validateDrawingCutoverPreflight(input, STAGING);
    expect(report.findings.some(f => f.code === 'API_DEADLINE_UNBOUNDED')).toBe(true);
  });
  it('has no apply flag or extra positional argument mode', () => {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/drawing-cutover-preflight.ts',
      'unused.json', STAGING, '--apply'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage:');
    expect(result.stdout).toBe('');
  });
  it('requires review of a callable volatile definer even without a recognizable drawing name or DML', () => {
    const input = reviewedSnapshot();
    input.catalog.functions.push({ ...input.catalog.functions[0], identity: 'public.external_dispatch()', name: 'external_dispatch',
      sourceMentionsProtected: false, hasMutationTokens: false, dynamicSql: false, calls: [] });
    input.catalog.counts.functions++;
    expect(validateDrawingCutoverPreflight(input, STAGING).findings
      .some(f => f.code === 'UNCLASSIFIED_DEFINER_WRITER' && f.identity === 'public.external_dispatch()')).toBe(true);
  });
  it('rejects a claimed internal-only definer that is still callable', () => {
    const input = reviewedSnapshot(); input.review.definitions[0].decision = 'internal-only';
    expect(validateDrawingCutoverPreflight(input, STAGING).findings.some(f => f.code === 'INTERNAL_WRITER_CALLABLE')).toBe(true);
  });
  it('requires all API effective function privileges, not a partial role sample', () => {
    const input = reviewedSnapshot(); input.catalog.functions[0].privileges.pop();
    expect(validateDrawingCutoverPreflight(input, STAGING).findings.some(f => f.code === 'INCOMPLETE_SNAPSHOT')).toBe(true);
  });
});

function refreshEvidence(input: ReturnType<typeof reviewedSnapshot>) {
  for (const [key, rows] of Object.entries(input.catalog)) if (Array.isArray(rows)) input.catalog.counts[key] = rows.length;
  input.review.catalogSha256 = createHash('sha256').update(JSON.stringify(input.catalog)).digest('hex');
  return input;
}

describe('review round 1 fail-closed boundaries', () => {
  it('does not replace an explicitly reviewed source guard with any enabled trigger', () => {
    const input = reviewedSnapshot();
    const replacement = { identity: 'public.drawings.audit_only', definitionHash: HASH, table: 'public.drawings',
      enabled: 'O', function: 'private.guard()', definition: 'BEFORE UPDATE audit_only' };
    Object.assign(input.catalog, { triggers: [replacement,
      ...input.catalog.triggers.filter(t => (t as { table: string }).table !== 'public.drawings')] });
    input.review.definitions.push({ identity: replacement.identity, definitionHash: HASH,
      decision: 'approved-command', evidence: 'Synthetic reviewed audit declaration' });
    const report = validateDrawingCutoverPreflight(refreshEvidence(input), STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'SOURCE_GUARD_BINDING_MISSING')).toBe(true);
  });
  it.each(['private.guard()', 'private.guard_helper()'])('rejects a missing guard/dependency body %s', identity => {
    const input = reviewedSnapshot();
    input.catalog.functions = input.catalog.functions.filter(f => f.identity !== identity);
    const report = validateDrawingCutoverPreflight(refreshEvidence(input), STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'GUARD_FUNCTION_MISSING' && f.identity === identity)).toBe(true);
  });
  it.each(['private.guard()', 'private.guard_helper()'])('rejects an unapproved changed guard/dependency hash %s', identity => {
    const input = reviewedSnapshot();
    input.catalog.functions.find(f => f.identity === identity)!.definitionHash = 'e'.repeat(64);
    const report = validateDrawingCutoverPreflight(refreshEvidence(input), STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'GUARD_FUNCTION_NOT_REVIEWED' && f.identity === identity)).toBe(true);
  });
  it.each(['', 'other_schema.unreviewed_hook'])('rejects an effective database-role MFA hook override %j', hook => {
    const input = reviewedSnapshot();
    Object.assign(input.catalog, { settings: [{ database: 'postgres', role: 'authenticator', config: [`pgrst.db_pre_request=${hook}`] }] });
    const report = validateDrawingCutoverPreflight(refreshEvidence(input), STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'MFA_HOOK_UNREVIEWED')).toBe(true);
  });
  it('retains the approved effective MFA hook when it overrides a database-only setting', () => {
    const input = reviewedSnapshot();
    Object.assign(input.catalog, { settings: [
      { database: 'postgres', role: null, config: ['pgrst.db_pre_request=database_only_hook'] },
      { database: 'postgres', role: 'authenticator', config: ['pgrst.db_pre_request=steelbuild_security.check_request_mfa'] },
    ] });
    expect(validateDrawingCutoverPreflight(refreshEvidence(input), STAGING).readyForStaging).toBe(true);
  });
  it.each(['table', 'schema', 'routine'])('rejects SET-able %s ownership even with revoked DML ACLs', kind => {
    const input = reviewedSnapshot();
    input.catalog.roles.push({ ...input.catalog.roles[0], name: 'settable_owner', inherits: false });
    input.catalog.roleMemberships.push({ member: 'authenticated', role: 'settable_owner', inherit: false, set: true });
    if (kind === 'table') input.catalog.tables[0].owner = 'settable_owner';
    if (kind === 'schema') Object.assign(input.catalog, { schemas: [{ identity: 'public', owner: 'settable_owner', acl: null },
      { identity: 'private', owner: 'postgres', acl: null }] });
    if (kind === 'routine') input.catalog.functions[0].owner = 'settable_owner';
    const report = validateDrawingCutoverPreflight(refreshEvidence(input), STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'API_REACHABLE_OWNER')).toBe(true);
  });
  it.each(['superuser', 'bypassRls', 'createRole', 'createDb', 'replication'] as const)(
    'rejects dangerous %s attributes on a SET-able reachable role', attribute => {
      const input = reviewedSnapshot();
      input.catalog.roles.push({ ...input.catalog.roles[0], name: 'settable_admin', [attribute]: true });
      input.catalog.roleMemberships.push({ member: 'authenticated', role: 'settable_admin', inherit: false, set: true });
      const report = validateDrawingCutoverPreflight(refreshEvidence(input), STAGING);
      expect(report.readyForStaging).toBe(false);
      expect(report.findings.some(f => f.code === 'API_REACHABLE_ROLE_UNSAFE')).toBe(true);
    });
  it('rejects an authenticated route to the intentional service-role bypass', () => {
    const input = reviewedSnapshot();
    input.catalog.roleMemberships.push({ member: 'authenticated', role: 'service_role', inherit: false, set: true });
    const report = validateDrawingCutoverPreflight(refreshEvidence(input), STAGING);
    expect(report.readyForStaging).toBe(false);
    expect(report.findings.some(f => f.code === 'API_REACHABLE_ROLE_UNSAFE')).toBe(true);
  });
});
