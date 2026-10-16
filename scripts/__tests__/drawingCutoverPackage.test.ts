import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { assertNoTransactionControl, renderManualInstall, validatePayloads, validateDrawingPackage, loadDrawingPackage, requiredPrerequisites } from '../drawing-cutover-package.ts';

const roots: string[] = [];
const tool = new URL('../drawing-cutover-package.ts', import.meta.url);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'drawing-package-')); roots.push(root);
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
  mkdirSync(join(root, 'supabase/candidates'), { recursive: true });
  const entries = ['core', 'sources', 'boundary', 'export'].map((name, index) => {
    const version = `2026101600000${index}`;
    const payload = `-- ${name}\nSELECT ${index};\n`;
    const path = `supabase/migrations/${version}_${name}.sql`;
    const candidate = `supabase/candidates/${name}.sql`;
    writeFileSync(join(root, path), payload); writeFileSync(join(root, candidate), payload);
    return { path, candidate, version, sha256: hash(payload), depends_on: index ? [`2026101600000${index - 1}`] : [] };
  });
  return { root, entries };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('offline exact drawing package', () => {
  it('noProductionApplyMode', () => {
    const result = spawnSync(process.execPath, [fileURLToPath(tool), '--apply'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('validation only');
  });
  it('missingPayloadFailsNotSkips', async () => {
    const { root, entries } = fixture();
    rmSync(join(root, entries[3].path));
    const { validatePayloads } = await import('../drawing-cutover-package.ts');
    expect(() => validatePayloads(root, entries)).toThrow(/missing|ENOENT/i);
  });
  it('hashChangeInvalidatesPackage', async () => {
    const { root, entries } = fixture();
    writeFileSync(join(root, entries[1].path), '-- changed\nSELECT 9;\n');
    const { validatePayloads } = await import('../drawing-cutover-package.ts');
    expect(() => validatePayloads(root, entries)).toThrow(/hash/i);
  });
  it('accepts the actual exact ordered package and embedded whole-text stamps', () => {
    expect(validateDrawingPackage()).toHaveLength(4);
  });
  it('rejects an omitted prerequisite file even when the remaining file hash is valid', () => {
    const { root, entries } = fixture();
    const path = 'supabase/migrations/20260101000010_baseline_schema.sql';
    writeFileSync(join(root, path), 'SELECT 1;\n');
    writeFileSync(join(root, 'supabase/drawing-cutover-package.json'), JSON.stringify({ schema_version: 1,
      payloads: entries, prerequisites: [{ path, sha256: hash('SELECT 1;\n') }], required_prerequisite_identities: requiredPrerequisites }));
    expect(() => loadDrawingPackage(root)).toThrow(/prerequisite.*roster/i);
  });
  it('rejects candidate drift even when the promoted hash matches', () => {
    const { root, entries } = fixture();
    writeFileSync(join(root, entries[0].candidate), 'SELECT 9;\n');
    expect(() => validatePayloads(root, entries)).toThrow(/candidate\/promoted/);
  });
  it('rejects a missing candidate as well as a missing promoted payload', () => {
    const { root, entries } = fixture(); rmSync(join(root, entries[0].candidate));
    expect(() => validatePayloads(root, entries)).toThrow(/ENOENT/);
  });
  it.each(['dependency', 'duplicate', 'hash', 'escape'])('rejects malformed %s before use', variant => {
    const { root, entries } = fixture();
    if (variant === 'dependency') entries[2].depends_on = [entries[0].version];
    if (variant === 'duplicate') entries[2].version = entries[1].version;
    if (variant === 'hash') entries[0].sha256 = 'not-a-hash';
    if (variant === 'escape') entries[0].candidate = 'supabase/candidates/../../../outside.sql';
    expect(() => validatePayloads(root, entries)).toThrow();
  });
  it.each(['BEGIN;', 'COMMIT;', 'ROLLBACK;', 'ABORT;', 'START TRANSACTION;', 'END;'])('rejects explicit top-level transaction control %s', statement => {
    expect(() => assertNoTransactionControl(`SELECT 1;\n${statement}`)).toThrow(/transaction/);
  });
  it('does not confuse PLpgSQL bodies or quoted content with transaction control', () => {
    expect(() => assertNoTransactionControl("CREATE FUNCTION x() RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$; SELECT 'COMMIT;'; -- BEGIN;\n")).not.toThrow();
  });
  it.each(['$cutover_payload_0$', '$install_component$'])('refuses delimiter collision %s without transforming SQL', delimiter => {
    const { root, entries } = fixture();
    const payloads = validatePayloads(root, entries);
    payloads[0].payload = `SELECT '${delimiter}';\n`;
    expect(() => renderManualInstall(payloads)).toThrow(/delimiter/);
  });
});
