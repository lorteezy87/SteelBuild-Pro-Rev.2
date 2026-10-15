import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expectedRelease } from './check-production-domains.ts';

interface ReleaseManifestOptions {
  archivePath: string;
  commitSha: string;
  manifestPath: string;
  ref: string;
  repository: string;
  repositoryRoot: string;
}

interface VerifyOptions {
  archivePath: string;
  commitSha?: string;
  manifestPath: string;
  repositoryRoot: string;
}

interface FileDigest {
  path: string;
  sha256: string;
  size_bytes: number;
}

export interface SitesReleaseManifest {
  schema_version: 1;
  project_id: string;
  commit_sha: string;
  repository: string;
  ref: string;
  archive: FileDigest;
  static: {
    directory: 'dist';
    entry_asset: { path: string; sha256: string };
    file_count: number;
    tree_sha256: string;
  };
}

const sha256 = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

async function digestFile(filePath: string): Promise<FileDigest> {
  const bytes = await readFile(filePath);
  return {
    path: path.basename(filePath),
    sha256: sha256(bytes),
    size_bytes: bytes.byteLength,
  };
}

async function listFiles(directory: string, relative = ''): Promise<string[]> {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? listFiles(directory, child) : [child];
  }));
  return files.flat().sort((left, right) => left.localeCompare(right));
}

async function digestTree(directory: string): Promise<{ fileCount: number; sha256: string }> {
  const files = await listFiles(directory);
  const records = await Promise.all(files.map(async (relativePath) => {
    const bytes = await readFile(path.join(directory, relativePath));
    return `${relativePath.replaceAll('\\', '/')}\0${bytes.byteLength}\0${sha256(bytes)}\n`;
  }));
  return { fileCount: files.length, sha256: sha256(records.join('')) };
}

function assertCommitSha(value: string): void {
  if (!/^[a-f0-9]{40}$/i.test(value)) {
    throw new Error('Sites release commit must be a full 40-character Git SHA');
  }
}

async function readHostingManifest(repositoryRoot: string): Promise<{ project_id: string; static: { directory: 'dist' } }> {
  const raw = JSON.parse(await readFile(path.join(repositoryRoot, '.openai', 'hosting.json'), 'utf8')) as {
    project_id?: unknown;
    static?: { directory?: unknown };
  };
  if (typeof raw.project_id !== 'string' || raw.project_id.trim() === '') {
    throw new Error('Sites hosting manifest is missing project_id');
  }
  if (raw.static?.directory !== 'dist') {
    throw new Error('Sites hosting manifest must publish static.directory=dist');
  }
  return { project_id: raw.project_id, static: { directory: 'dist' } };
}

async function assertRequiredAssets(repositoryRoot: string): Promise<void> {
  for (const relativePath of ['dist/index.html', 'dist/_headers', 'dist/wasm/web-ifc.wasm']) {
    const file = path.join(repositoryRoot, relativePath);
    if (!(await stat(file).catch(() => null))?.isFile()) {
      throw new Error(`Required Sites release asset is missing: ${relativePath}`);
    }
  }
}

