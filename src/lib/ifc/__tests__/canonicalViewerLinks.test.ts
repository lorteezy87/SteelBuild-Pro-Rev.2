import { describe, it, expect } from 'vitest';
import { buildCanonicalViewerLinks } from '../canonicalViewerLinks';
const piece = (id: string, extra = {}) => ({ id, piece_mark: 'B1', lifecycle_status: 'shipped', ...extra });
describe('canonical viewer links', () => {
  it('colors an unlinked sibling from a CSV link only when one active lot owns the mark; writes stay explicit', () => {
    const rows = [{ piece_mark: ' b1 ', piece_id: 'p1' }, { element_guid: 'g1', piece_mark: 'B1' }];
    const result = buildCanonicalViewerLinks(rows, [piece('p1')]);
    expect(result.display.get('g1')?.id).toBe('p1');
    expect(result.direct.has('g1')).toBe(false);
  });
  it('does not guess between split lots, even if only one has a roster link', () => {
    const rows = [{ piece_mark: 'B1', piece_id: 'p1' }, { element_guid: 'g1', piece_mark: 'B1' }];
    expect(buildCanonicalViewerLinks(rows, [piece('p1'), piece('p2')]).display.size).toBe(0);
  });
  it('keeps explicit lot identity despite matching-mark siblings and blocks archived or split-parent links', () => {
    const rows = [{ element_guid: 'a', piece_mark: 'B1', piece_id: 'parent' }, { element_guid: 'b', piece_mark: 'B1', piece_id: 'child' }, { element_guid: 'c', piece_mark: 'B1', piece_id: 'gone' }];
    const result = buildCanonicalViewerLinks(rows, [piece('parent'), piece('child', {parent_piece_id:'parent'}), piece('gone', {deleted_at:'2026-01-01'})]);
    expect([...result.direct.keys()]).toEqual(['b']);
    expect([...result.blockedGuids].sort()).toEqual(['a','c']);
  });
  it('rejects conflicting GUID links, tombstoned evidence, and mismatched mark links', () => {
    const rows = [{element_guid:'dup',piece_id:'p1'}, {element_guid:'dup',piece_id:'p2'}, {piece_mark:'B1',piece_id:'p1',deleted_at:'2026-01-01'}, {element_guid:'b',piece_mark:'B1'}, {piece_mark:'C1',piece_id:'p1'}, {element_guid:'c',piece_mark:'C1'}];
    const result = buildCanonicalViewerLinks(rows,[piece('p1'),piece('p2',{piece_mark:'B2'})]);
    expect(result.display.size).toBe(0);
    expect(result.blockedGuids.has('dup')).toBe(true);
  });
});

import { colorFnFor, CANONICAL_PIECE_COLORS } from '../viewerColoring';
import { buildFabLegend } from '../viewerSelection';
it('keeps paint and legend aligned for inferred canonical status, legacy toggle, and unresolved explicit links', () => {
  const rows = [{piece_mark:'B1',piece_id:'p1'}, {element_guid:'a',piece_mark:'B1'}, {element_guid:'a',piece_mark:'B1'}, {element_guid:'b',piece_mark:'C1'}, {element_guid:'bad',piece_mark:'B1',piece_id:'gone'}];
  const links=buildCanonicalViewerLinks(rows,[piece('p1',{on_hold:true})]);
  const options={canonicalPieceByGuid:links.display,blockedGuids:links.blockedGuids,fabByGuid:new Map([['bad','erected']]),fabByMark:new Map([['C1','delivered']]),markByGuid:new Map([['b','C1']]),perPieceFab:false};
  const paint=colorFnFor('fab',options);
  expect(paint({guid:'a'})).toBe(CANONICAL_PIECE_COLORS.hold);
  expect(paint({guid:'bad'})).toBeNull();
  const legend=buildFabLegend({rows,...options});
  expect(legend.find(r=>r.key==='hold')?.count).toBe(1);
  expect(legend.find(r=>r.key==='delivered')?.guids).toEqual(['b']);
  expect(legend.find(r=>r.key==='unlinked')?.guids).toEqual(['bad']);
  expect(buildFabLegend({rows,...options,perPieceFab:true}).find(r=>r.key==='delivered')?.count).toBe(0);
});

it('does not use a conflicting GUID as evidence for unlinked siblings', () => {
 const rows=[{element_guid:'dup',piece_mark:'B1',piece_id:'p1'},{element_guid:'dup',piece_mark:'C1',piece_id:'p2'},{element_guid:'b',piece_mark:'B1'}];
 expect(buildCanonicalViewerLinks(rows,[piece('p1'),piece('p2',{piece_mark:'C1'})]).display.size).toBe(0);
});
