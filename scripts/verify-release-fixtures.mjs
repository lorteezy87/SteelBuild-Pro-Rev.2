import { pathToFileURL } from 'node:url';

export const REQUIRED_RELEASE_FIXTURES = [
  'E2E_USER', 'E2E_PASS', 'E2E_VIEWER_USER', 'E2E_VIEWER_PASS',
  'E2E_SUPABASE_ANON_KEY', 'E2E_FAB_PROJECT_ID', 'E2E_BLOCKED_DRAWING_ID', 'E2E_CLEAN_DRAWING_ID',
  'E2E_PIECE_PROJECT_ID', 'E2E_PIECE_OTHER_TENANT_PROJECT_ID', 'E2E_PIECE_WORK_PACKAGE_ID',
  'E2E_PIECE_APPROVED_DRAWING_ID', 'E2E_PIECE_EXCEPTION_WORK_PACKAGE_ID',
];
export const RELEASE_FIXTURE_IDS = REQUIRED_RELEASE_FIXTURES.filter(key => key.endsWith('_ID'));
const STAGING_REF = 'ndyfjffsulfbwpmwdmic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function verifyReleaseFixtures(env, now = Date.now()) {
  if (env.E2E_TARGET !== 'staging' || env.E2E_EXPECTED_SUPABASE_REF !== 'ndyfjffsulfbwpmwdmic' ||
      env.E2E_SUPABASE_URL !== 'https://ndyfjffsulfbwpmwdmic.supabase.co' ||
      env.E2E_BASE_URL !== 'https://steelbuild-pro-staging.n-lortz1987.workers.dev' ||
      env.E2E_MUTATIONS_ENABLED !== 'true' || env.E2E_MUTATION_FIXTURE_KIND !== 'disposable' ||
      env.E2E_PIECE_FULL_WORKFLOW !== 'true') throw new Error('Release acceptance requires the isolated, complete staging fixture');
  if (REQUIRED_RELEASE_FIXTURES.some(key => !String(env[key] || '').trim())) {
    throw new Error('Release acceptance fixture is incomplete; refusing silently skipped tests');
  }
  if (RELEASE_FIXTURE_IDS.some(key => !UUID.test(env[key]))) throw new Error('Release fixture IDs must be UUIDs');
  if (env.E2E_BLOCKED_DRAWING_ID === env.E2E_CLEAN_DRAWING_ID ||
      env.E2E_PIECE_WORK_PACKAGE_ID === env.E2E_PIECE_EXCEPTION_WORK_PACKAGE_ID ||
      env.E2E_PIECE_PROJECT_ID === env.E2E_PIECE_OTHER_TENANT_PROJECT_ID) throw new Error('Release fixture boundaries must use distinct records');
  let attestation;
  try { attestation = JSON.parse(env.E2E_RELEASE_FIXTURE_ATTESTATION || ''); }
  catch { throw new Error('Fresh release fixture attestation is required; reusable staging seed IDs are insufficient'); }
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA || '') || !/^\d+$/.test(env.GITHUB_RUN_ID || '') ||
      !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT || '') || attestation?.schema !== 1 ||
      attestation.supabase_ref !== STAGING_REF || attestation.revision !== env.GITHUB_SHA ||
      attestation.run_id !== env.GITHUB_RUN_ID || attestation.run_attempt !== env.GITHUB_RUN_ATTEMPT ||
      attestation.disposition !== 'fresh-for-single-release-attempt' || typeof attestation.reviewed_by !== 'string' || !attestation.reviewed_by.trim() ||
      RELEASE_FIXTURE_IDS.some(key => attestation.fixture_ids?.[key] !== env[key])) {
    throw new Error('Fixture attestation must bind the reviewed IDs to this exact revision, run and attempt');
  }
  const prepared = Date.parse(attestation.prepared_at);
  const expires = Date.parse(attestation.expires_at);
  if (typeof attestation.prepared_at !== 'string' || typeof attestation.expires_at !== 'string' ||
      !Number.isFinite(prepared) || !Number.isFinite(expires) || prepared > now + 300_000 || prepared < now - 86_400_000 ||
      expires <= now || expires <= prepared || expires - prepared > 86_400_000) {
    throw new Error('Fixture attestation is expired or outside its maximum 24-hour review window');
  }
  return attestation;
}

