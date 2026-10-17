import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildCreateSetRequest } from '../requestBuilders.ts';
import { parseDrawingCommandReceipt, parseDrawingCommandResult } from '../responses.ts';
import type { ReviewedDrawingCommand } from '../types.ts';

const id = (n: number) => `abcdef00-0000-4000-8000-${String(n).padStart(12, '0')}`;
const path = `${id(2)}/uploads/${id(4)}/Synthetic_CASE.pdf`;
const draft = (): ReviewedDrawingCommand => ({ version: 1, operation: 'create_set', requestId: id(40).toUpperCase(),
  owner: { actorId: id(10), orgId: id(2), projectId: id(4) }, payload: buildCreateSetRequest({ project_id: id(4),
    set_name: 'E2E New Set', set_number: null, revision_label: '0', discipline: null, issued_date: null, issued_by: null,
    notes: "Robert'); DROP TABLE drawings;--", file_path: path, source_objects: [{ path, token: 'a'.repeat(64) }],
    sheets: [{ action: 'added', sheet_number: 'S1', sheet_title: 'Sheet', revision_code: '0', file_path: path, pdf_page: 2,
      reviewed: true, extraction: { text: { state: 'unavailable' }, callouts: { state: 'unavailable' } } }] }) });
const result = () => ({ applied: true, contract_version: 1, operation: 'create_set', request_id: id(40), project_id: id(4),
  set_id: id(50), payload_sha256: 'b'.repeat(64), revised: 0, added: 1, removed: 0, sheet_count: 1,
  zones_cloned: 0, links_cloned: 0, dependencies_cloned: 0,
  source_pages: [{ drawing_id: id(51), revision_id: id(52), file_path: path, pdf_page: 2 }] });

describe('pure production drawing responses', () => {
  it('parses direct and committed receipt results identically and preserves exact source text', () => {
    expect(parseDrawingCommandResult(result(), draft())).toEqual(result());
    expect(parseDrawingCommandReceipt({ state: 'committed', result: result() }, draft())).toEqual({ state: 'committed', result: result() });
  });
  it.each(['pending', 'not_committed'] as const)('returns only %s without a committed result', state => {
    expect(parseDrawingCommandReceipt({ state }, draft())).toEqual({ state });
    expect(() => parseDrawingCommandReceipt({ state, result: result() }, draft())).toThrow();
  });
  it.each([null, {}, { state: 'unknown' }, { state: 'committed' }, { state: 'committed', result: { ...result(), added: 2 } },
    { state: 'committed', result: result(), retry: true }, { state: 'pending', retry: true }])('rejects malformed receipt %#', value => {
    expect(() => parseDrawingCommandReceipt(value, draft())).toThrow('Drawing command response could not be verified');
  });
  it('allows cross-table coincident UUIDs while refusing altered paths and malformed hashes', () => {
    const coincident = { ...result(), source_pages: [{ ...result().source_pages[0], revision_id: id(51) }] };
    expect(parseDrawingCommandResult(coincident, draft())).toEqual(coincident);
    expect(() => parseDrawingCommandResult({ ...result(), payload_sha256: 'bad' }, draft())).toThrow();
    expect(() => parseDrawingCommandResult({ ...result(), source_pages: [{ ...result().source_pages[0], file_path: path.toLowerCase() }] }, draft())).toThrow();
  });
  it('imports directly under Node type stripping without client initialization or configured app environment', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      "globalThis.fetch=()=>{throw new Error('NETWORK_FORBIDDEN')}; const m=await import('./src/lib/drawingCommands/responses.ts'); console.log(typeof m.parseDrawingCommandResult,typeof m.parseDrawingCommandReceipt)"],
    { cwd: process.cwd(), env: {}, encoding: 'utf8' });
    expect(output.trim()).toBe('function function');
  });
});
