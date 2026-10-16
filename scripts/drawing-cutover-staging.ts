/** Staging-only entrypoint. No SQL, setup, deploy or production mode. */
import { STAGE_REF, STAGE_ORIGIN, requireCondition, validateFixture, validateCredentials, assertDrawingMutationReadiness } from '../e2e/drawing-cutover-setup.ts';
import type { RunConfig } from '../e2e/drawing-cutover-setup.ts';
import { ACTORS, digest } from '../e2e/drawing-cutover-setup.ts';
import { DrawingCutoverTransport } from '../e2e/drawingCutoverNetworkGuard.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export function prepareRun(input: { args: readonly string[]; head: string; fixtureText: string; env: Record<string, string | undefined> }): RunConfig {
  const flags = new Map<string, string>();
  for (let index = 0; index < input.args.length; index++) {
    let argument = input.args[index];
    if (/^--(?:target|expected-ref|candidate-sha|phase|fixture)$/.test(argument)) argument += `=${input.args[++index] ?? ''}`;
    const match = /^--(target|expected-ref|candidate-sha|phase|fixture)=(.+)$/.exec(argument);
    requireCondition(match && !flags.has(match[1]), 'CLI_EXPLICIT_ARGUMENTS_REQUIRED');
    flags.set(match[1], match[2]);
  }
  requireCondition(flags.size === 5 && flags.get('target') === 'staging' && flags.get('expected-ref') === STAGE_REF, 'STAGING_TARGET_REQUIRED');
  const candidateSha = flags.get('candidate-sha')!;
  requireCondition(/^[a-f0-9]{40}$/.test(candidateSha) && candidateSha === input.head, 'CANDIDATE_SOURCE_MISMATCH');
  const phase = flags.get('phase');
  requireCondition(phase === 'preflight' || phase === 'acceptance', 'PHASE_UNSUPPORTED');
  const publicKey = validatePublicStage(input.env.E2E_SUPABASE_URL, input.env.E2E_SUPABASE_ANON_KEY);
  const manifestSha256 = input.env.DRAWING_CUTOVER_MANIFEST_SHA256 ?? '';
  const manifest = validateFixture(input.fixtureText, manifestSha256, candidateSha);
  requireCondition(digest(publicKey) === manifest.publicKeySha256, 'PUBLIC_KEY_BINDING_REQUIRED');
  const actors = validateCredentials(input.env.DRAWING_CUTOVER_ACTORS, manifest);
  return { phase, candidateSha, manifest, manifestSha256, actors, anonKey: publicKey };
}
export function validatePublicStage(url: string | undefined, key: string | undefined): string {
  requireCondition(url === STAGE_ORIGIN, 'STAGING_ORIGIN_REQUIRED');
  const publicKey = key ?? '';
  let publicKeyValid = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey);
  if (!publicKeyValid) {
    try {
      const claims = JSON.parse(Buffer.from(publicKey.split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>;
      publicKeyValid = claims.role === 'anon' && claims.ref === STAGE_REF;
    } catch { /* An opaque or malformed key cannot become a public JWT. */ }
  }
  requireCondition(publicKeyValid, 'PUBLIC_KEY_REQUIRED');
  return publicKey;
}

export const UNPROVED_PREREQUISITES = [
  'CURRENT_CATALOG_OWNER_DEPENDENCY_REVIEW', 'INSTALLED_PACKAGE_AND_ACTIVATION_REVIEW', 'REAL_MFA_MATRIX',
  'UPLOAD_COMMAND_AND_LIFECYCLE_BINDINGS', 'MANUAL_STOP_RECOVERY_AND_ERASURE', 'BEFORE_AFTER_ADVISORS',
] as const;
const SAFE_FAILURES = new Set(['PRIVATE_FIXTURE_PATH_REQUIRED', 'CLEAN_CANDIDATE_REQUIRED', 'CLI_EXPLICIT_ARGUMENTS_REQUIRED',
  'STAGING_TARGET_REQUIRED', 'CANDIDATE_SOURCE_MISMATCH', 'PHASE_UNSUPPORTED', 'STAGING_ORIGIN_REQUIRED', 'PUBLIC_KEY_REQUIRED',
  'FIXTURE_REVIEW_DIGEST_REQUIRED', 'FIXTURE_SCHEMA_INVALID', 'FIXTURE_SOURCE_OR_EXPIRY', 'ACTOR_CREDENTIALS_REQUIRED',
  'ACTOR_CREDENTIAL_BINDING', 'SYNTHETIC_AUTH_FAILED', 'AUTH_IDENTITY_MISMATCH', 'OWNERSHIP_CHANGED', 'OWNERSHIP_READ_FAILED',
  'MUTATION_PREREQUISITES_UNPROVED', 'PUBLIC_KEY_BINDING_REQUIRED', 'ENTITY_OWNERSHIP_REQUIRED', 'ENTITY_OWNERSHIP_CHANGED', 'ENTITY_OWNERSHIP_READ_FAILED',
  'CLIENT_PUBLIC_KEY_MISMATCH', 'BUILD_PUBLIC_KEY_MISMATCH', 'BUILD_PUBLIC_CONFIG_REQUIRED', 'BUILD_PUBLIC_CONFIG_AMBIGUOUS',
  'BUILD_CONFIG_LITERAL_REQUIRED', 'BUILD_RUNTIME_BINDING_REQUIRED', 'BUILD_CONFIG_MISMATCH',
  'BUILD_SOURCE_MISMATCH', 'BUILD_IDENTITY_MISMATCH', 'BUILD_BYTES_MISMATCH', 'PACKAGE_BYTES_MISMATCH']);
export function safeFailure(error: unknown): string {
  return error instanceof Error && SAFE_FAILURES.has(error.message) ? error.message : 'RUNNER_REFUSED';
}
export function writePrivateManifestFromEnvironment(): void {
  const value = process.env.DRAWING_CUTOVER_FIXTURE_JSON;
  requireCondition(value && Buffer.byteLength(value) <= 1_048_576, 'FIXTURE_JSON_REQUIRED');
  requireCondition(digest(value) === process.env.DRAWING_CUTOVER_MANIFEST_SHA256, 'FIXTURE_REVIEW_DIGEST_REQUIRED');
  mkdirSync('e2e/.auth/drawing-cutover', { recursive: true });
  writeFileSync('e2e/.auth/drawing-cutover/fixture.json', value, { mode: 0o600 });
}
export function loadRunConfig(args?: readonly string[]): RunConfig {
  const explicit = args ?? ['--target=staging', `--expected-ref=${STAGE_REF}`, `--candidate-sha=${process.env.DRAWING_CUTOVER_CANDIDATE_SHA ?? ''}`,
    `--phase=${process.env.DRAWING_CUTOVER_PHASE ?? ''}`, '--fixture=e2e/.auth/drawing-cutover/fixture.json'];
  const fixtureIndex = explicit.findIndex(a => a === '--fixture' || a.startsWith('--fixture='));
  const fixturePath = explicit[fixtureIndex]?.startsWith('--fixture=') ? explicit[fixtureIndex].slice('--fixture='.length) : explicit[fixtureIndex + 1];
  requireCondition(fixtureIndex >= 0 && fixturePath && resolve(fixturePath) === resolve('e2e/.auth/drawing-cutover/fixture.json'), 'PRIVATE_FIXTURE_PATH_REQUIRED');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  requireCondition(!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(), 'CLEAN_CANDIDATE_REQUIRED');
  return prepareRun({ args: explicit, head, fixtureText: readFileSync(fixturePath, 'utf8'), env: process.env });
}
let runtime: Promise<DrawingCutoverTransport> | undefined;
export function getDrawingRuntime(): Promise<DrawingCutoverTransport> {
  runtime ??= (async () => {
    requireCondition(process.env.DRAWING_CUTOVER_ENABLED === 'true', 'DRAWING_RUNNER_OPT_IN_REQUIRED');
    const config = loadRunConfig();
    if (config.phase === 'acceptance') {
      verifyBuild(config.candidateSha, config.manifest.publicKeySha256);
      assertDrawingMutationReadiness();
    }
    const transport = new DrawingCutoverTransport(config);
    // Both independently created project observers must authenticate before any write.
    for (const actor of ACTORS) await transport.signIn(actor);
    await transport.verifyParents(transport.config.manifest.projects.map(p => p.id));
    return transport;
  })();
  return runtime;
}
export function assertFabBindings(config: RunConfig, env: Record<string, string | undefined>): void {
  const fab = config.manifest.fab;
  requireCondition(config.phase === 'acceptance' && fab && env.E2E_MUTATIONS_ENABLED === 'true'
    && env.E2E_MUTATION_FIXTURE_KIND === 'disposable' && env.E2E_TARGET === 'staging'
    && env.E2E_EXPECTED_SUPABASE_REF === STAGE_REF && env.E2E_BASE_URL === 'http://127.0.0.1:4173', 'FAB_RUNNER_BINDINGS_REQUIRED');
  requireCondition(env.E2E_FAB_PROJECT_ID === fab.projectId && env.E2E_BLOCKED_DRAWING_ID === fab.blockedDrawingId
    && env.E2E_CLEAN_DRAWING_ID === fab.cleanDrawingId && env.E2E_USER === config.actors.pm.email
    && env.E2E_PASS === config.actors.pm.password && env.E2E_VIEWER_USER === config.actors.viewer.email
    && env.E2E_VIEWER_PASS === config.actors.viewer.password, 'FAB_FIXTURE_BINDINGS_REQUIRED');
}
function buildFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    requireCondition(!entry.isSymbolicLink(), 'BUILD_SYMLINK_REFUSED');
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? buildFiles(file) : [file];
  }).filter(file => !file.endsWith(`${sep}drawing-cutover-build.json`)).sort();
}
/** Inspect the emitted Vite env object, not the sealing process's environment.
 * Unsupported/ambiguous emission refuses; never evaluate bundle code or log keys. */