/** Read-only project checks; authentication creates short-lived sessions, then locally signs them out. */
export async function verifyReleaseFixtureFreshness(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  verifyReleaseFixtures(env, now);
  const base = env.E2E_SUPABASE_URL;
  const tokens = [];
  async function request(path, token, body) {
    const response = await fetchImpl(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      headers: { apikey: env.E2E_SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Release fixture server check failed: HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new Error('Release fixture server returned invalid JSON'); }
  }
  async function signIn(email, password) {
    const auth = await request('/auth/v1/token?grant_type=password', null, { email, password });
    if (!auth.access_token || !auth.user?.id) throw new Error('Release fixture sign-in did not establish a user');
    tokens.push(auth.access_token);
    return { token: auth.access_token, userId: auth.user.id };
  }
  async function row(table, id, select, token) {
    const query = new URLSearchParams({ select, id: `eq.${id}`, limit: '2' });
    const rows = await request(`/rest/v1/${table}?${query}`, token);
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== id || rows[0].is_deleted !== false ||
        (select.includes('deleted_at') && rows[0].deleted_at !== null) || rows[0].is_superseded === true) {
      throw new Error(`Release fixture ${table} row is missing, deleted or inaccessible`);
    }
    return rows[0];
  }
  try {
    const primary = await signIn(env.E2E_USER, env.E2E_PASS);
    const viewer = await signIn(env.E2E_VIEWER_USER, env.E2E_VIEWER_PASS);
    if (primary.userId === viewer.userId) throw new Error('Release fixture viewer must be a different user');
    const projectColumns = 'id,org_id,is_deleted,deleted_at,piece_control_mode';
    const pieceProject = await row('projects', env.E2E_PIECE_PROJECT_ID, projectColumns, primary.token);
    const fabProject = await row('projects', env.E2E_FAB_PROJECT_ID, projectColumns, primary.token);
    if (!pieceProject.org_id || pieceProject.org_id !== fabProject.org_id || !['pilot', 'live'].includes(pieceProject.piece_control_mode)) {
      throw new Error('Primary release fixtures must share one workspace with Piece Control enabled');
    }
    // The second identity proves that this tenant and its rows exist; an invented
    // foreign UUID would make the later RLS-deny test pass without testing data isolation.
    const foreignProject = await row('projects', env.E2E_PIECE_OTHER_TENANT_PROJECT_ID, projectColumns, viewer.token);
    if (!foreignProject.org_id || foreignProject.org_id === pieceProject.org_id) throw new Error('Cross-tenant fixture must belong to another workspace');
    const foreignQuery = new URLSearchParams({ select: 'id', project_id: `eq.${foreignProject.id}`, deleted_at: 'is.null', limit: '1' });
    const foreignPieces = await request(`/rest/v1/pieces?${foreignQuery}`, viewer.token);
    if (!Array.isArray(foreignPieces) || !foreignPieces.length) throw new Error('Cross-tenant fixture must contain a readable canonical piece for the second identity');
    const denied = await request(`/rest/v1/projects?${new URLSearchParams({ select: 'id', id: `eq.${foreignProject.id}`, limit: '1' })}`, primary.token);
    if (!Array.isArray(denied) || denied.length) throw new Error('Primary fixture user can access the other workspace');
    await row('projects', env.E2E_FAB_PROJECT_ID, projectColumns, viewer.token);
    for (const [key, projectId] of [
      ['E2E_BLOCKED_DRAWING_ID', fabProject.id], ['E2E_CLEAN_DRAWING_ID', fabProject.id],
      ['E2E_PIECE_APPROVED_DRAWING_ID', pieceProject.id],
    ]) {
      const drawing = await row('drawings', env[key], 'id,project_id,is_deleted,deleted_at,is_superseded', primary.token);
      if (drawing.project_id !== projectId) throw new Error('Release drawing does not belong to its attested project');
    }
    for (const [key, exception] of [['E2E_PIECE_WORK_PACKAGE_ID', false], ['E2E_PIECE_EXCEPTION_WORK_PACKAGE_ID', true]]) {
      const wp = await row('work_packages', env[key], 'id,project_id,is_deleted,deleted_at', primary.token);
      if (wp.project_id !== pieceProject.id) throw new Error('Release work package does not belong to its attested project');
      const gate = await request('/rest/v1/rpc/evaluate_release_gate', primary.token, { p_work_package_id: wp.id });
      if (gate.work_package_id !== wp.id || gate.project_id !== pieceProject.id || gate.already_released !== false) {
        throw new Error('Release fixture work package is consumed or its freshness cannot be proved; supply a new reviewed fixture');
      }
      const scope = gate.checks?.scope;
      if (!scope || typeof scope.passed !== 'boolean' || !Number.isInteger(scope.piece_count)) throw new Error('Release fixture scope evidence is incomplete');
      if (!exception && scope.piece_count !== 0) throw new Error('Lifecycle work package must be empty before this run adds its canonical pieces');
      if (exception && (scope.passed !== true || scope.piece_count < 1 || gate.passes !== false ||
          !['drawings', 'material', 'holds'].some(name => gate.checks?.[name]?.passed === false))) {
        throw new Error('Exception fixture requires canonical scope and a genuine non-scope release blocker');
      }
    }
    return { revision: env.GITHUB_SHA, run_id: env.GITHUB_RUN_ID, run_attempt: env.GITHUB_RUN_ATTEMPT,
      project_ref: STAGING_REF, fixture_ids_verified: RELEASE_FIXTURE_IDS.length, work_packages_unreleased: 2 };
  } finally {
    // Never log bearer tokens, passwords, provider bodies or customer rows.
    await Promise.allSettled(tokens.map(token => fetchImpl(`${base}/auth/v1/logout?scope=local`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { apikey: env.E2E_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await verifyReleaseFixtureFreshness(process.env))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
