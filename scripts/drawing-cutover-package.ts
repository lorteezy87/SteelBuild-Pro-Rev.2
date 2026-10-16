/** Offline validation only. No network, database driver, SQL execution or apply mode. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type PayloadEntry = { path: string; candidate: string; version: string; sha256: string; depends_on: string[] };
export type Payload = PayloadEntry & { payload: string };
type Prerequisite = { path: string; sha256: string };
export type PackageManifest = { schema_version: 1; payloads: PayloadEntry[]; prerequisites: Prerequisite[]; required_prerequisite_identities: string[]; observed_catalogs: unknown[] };
/** Mandatory direct auth/workflow prerequisites; full catalog/ownership review is ALSO required. */
export const requiredPrerequisites = ['public.user_is_org_member(uuid)', 'public.user_has_project_access(uuid)',
  'public.user_has_project_role_at_least(uuid, text)', 'steelbuild_security.satisfies_mfa()',
  'public.get_submittal_revision_coverage(uuid)', 'public.evaluate_fab_release_set(uuid, uuid)',
  'steelbuild_workflow.has_round_context(uuid)', 'steelbuild_workflow.guard_captured_revision()'];
const prerequisiteFiles = ['supabase/migrations/20260101000010_baseline_schema.sql',
  'supabase/migrations/20261009070300_submittal_round_revision_evidence.sql',
  'supabase/migrations/20260914120000_adopt_production_soft_delete_project.sql',
  'supabase/migrations/20261008013546_align_drawing_set_governing_submittal.sql',
  'supabase/drawing-cutover/activation-capture.sql', 'supabase/drawing-cutover/activate-manual.sql',
  'supabase/tests/function-search-path/live-helper-fixture.sql',
  'supabase/tests/submittal-revision-evidence/live-workflow-guards.sql',
  'supabase/tests/submittal-revision-evidence/live-erasure-functions.sql'];
