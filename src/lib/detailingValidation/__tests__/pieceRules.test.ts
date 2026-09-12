import { expect, it } from 'vitest';
import type { ValidationPiece } from '../pieceRules';
import { validateDetailingPieces } from '../pieceRules';
const piece: ValidationPiece = { id:'p1', piece_mark:'B1', lot_code:'L1', parent_piece_id:null, deleted_at:null, quantity:2, weight_each_lbs:100, weight_total_lbs:null, lifecycle_status:'not_started' };
const sheets = [{ id:'s1',drawing_set_id:'set1' }, { id:'s2',drawing_set_id:'set1' }];
const sets = [{id:'set1',set_name:'Main steel'}];
const run = (pieces: ValidationPiece[]=[piece], pieceDrawings=[{piece_id:'p1',drawing_id:'s1'}], pieceDrawingSets=[] as {piece_id:string;drawing_set_id:string}[], holds=[] as {drawing_id:string;is_active:boolean}[]) => validateDetailingPieces({pieces,sheets,sets,pieceDrawings,pieceDrawingSets,holds});
it('checks actionable lots, excluding containers, split parents and archived pieces',()=>{
 const result=run([piece,{...piece,id:'parent'},{...piece,id:'child',parent_piece_id:'parent'},{...piece,id:'box',is_container:true},{...piece,id:'deleted',deleted_at:'2026-01-01'}]);
 expect(result.checked).toBe(2);expect(result.findings.every(f=>['p1','child'].includes(f.recordId))).toBe(true);
});
it('flags invalid quantity and uses canonical effective weight rather than stale totals',()=>{
 expect(run([{...piece,quantity:0}]).findings[0].rule).toBe('piece_missing_quantity_or_weight');
 expect(run([{...piece,weight_each_lbs:null}]).findings[0].rule).toBe('piece_missing_quantity_or_weight');
 expect(run([{...piece,weight_each_lbs:0,weight_total_lbs:200}]).findings[0].rule).toBe('piece_missing_quantity_or_weight');
 expect(run([{...piece,weight_each_lbs:NaN,weight_total_lbs:Infinity}]).findings[0].rule).toBe('piece_missing_quantity_or_weight');
 expect(run([{...piece,weight_each_lbs:null,weight_total_lbs:200}]).findings).toEqual([]);
});
it('recognizes set links and detects held sheets through both link types, once per lot',()=>{
 const result=run([{...piece,lifecycle_status:'erected'}],[{piece_id:'p1',drawing_id:'s1'}],[{piece_id:'p1',drawing_set_id:'set1'}],[{drawing_id:'s1',is_active:true},{drawing_id:'s2',is_active:true}]);
 expect(result.findings).toHaveLength(1);expect(result.findings[0]).toMatchObject({rule:'piece_erected_drawing_on_hold',recordLabel:'B1 · L1',href:'/PieceRegister?view=register&piece=p1'});
 expect(result.findings[0].detail).toContain('2 linked sheets');
 expect(run([piece],[],[{piece_id:'p1',drawing_set_id:'set1'}]).findings).toEqual([]);
});
it('does not treat deleted, superseded, foreign, or empty set targets as valid links',()=>{
 const result=validateDetailingPieces({pieces:[piece],sheets:[{id:'s1',drawing_set_id:'set1',is_superseded:true}],sets,pieceDrawings:[{piece_id:'p1',drawing_id:'foreign'}],pieceDrawingSets:[{piece_id:'p1',drawing_set_id:'set1'}],holds:[]});
 expect(result.findings[0].rule).toBe('piece_unlinked');
 const deleted=validateDetailingPieces({pieces:[piece],sheets,sets:[{...sets[0],is_deleted:true}],pieceDrawings:[],pieceDrawingSets:[{piece_id:'p1',drawing_set_id:'set1'}],holds:[]});
 expect(deleted.findings[0].rule).toBe('piece_unlinked');
});
it('does not flag released holds or unerected lots, or claim when the hold began',()=>{
 expect(run([piece],[],[{piece_id:'p1',drawing_set_id:'set1'}],[{drawing_id:'s1',is_active:true}]).findings).toEqual([]);
 expect(run([{...piece,lifecycle_status:'erected'}],undefined,[],[{drawing_id:'s1',is_active:false}]).findings).toEqual([]);
 const result=run([{...piece,lifecycle_status:'erected'}],undefined,[],[{drawing_id:'s1',is_active:true}]);
 expect(result.findings[0].detail).toContain('currently on hold');
});
it('rejects timestamp-archived sheets and sets even when the boolean deletion flag is false',()=>{
 const direct=validateDetailingPieces({pieces:[piece],sheets:[{...sheets[0],is_deleted:false,deleted_at:'2026-09-01'}],sets,pieceDrawings:[{piece_id:'p1',drawing_id:'s1'}],pieceDrawingSets:[],holds:[{drawing_id:'s1',is_active:true}]});
 expect(direct.findings.map(f=>f.rule)).toEqual(['piece_unlinked']);
 const set=validateDetailingPieces({pieces:[piece],sheets,sets:[{...sets[0],is_deleted:false,deleted_at:'2026-09-01'}],pieceDrawings:[],pieceDrawingSets:[{piece_id:'p1',drawing_set_id:'set1'}],holds:[]});
 expect(set.findings.map(f=>f.rule)).toEqual(['piece_unlinked']);
});
