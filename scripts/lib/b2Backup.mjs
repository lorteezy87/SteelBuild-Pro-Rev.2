// Native inventory avoids rclone's synthetic version filenames and counts the entire bucket.
export const BUDGET_BYTES = 9_000_000_000;
export const RESERVE_BYTES = 10_000_000;

export function parseB2Config(text) {
  const sections = text.trim().split(/^\s*\[/m).filter(Boolean);
  if (sections.length !== 1 || !sections[0].startsWith('offsite]')) throw new Error('Backup requires only an [offsite] B2 remote');
  const entries = new Map();
  for (const line of sections[0].split('\n').slice(1)) {
    if (!line.trim() || /^\s*[#;]/.test(line)) continue;
    const match = line.match(/^\s*([a-z_]+)\s*=\s*(.*?)\s*$/);
    if (!match || entries.has(match[1])) throw new Error('Invalid or duplicate B2 configuration option');
    entries.set(match[1], match[2]);
  }
  if (entries.get('type') !== 'b2' || !entries.get('account') || !entries.get('key')) throw new Error('Native B2 account and key are required');
  // A strict allowlist prevents filters, alternate endpoints, and destructive settings.
  for (const name of entries.keys()) if (!['type', 'account', 'key'].includes(name)) throw new Error(`Unsupported B2 configuration option: ${name}`);
  return { account: entries.get('account'), key: entries.get('key') };
}

function bytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid storage byte count');
  return value;
}
export function indexFiles(files, requireHash = true) {
  if (!Array.isArray(files)) throw new Error('Invalid file inventory');
  const map = new Map();
  for (const file of files) {
    if (file.IsDir) continue;
    if (typeof file.Path !== 'string' || !file.Path || file.Path.startsWith('/') || file.Path.split('/').some(p => p === '..' || p === '.') || /[\r\n\0]/.test(file.Path) || map.has(file.Path)) throw new Error('Unsafe or duplicate file path');
    bytes(file.Size);
    const sha1 = file.Hashes?.['SHA-1']?.toLowerCase();
    if (requireHash && !/^[a-f0-9]{40}$/.test(sha1 ?? '')) throw new Error('Missing SHA-1 in file inventory');
    map.set(file.Path, { ...file, sha1 });
  }
  return map;
}
export function calculateBudget({ storedBytes, source, current, reserveBytes = RESERVE_BYTES }) {
  const sourceFiles = indexFiles(source);
  const currentFiles = indexFiles(current, false);
  let transferBytes = 0;
  for (const [path, file] of sourceFiles) {
    const old = currentFiles.get(path);
    if (old?.sha1 !== file.sha1 || old?.Size !== file.Size) transferBytes = bytes(transferBytes + file.Size);
  }
  const projectedBytes = bytes(bytes(storedBytes) + transferBytes + bytes(reserveBytes));
  return { storedBytes, transferBytes, reserveBytes, projectedBytes, budgetBytes: BUDGET_BYTES, allowed: projectedBytes <= BUDGET_BYTES };
}

export async function readB2Inventory({ account, key, bucketName, fetcher = fetch }) {
  async function request(url, name, authorization, body) {
    const response = await fetcher(`${url}/${name}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`B2 ${name} failed (HTTP ${response.status})`);
    return response.json();
  }
  const auth = await request('https://api.backblazeb2.com/b2api/v4', 'b2_authorize_account', `Basic ${Buffer.from(`${account}:${key}`).toString('base64')}`);
  const storage = auth.apiInfo?.storageApi;
  if (!storage || !/^https:\/\/api[a-z0-9-]*\.backblazeb2\.com$/.test(storage.apiUrl) || !auth.authorizationToken || !auth.accountId) throw new Error('Invalid B2 authorization response');
  if (storage.allowed?.namePrefix) throw new Error('B2 key must permit whole-bucket inventory; remove its filename prefix restriction');
  const call = (name, body) => request(`${storage.apiUrl}/b2api/v4`, name, auth.authorizationToken, body);
  const result = await call('b2_list_buckets', { accountId: auth.accountId, bucketName });
  const bucket = result.buckets?.find(b => b.bucketName === bucketName);
  if (!bucket?.bucketId || bucket.bucketType !== 'allPrivate') throw new Error('Backup requires an accessible private B2 bucket');
  if (!Array.isArray(bucket.lifecycleRules)) throw new Error('B2 lifecycle rules unavailable');
  for (const rule of bucket.lifecycleRules) {
    if (rule.daysFromHidingToDeleting || rule.daysFromUploadingToHiding) throw new Error('B2 lifecycle would delete recovery history; remove expiration rules before backup');
  }
  const unfinished = await call('b2_list_unfinished_large_files', { bucketId: bucket.bucketId, maxFileCount: 1 });
  if (!Array.isArray(unfinished.files) || unfinished.files.length || unfinished.nextFileId) throw new Error('Unfinished B2 uploads prevent a reliable budget check; inspect them before retrying');
  let storedBytes = 0;
  let versions = 0;
  let cursor = {};
  const cursors = new Set();
  do {
    const page = await call('b2_list_file_versions', { bucketId: bucket.bucketId, maxFileCount: 10000, ...cursor });
    if (!Array.isArray(page.files)) throw new Error('Invalid B2 versions response');
    for (const file of page.files) {
      if (file.action === 'hide') continue;
      if (file.action !== 'upload' || !file.fileId || typeof file.fileName !== 'string') throw new Error('Invalid B2 object version');
      storedBytes = bytes(storedBytes + bytes(file.contentLength));
      versions += 1;
    }
    if (page.nextFileName == null && page.nextFileId == null) break;
    if (typeof page.nextFileName !== 'string' || typeof page.nextFileId !== 'string') throw new Error('Invalid B2 pagination cursor');
    cursor = { startFileName: page.nextFileName, startFileId: page.nextFileId };
    const key = JSON.stringify(cursor);
    if (cursors.has(key)) throw new Error('Repeated B2 pagination cursor');
    cursors.add(key);
  } while (true);
  return { storedBytes, versions, bucketName };
}

const COPY_FLAGS = ['--fast-list', '--transfers', '4', '--checkers', '8', '--retries', '1', '--low-level-retries', '1', '--stats', '30s', '--stats-one-line'];
const SAFE_B2_FLAGS = ['--b2-hard-delete=false', '--b2-disable-checksum=false'];
export async function runIncrementalBackup({ plan, stageRoot, execute, inventory }) {
  if (plan.length !== 3 || ['app-files', 'email-attachments', 'sheets-files'].some(b => !plan.some(p => p.bucket === b))) throw new Error('Backup must cover all three required buckets');
  const json = async args => JSON.parse(await execute(args, { captureOutput: true, label: args[0] }));
  const run = args => execute(args, { captureOutput: false, label: args[0] });
  const before = await inventory();
  if (before.storedBytes + RESERVE_BYTES >= BUDGET_BYTES) throw new Error('Backup paused: 9 GB storage budget is full');
  // Stage a bounded, stable source copy so hashes and planned bytes cannot change during upload.
  let sourceBytes = 0;
  for (const item of plan) {
    const stats = await json(['size', item.source, '--json']);
    sourceBytes = bytes(sourceBytes + bytes(stats.bytes));
  }
  if (sourceBytes + RESERVE_BYTES > BUDGET_BYTES) throw new Error('Source alone exceeds the 9 GB storage budget');
  const staged = [];
  const allSource = [];
  const allCurrent = [];
  for (const item of plan) {
    const local = `${stageRoot}/${item.bucket}`;
    console.log(`Staging ${item.bucket}`);
    await run(['copy', item.source, local, '--metadata', '--max-transfer', String(BUDGET_BYTES), '--cutoff-mode', 'hard', ...COPY_FLAGS]);
    const files = await json(['lsjson', local, '--recursive', '--files-only', '--hash', '--hash-type', 'SHA-1']);
    indexFiles(files);
    const current = await json(['lsjson', item.current, '--recursive', '--files-only', '--hash', '--hash-type', 'SHA-1']);
    // Unknown destination checksums cannot safely guide checksum sync or its byte projection.
    indexFiles(current);
    allSource.push(...files.map(f => ({ ...f, Path: `${item.bucket}/${f.Path}` })));
    allCurrent.push(...current.map(f => ({ ...f, Path: `${item.bucket}/${f.Path}` })));
    staged.push({ ...item, local, files });
  }
  const budget = calculateBudget({ ...(await inventory()), source: allSource, current: allCurrent });
  console.log(`Storage projection: ${budget.storedBytes} retained + ${budget.transferBytes} new + ${budget.reserveBytes} reserve = ${budget.projectedBytes} / ${budget.budgetBytes} bytes`);
  if (!budget.allowed) throw new Error('Backup paused: projected versions exceed the 9 GB storage budget; no backup files were changed');
  if (Buffer.byteLength(JSON.stringify(allSource)) > RESERVE_BYTES / 2) throw new Error('File manifest exceeds the reserved storage allowance');
  const buckets = [];
  for (const item of staged) {
    await run(['sync', item.local, item.current, '--checksum', ...SAFE_B2_FLAGS, ...COPY_FLAGS]);
    await run(['check', item.local, item.current, ...SAFE_B2_FLAGS]);
    const restoreAt = new Date().toISOString();
    // Test recovery through the same point-in-time mechanism documented for disasters.
    const sample = [...item.files].sort((a, b) => a.Size - b.Size)[0];
    if (sample) {
      const restored = `${stageRoot}/restored/${item.bucket}`;
      await run(['copyto', `${item.current}/${sample.Path}`, `${restored}/${sample.Path}`, '--b2-version-at', restoreAt, ...COPY_FLAGS]);
      await run(['check', item.local, restored, '--one-way', '--include', `/${sample.Path.replace(/([*?\[\]{}\\])/g, '\\$1')}`]);
    }
    buckets.push({ bucket: item.bucket, current: item.current, restoreAt, objects: item.files.length, bytes: item.files.reduce((sum, f) => sum + f.Size, 0), files: item.files.map(f => ({ path: f.Path, bytes: f.Size, sha1: f.Hashes['SHA-1'] })), restoreSample: sample?.Path ?? null });
  }
  return { schemaVersion: 2, status: 'verified', method: 'b2-native-versions', budget, buckets };
}