export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
function fail(message: string): never { throw new Error(`Drawing package: ${message}`); }
function file(root: string, path: string): Buffer {
  if (typeof path !== 'string' || path.includes('\\') || isAbsolute(path) || !path.startsWith('supabase/')) fail('invalid package path');
  const absolute = resolve(root, path), local = relative(resolve(root), absolute);
  if (local.startsWith('..') || isAbsolute(local)) fail('path escapes package');
  return readFileSync(absolute);
}
/** Lexical validation only; the unmodified original bytes are executed/stamped. */
export function assertNoTransactionControl(sql: string) {
  const tokens = sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|(\$(?:[a-zA-Z_][\w]*)?\$)[\s\S]*?\1/g, ' ');
  if (/(?:^|;)\s*(?:begin|commit|rollback|abort|end|savepoint|release|start\s+transaction|prepare\s+transaction)\b/i.test(tokens)) fail('top-level transaction control is forbidden');
}
export function validatePayloads(root: string, entries: readonly PayloadEntry[]): Payload[] {
  if (!Array.isArray(entries) || entries.length !== 4) fail('exactly four ordered payloads required');
  const versions = new Set<string>();
  return entries.map((entry, index) => {
    if (!entry || !/^\d{14}$/.test(entry.version) || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('invalid version/hash');
    if (!entry.path.startsWith(`supabase/migrations/${entry.version}_`) || !entry.path.endsWith('.sql') ||
      !entry.candidate.startsWith('supabase/candidates/') || !entry.candidate.endsWith('.sql')) fail('invalid payload path/version');
    if (versions.has(entry.version) || (index > 0 && entry.version <= entries[index - 1].version)) fail('versions must be unique and ordered');
    if (!Array.isArray(entry.depends_on) || entry.depends_on.length !== (index ? 1 : 0) ||
      (index > 0 && entry.depends_on[0] !== entries[index - 1].version)) fail('dependency ordering mismatch');
    versions.add(entry.version);
    const bytes = file(root, entry.path);
    if (sha256(bytes) !== entry.sha256) fail(`hash mismatch: ${entry.path}`);
    if (!bytes.equals(file(root, entry.candidate))) fail(`candidate/promoted byte mismatch: ${entry.path}`);
    const payload = bytes.toString('utf8');
    if (!Buffer.from(payload, 'utf8').equals(bytes) || payload.includes('\r') || payload.includes('\0') || !payload.endsWith('\n')) fail('payload must be exact UTF-8 LF text with final newline');
    assertNoTransactionControl(payload);
    return { ...entry, payload };
  });
}
export function loadDrawingPackage(root = packageRoot): Payload[] {
  const manifest = JSON.parse(file(root, 'supabase/drawing-cutover-package.json').toString('utf8')) as PackageManifest;
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.prerequisites) || manifest.prerequisites.length === 0) fail('missing prerequisite manifest');
  if (JSON.stringify(manifest.required_prerequisite_identities) !== JSON.stringify(requiredPrerequisites)) fail('required prerequisite roster mismatch');
  if (JSON.stringify(manifest.prerequisites.map(p => p.path)) !== JSON.stringify(prerequisiteFiles)) fail('prerequisite file roster mismatch');
  for (const prerequisite of manifest.prerequisites) {
    if (!/^[a-f0-9]{64}$/.test(prerequisite.sha256) || sha256(file(root, prerequisite.path)) !== prerequisite.sha256) fail(`prerequisite hash mismatch: ${prerequisite.path}`);
  }
  return validatePayloads(root, manifest.payloads);
}
export function renderManualInstall(payloads: readonly Payload[]): string {
  const roster = requiredPrerequisites.map(identity => `'${identity}'`).join(',');
  const bodies = payloads.map((entry, index) => {
    const tag = `$cutover_payload_${index}$`;
    if (entry.payload.includes(tag) || entry.payload.includes('$install_component$')) fail('payload delimiter collision');
    const name = entry.path.slice(entry.path.lastIndexOf('/') + 1).slice(15, -4);
    if (!/^[a-z0-9_]+$/.test(name)) fail('invalid migration name');
    return `DO $install_component$\nDECLARE payload text := ${tag}${entry.payload}${tag};\nBEGIN\n  IF encode(sha256(convert_to(payload,'UTF8')),'hex') <> '${entry.sha256}' THEN RAISE EXCEPTION 'CUTOVER_PAYLOAD_HASH'; END IF;\n  EXECUTE payload;\n  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${entry.version}','${name}',ARRAY[payload]);\nEND $install_component$;\n`;
  }).join('\n');
  return `-- MANUAL REVIEW ONLY. No tool in this repository applies this file.\n-- Required session bindings are supplied by the authorized operator from reviewed evidence.\n-- project_ref is a target assertion, not proof of connection origin.\nBEGIN;\nDO $install_preconditions$\nDECLARE prereqs jsonb; p jsonb; actual text;\nBEGIN\n  IF current_setting('drawing_cutover.project_ref',true) IS NULL OR current_setting('drawing_cutover.project_ref',true) !~ '^[a-z]{20}$'\n    OR coalesce(current_setting('drawing_cutover.reviewed_source_commit',true),'') !~ '^[a-f0-9]{40}$'\n    OR coalesce(current_setting('drawing_cutover.reviewed_classification_sha256',true),'') !~ '^[a-f0-9]{64}$' THEN\n    RAISE EXCEPTION 'CUTOVER_REVIEW_BINDINGS_REQUIRED'; END IF;\n  prereqs:=current_setting('drawing_cutover.expected_prerequisites',true)::jsonb;\n  IF jsonb_typeof(prereqs) IS DISTINCT FROM 'array' OR jsonb_array_length(prereqs)=0 THEN RAISE EXCEPTION 'CUTOVER_PREREQUISITES_REQUIRED'; END IF;\n  IF jsonb_array_length(prereqs) <> 8 OR (SELECT array_agg(DISTINCT value->>'identity' ORDER BY value->>'identity') FROM jsonb_array_elements(prereqs)) IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[${roster}]) x) THEN RAISE EXCEPTION 'CUTOVER_PREREQUISITE_ROSTER'; END IF;\n  FOR p IN SELECT value FROM jsonb_array_elements(prereqs) LOOP\n    IF coalesce(p->>'sha256','') !~ '^[a-f0-9]{64}$' OR nullif(p->>'identity','') IS NULL THEN RAISE EXCEPTION 'CUTOVER_INVALID_PREREQUISITE'; END IF;\n    SELECT encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(p->>'identity')),'UTF8')),'hex') INTO actual;\n    IF actual IS DISTINCT FROM p->>'sha256' THEN RAISE EXCEPTION 'CUTOVER_PREREQUISITE_MISMATCH: %',p->>'identity'; END IF;\n  END LOOP;\nEND $install_preconditions$;\n\n${bodies}\nDO $disabled_assertions$\nDECLARE role_name text; signature text;\nBEGIN\n  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP\n    FOREACH signature IN ARRAY ARRAY['public.create_drawing_set_from_review(uuid,jsonb)','public.apply_drawing_set_revision(uuid,jsonb)'] LOOP\n      IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'CUTOVER_EFFECTIVE_EXECUTE_EXPOSURE: % %',role_name,signature; END IF;\n    END LOOP;\n  END LOOP;\n  IF EXISTS(SELECT 1 FROM steelbuild_drawing_revision.package_review) THEN RAISE EXCEPTION 'CUTOVER_MUST_INSTALL_UNAPPROVED'; END IF;\nEND $disabled_assertions$;\nCOMMIT;\n`;
}
export function validateDrawingPackage(root = packageRoot): Payload[] {
  const payloads = loadDrawingPackage(root);
  const expected = Buffer.from(renderManualInstall(payloads));
  if (!file(root, 'supabase/drawing-cutover/install-manual.sql').equals(expected)) fail('manual wrapper/payload byte mismatch');
  return payloads;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 2) fail('validation only; no arguments, network, database or apply mode');
    for (const entry of validateDrawingPackage()) console.log(`${entry.version} ${entry.sha256} ${entry.path}`);
    console.log('Exact package validated; installation, classification and activation remain separately reviewed manual operations.');
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
