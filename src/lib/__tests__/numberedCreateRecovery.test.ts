import { beforeEach, expect, it } from 'vitest';
import { getActiveOrgGeneration, setActiveOrgId } from '../activeOrg';
import { clearNumberedCreateRecovery, completeNumberedCreateRecovery, getNumberedCreateRecovery, retainNumberedCreateRecovery } from '../numberedCreateRecovery';

beforeEach(() => { setActiveOrgId(null); setActiveOrgId('org-a'); });
it('never lets a late completed operation replace a new reserved draft', () => {
  const generation = getActiveOrgGeneration();
  retainNumberedCreateRecovery('draft', 'p1', 'old', { title: 'Old' }, generation);
  completeNumberedCreateRecovery('draft', 'p1', 'old', generation);
  retainNumberedCreateRecovery('draft', 'p1', 'new', { title: 'New' }, generation);
  retainNumberedCreateRecovery('draft', 'p1', 'old', { title: 'Old' }, generation);
  completeNumberedCreateRecovery('draft', 'p1', 'old', generation);
  expect(getNumberedCreateRecovery('draft', 'p1')).toEqual({ operation: 'new', payload: { title: 'New' } });
});
it('releases a definite rejection without preventing correction under the same operation', () => {
  const generation = getActiveOrgGeneration();
  const reservation = retainNumberedCreateRecovery('draft', 'p1', 'operation', { title: 'Rejected' }, generation);
  clearNumberedCreateRecovery('draft', 'p1', 'operation', generation, reservation);
  retainNumberedCreateRecovery('draft', 'p1', 'operation', { title: 'Corrected' }, generation);
  expect(getNumberedCreateRecovery('draft', 'p1')?.payload.title).toBe('Corrected');
});
it('does not replace a different active reservation or accept late workspace replies', () => {
  const generation = getActiveOrgGeneration();
  retainNumberedCreateRecovery('draft', 'p1', 'first', { title: 'First' }, generation);
  retainNumberedCreateRecovery('draft', 'p1', 'second', { title: 'Second' }, generation);
  expect(getNumberedCreateRecovery('draft', 'p1')?.operation).toBe('first');
  setActiveOrgId(null); setActiveOrgId('org-a');
  retainNumberedCreateRecovery('draft', 'p1', 'first', { title: 'Private' }, generation);
  expect(getNumberedCreateRecovery('draft', 'p1')).toBeNull();
});

it('keeps the newer attempt reserved when an older attempt of the same operation rejects', () => {
  const generation = getActiveOrgGeneration();
  const original = retainNumberedCreateRecovery('draft', 'p1', 'operation', { title: 'Original' }, generation);
  const retry = retainNumberedCreateRecovery('draft', 'p1', 'operation', { title: 'Original' }, generation);
  expect(retry).not.toBe(original);
  clearNumberedCreateRecovery('draft', 'p1', 'operation', generation, original);
  clearNumberedCreateRecovery('draft', 'p1', 'operation', generation, undefined);
  expect(getNumberedCreateRecovery('draft', 'p1')?.operation).toBe('operation');
  clearNumberedCreateRecovery('draft', 'p1', 'operation', generation, retry);
  expect(getNumberedCreateRecovery('draft', 'p1')).toBeNull();
});

it('refuses reservations owned by a different draft or already acknowledged as saved', () => {
  const generation = getActiveOrgGeneration();
  expect(retainNumberedCreateRecovery('draft', 'p1', 'first', { title: 'First' }, generation)).toEqual(expect.any(Number));
  expect(retainNumberedCreateRecovery('draft', 'p1', 'second', { title: 'Second' }, generation)).toBeUndefined();
  completeNumberedCreateRecovery('draft', 'p1', 'first', generation);
  expect(retainNumberedCreateRecovery('draft', 'p1', 'first', { title: 'Late reply' }, generation)).toBeUndefined();
  expect(retainNumberedCreateRecovery('draft', 'p1', 'second', { title: 'Second' }, generation)).toEqual(expect.any(Number));
});
