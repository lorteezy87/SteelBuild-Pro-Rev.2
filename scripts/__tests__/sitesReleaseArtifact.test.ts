import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createReleaseManifest,
  verifyReleaseArtifact,
} from '../sites-release-artifact.ts';

const temporaryDirectories: string[] = [];

async function fixture(): Promise<{
  archivePath: string;
  manifestPath: string;
  repositoryRoot: string;
}> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'steelbuild-sites-release-'));
  temporaryDirectories.push(repositoryRoot);
  await mkdir(path.join(repositoryRoot, '.openai'), { recursive: true });
  await mkdir(path.join(repositoryRoot, 'dist', 'assets'), { recursive: true });
  await mkdir(path.join(repositoryRoot, 'dist', 'wasm'), { recursive: true });
  await mkdir(path.join(repositoryRoot, 'release'), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, '.openai', 'hosting.json'),
    JSON.stringify({ project_id: 'appgprj_fixture', static: { directory: 'dist' } }),
  );
  await writeFile(
    path.join(repositoryRoot, 'dist', 'index.html'),
    '<script type="module" src="/assets/index-fixture.js"></script>',
  );
  await writeFile(path.join(repositoryRoot, 'dist', 'assets', 'index-fixture.js'), 'fixture();');
  await writeFile(path.join(repositoryRoot, 'dist', '_headers'), '/*\n  X-Content-Type-Options: nosniff\n');
  await writeFile(path.join(repositoryRoot, 'dist', 'wasm', 'web-ifc.wasm'), 'wasm');
  const archivePath = path.join(repositoryRoot, 'release', 'steelbuild-sites.tar.gz');
  const manifestPath = path.join(repositoryRoot, 'release', 'sites-release-manifest.json');
  await writeFile(archivePath, 'immutable archive fixture');
  return { archivePath, manifestPath, repositoryRoot };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Sites release artifact', () => {
  it('binds the Sites archive, source commit, project, and exact entry asset', async () => {
    const paths = await fixture();
    const manifest = await createReleaseManifest({
      ...paths,
      commitSha: 'a'.repeat(40),
      repository: 'lorteezy87/SteelBuild-Pro-Rev.2',
      ref: 'main',
    });

    expect(manifest).toMatchObject({
      schema_version: 1,
      project_id: 'appgprj_fixture',
      commit_sha: 'a'.repeat(40),
      repository: 'lorteezy87/SteelBuild-Pro-Rev.2',
      ref: 'main',
      static: {
        directory: 'dist',
        entry_asset: { path: '/assets/index-fixture.js' },
      },
    });
    expect(manifest.archive.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.static.tree_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(await readFile(paths.manifestPath, 'utf8'))).toEqual(manifest);
    await expect(verifyReleaseArtifact(paths)).resolves.toEqual(manifest);
  });

  it('fails closed when the archive changes after the manifest is written', async () => {
    const paths = await fixture();
    await createReleaseManifest({
      ...paths,
      commitSha: 'b'.repeat(40),
      repository: 'lorteezy87/SteelBuild-Pro-Rev.2',
      ref: 'main',
    });
    await writeFile(paths.archivePath, 'tampered archive');

    await expect(verifyReleaseArtifact(paths)).rejects.toThrow('archive checksum');
  });

  it('rejects a release when required production assets are absent', async () => {
    const paths = await fixture();
    await rm(path.join(paths.repositoryRoot, 'dist', 'wasm', 'web-ifc.wasm'));

    await expect(createReleaseManifest({
      ...paths,
      commitSha: 'c'.repeat(40),
      repository: 'lorteezy87/SteelBuild-Pro-Rev.2',
      ref: 'main',
    })).rejects.toThrow('web-ifc.wasm');
  });
});
