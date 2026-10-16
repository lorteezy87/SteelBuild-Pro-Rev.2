import { chmodSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Release secrets use umask 077; the public app payload must remain readable
// after installation. This shell has no nested frameworks or symlinked assets.
export function normalizeMacBundlePermissions(app) {
  const entries = [];
  function inspect(path) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error('Unexpected symlink in Mac app bundle.');
    if (!stat.isDirectory() && !stat.isFile()) throw new Error('Unexpected special file in Mac app bundle.');
    entries.push({ path, directory: stat.isDirectory() });
    if (stat.isDirectory()) for (const name of readdirSync(path)) inspect(join(path, name));
  }
  const binary = join(app, 'Contents/MacOS/SteelBuildPro');
  if (!lstatSync(join(app, 'Contents/Info.plist')).isFile() || !lstatSync(binary).isFile()) {
    throw new Error('Expected SteelBuild Pro app bundle.');
  }
  inspect(app);
  for (const entry of entries) chmodSync(entry.path, entry.directory ? 0o755 : 0o644);
  chmodSync(binary, 0o755);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Expected app bundle path.');
  normalizeMacBundlePermissions(resolve(process.argv[2]));
}