export async function createReleaseManifest(options: ReleaseManifestOptions): Promise<SitesReleaseManifest> {
  assertCommitSha(options.commitSha);
  if (!options.repository.trim() || !options.ref.trim()) {
    throw new Error('Sites release repository and ref are required');
  }
  const hosting = await readHostingManifest(options.repositoryRoot);
  await assertRequiredAssets(options.repositoryRoot);
  const archive = await digestFile(options.archivePath);
  const entryAsset = await expectedRelease(path.join(options.repositoryRoot, 'dist'));
  const tree = await digestTree(path.join(options.repositoryRoot, 'dist'));
  const manifest: SitesReleaseManifest = {
    schema_version: 1,
    project_id: hosting.project_id,
    commit_sha: options.commitSha.toLowerCase(),
    repository: options.repository,
    ref: options.ref,
    archive,
    static: {
      directory: 'dist',
      entry_asset: entryAsset,
      file_count: tree.fileCount,
      tree_sha256: tree.sha256,
    },
  };
  await writeFile(options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function parseManifest(value: unknown): SitesReleaseManifest {
  const manifest = value as Partial<SitesReleaseManifest>;
  if (
    manifest.schema_version !== 1
    || typeof manifest.project_id !== 'string'
    || typeof manifest.commit_sha !== 'string'
    || typeof manifest.repository !== 'string'
    || typeof manifest.ref !== 'string'
    || typeof manifest.archive?.path !== 'string'
    || typeof manifest.archive?.sha256 !== 'string'
    || typeof manifest.archive?.size_bytes !== 'number'
    || manifest.static?.directory !== 'dist'
    || typeof manifest.static?.tree_sha256 !== 'string'
    || typeof manifest.static?.file_count !== 'number'
    || typeof manifest.static?.entry_asset?.path !== 'string'
    || typeof manifest.static?.entry_asset?.sha256 !== 'string'
  ) {
    throw new Error('Sites release manifest is invalid');
  }
  assertCommitSha(manifest.commit_sha);
  return manifest as SitesReleaseManifest;
}

export async function verifyReleaseArtifact(options: VerifyOptions): Promise<SitesReleaseManifest> {
  const manifest = parseManifest(JSON.parse(await readFile(options.manifestPath, 'utf8')));
  const archive = await digestFile(options.archivePath);
  if (
    archive.path !== manifest.archive.path
    || archive.sha256 !== manifest.archive.sha256
    || archive.size_bytes !== manifest.archive.size_bytes
  ) {
    throw new Error('Sites release archive checksum does not match its manifest');
  }
  if (options.commitSha && manifest.commit_sha !== options.commitSha.toLowerCase()) {
    throw new Error('Sites release commit does not match the requested source commit');
  }
  const hosting = await readHostingManifest(options.repositoryRoot);
  if (hosting.project_id !== manifest.project_id) {
    throw new Error('Sites release project does not match .openai/hosting.json');
  }
  await assertRequiredAssets(options.repositoryRoot);
  const tree = await digestTree(path.join(options.repositoryRoot, 'dist'));
  if (tree.sha256 !== manifest.static.tree_sha256 || tree.fileCount !== manifest.static.file_count) {
    throw new Error('Sites release dist tree does not match its manifest');
  }
  const entryAsset = await expectedRelease(path.join(options.repositoryRoot, 'dist'));
  if (
    entryAsset.path !== manifest.static.entry_asset.path
    || entryAsset.sha256 !== manifest.static.entry_asset.sha256
  ) {
    throw new Error('Sites release entry asset does not match its manifest');
  }
  return manifest;
}

function argumentsMap(values: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key ?? ''}`);
    result.set(key.slice(2), value);
  }
  return result;
}

function required(args: Map<string, string>, name: string): string {
  const value = args.get(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = argumentsMap(rest);
  const repositoryRoot = path.resolve(args.get('repository-root') ?? '.');
  const archivePath = path.resolve(required(args, 'archive'));
  const manifestPath = path.resolve(required(args, 'manifest'));
  if (command === 'create') {
    const manifest = await createReleaseManifest({
      archivePath,
      commitSha: required(args, 'commit'),
      manifestPath,
      ref: required(args, 'ref'),
      repository: required(args, 'repository'),
      repositoryRoot,
    });
    console.log(`Created Sites release manifest for ${manifest.commit_sha}.`);
    return;
  }
  if (command === 'verify') {
    const manifest = await verifyReleaseArtifact({
      archivePath,
      commitSha: args.get('commit'),
      manifestPath,
      repositoryRoot,
    });
    console.log(`Verified Sites release artifact ${manifest.archive.sha256}.`);
    return;
  }
  throw new Error('Usage: sites-release-artifact.ts <create|verify> --archive <path> --manifest <path> [options]');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