function builtPublicBinding(files: string[], candidateSha: string): { publicKeySha256: string; publicConfigSha256: string } {
  const bindings: { publicKeySha256: string; publicConfigSha256: string }[] = [];
  const fields = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_APP_VERSION'];
  for (const file of files.filter(file => file.endsWith('.js'))) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
    function visit(node: ts.Node): void {
      if (ts.isObjectLiteralExpression(node)) {
        const relevant = node.properties.filter(property => property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && fields.includes(property.name.text));
        if (relevant.length) {
          const values = new Map<string, string>();
          requireCondition(!node.properties.some(ts.isSpreadAssignment), 'BUILD_CONFIG_LITERAL_REQUIRED');
          for (const property of relevant) {
            requireCondition(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && ts.isStringLiteral(property.initializer), 'BUILD_CONFIG_LITERAL_REQUIRED');
            requireCondition(!values.has(property.name.text), 'BUILD_CONFIG_LITERAL_REQUIRED');
            values.set(property.name.text, property.initializer.text);
          }
          requireCondition(fields.every(field => values.has(field)), 'BUILD_CONFIG_LITERAL_REQUIRED');
          const url = values.get('VITE_SUPABASE_URL')!;
          const key = validatePublicStage(url, values.get('VITE_SUPABASE_ANON_KEY'));
          requireCondition(values.get('VITE_APP_VERSION') === candidateSha, 'BUILD_SOURCE_MISMATCH');
          bindings.push({ publicKeySha256: digest(key), publicConfigSha256: digest(JSON.stringify([candidateSha, url, key])) });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  requireCondition(bindings.length > 0, 'BUILD_PUBLIC_CONFIG_REQUIRED');
  requireCondition(bindings.length === 1, 'BUILD_PUBLIC_CONFIG_AMBIGUOUS');
  return bindings[0];
}
export function sealBuild(candidateSha: string, directory = 'dist'): void {
  requireCondition(/^[a-f0-9]{40}$/.test(candidateSha) && execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === candidateSha, 'BUILD_SOURCE_MISMATCH');
  const files = buildFiles(directory);
  requireCondition(files.length > 0 && files.some(f => f.endsWith(`${sep}index.html`)), 'BUILD_MISSING');
  const hashes = Object.fromEntries(files.map(file => [relative(resolve(directory), file).split(sep).join('/'), digest(readFileSync(file))]));
  const runtimeFiles = files.filter(file => file.endsWith('.js')).map(file => readFileSync(file, 'utf8')).join('\n');
  requireCondition(runtimeFiles.includes(STAGE_ORIGIN) && !runtimeFiles.includes('https://kjrwqagyeswwoxpjkcko.supabase.co'), 'BUILD_TARGET_MISMATCH');
  const publicBinding = builtPublicBinding(files, candidateSha);
  writeFileSync(resolve(directory, 'drawing-cutover-build.json'), JSON.stringify({ version: 2, candidateSha, projectRef: STAGE_REF, ...publicBinding, hashes }));
}
export function verifyBuild(candidateSha: string, expectedPublicKeySha256: string, directory = 'dist'): void {
  requireCondition(/^[a-f0-9]{64}$/.test(expectedPublicKeySha256 ?? ''), 'BUILD_RUNTIME_BINDING_REQUIRED');
  const marker = JSON.parse(readFileSync(resolve(directory, 'drawing-cutover-build.json'), 'utf8')) as { version?: number; candidateSha?: string; projectRef?: string; publicKeySha256?: string; publicConfigSha256?: string; hashes?: Record<string, string> };
  requireCondition(marker.version === 2 && marker.candidateSha === candidateSha && marker.projectRef === STAGE_REF && marker.hashes, 'BUILD_IDENTITY_MISMATCH');
  const files = buildFiles(directory);
  requireCondition(files.length === Object.keys(marker.hashes).length, 'BUILD_FILE_ROSTER_MISMATCH');
  for (const file of files) requireCondition(marker.hashes[relative(resolve(directory), file).split(sep).join('/')] === digest(readFileSync(file)), 'BUILD_BYTES_MISMATCH');
  const actualBinding = builtPublicBinding(files, candidateSha);
  requireCondition(marker.publicKeySha256 === actualBinding.publicKeySha256 && marker.publicConfigSha256 === actualBinding.publicConfigSha256, 'BUILD_CONFIG_MISMATCH');
  requireCondition(actualBinding.publicKeySha256 === expectedPublicKeySha256, 'BUILD_PUBLIC_KEY_MISMATCH');
}
export function verifyPackage(): void {
  const manifest = JSON.parse(readFileSync('supabase/drawing-cutover-package.json', 'utf8')) as { payloads: { path: string; candidate: string; sha256: string }[] };
  requireCondition(manifest.payloads.length === 4, 'PACKAGE_ROSTER_MISMATCH');
  for (const payload of manifest.payloads) {
    requireCondition(/^supabase\/migrations\/2026101606\d{4}_drawing_[a-z_]+\.sql$/.test(payload.path)
      && /^supabase\/candidates\/drawing-[a-z-]+\.sql$/.test(payload.candidate), 'PACKAGE_PATH_REFUSED');
    requireCondition(digest(readFileSync(payload.path)) === payload.sha256 && digest(readFileSync(payload.candidate)) === payload.sha256, 'PACKAGE_BYTES_MISMATCH');
  }
}
export async function runPreflight(config: RunConfig, network: typeof fetch = fetch) {
  const transport = new DrawingCutoverTransport(config, network);
  for (const actor of ACTORS) await transport.signIn(actor);
  await transport.verifyParents(config.manifest.projects.map(p => p.id));
  return { version: 1, phase: config.phase, candidateSha: config.candidateSha, manifestSha256: config.manifestSha256,
    status: 'INCOMPLETE', authenticatedActors: ACTORS.length, verifiedParents: config.manifest.projects.length,
    blockers: [...UNPROVED_PREREQUISITES], hostedAcceptanceComplete: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let exitCode = 1;
  try {
    const config = loadRunConfig(process.argv.slice(2));
    verifyPackage();
    if (config.phase === 'acceptance') verifyBuild(config.candidateSha, config.manifest.publicKeySha256);
    const report = await runPreflight(config);
    mkdirSync('test-results/drawing-cutover', { recursive: true });
    writeFileSync('test-results/drawing-cutover/preflight.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(`Drawing ${config.phase}: INCOMPLETE; authenticatedActors=${report.authenticatedActors}; verifiedParents=${report.verifiedParents}`);
    exitCode = 2;
  } catch (error) {
    // Never print raw network, schema, filesystem or subprocess exceptions.
    const reason = safeFailure(error);
    try {
      mkdirSync('test-results/drawing-cutover', { recursive: true });
      writeFileSync('test-results/drawing-cutover/preflight.json', JSON.stringify({ version: 1, status: 'FAIL', reason, hostedAcceptanceComplete: false }) + '\n', { mode: 0o600 });
    } catch { /* A missing sanitized report also fails artifact retention. */ }
    console.error(`Drawing staging run refused: ${reason}; no acceptance pass was recorded.`);
  }
  process.exitCode = exitCode;
}
