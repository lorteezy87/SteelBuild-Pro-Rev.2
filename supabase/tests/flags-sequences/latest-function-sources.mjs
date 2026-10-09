import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

// Scan the complete migration history, skipping function bodies while finding
// declarations/renames. The inventoried command names have no overloads.
// Keep the original declaration name/file when a later ALTER renames it to impl.
export function resolveFunctionSources(files) {
  const latest = new Map();
  const statements = /^\s*(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|ALTER\s+FUNCTION|DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?)(?:\s+)(?:"public"|public)\."?([a-z_][a-z0-9_]*)"?\s*\(/gim;
  for (const [path, raw] of files) {
    const sql = raw.replaceAll('\r\n', '\n');
    statements.lastIndex = 0;
    let match;
    while ((match = statements.exec(sql))) {
      const [, operation, name] = match;
      if (/^CREATE/i.test(operation)) {
        const tail = sql.slice(match.index).trimStart();
        const delimiter = tail.match(/\$[a-z_0-9]*\$/i)?.[0];
        assert.ok(delimiter, `Dollar-quoted function body required for ${path}:${name}`);
        const open = sql.indexOf(delimiter, match.index);
        const close = sql.indexOf(delimiter, open + delimiter.length);
        assert.ok(close > open, `Unclosed function ${path}:${name}`);
        latest.set(name, { path, sourceName: name, sql: sql.slice(match.index, close + delimiter.length).trimStart() + ';' });
        statements.lastIndex = close + delimiter.length + 1;
      } else {
        const end = sql.indexOf(';', match.index);
        const statement = sql.slice(match.index, end + 1);
        const rename = statement.match(/RENAME\s+TO\s+"?([a-z_][a-z0-9_]*)"?\s*;/i);
        if (rename) {
          assert.ok(latest.has(name), `Missing pre-rename body ${path}:${name}`);
          latest.set(rename[1], latest.get(name));
          latest.delete(name);
        } else if (/^DROP/i.test(operation)) latest.delete(name);
        statements.lastIndex = end + 1;
      }
    }
  }
  return latest;
}

export async function latestFunctionSources(excludedFiles = []) {
  const directory = new URL('../../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.sql') && !excludedFiles.includes(name)).sort();
  return resolveFunctionSources(await Promise.all(files.map(async name => [name, await readFile(new URL(name, directory), 'utf8')])));
}
