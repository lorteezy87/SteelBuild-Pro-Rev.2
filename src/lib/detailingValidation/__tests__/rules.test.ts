import { expect, it } from 'vitest';
import { validateDetailingSheets } from '../rules';
const sheet = { id: 'd1', sheet_number: 'S1', title: 'Steel', revision_number: 'A', file_url: 'app-files/steel.pdf', drawing_set_name: 'Main' };
it('reports missing sheet fields with Rev 2 viewer links', () => {
 const result = validateDetailingSheets([{ ...sheet, title: '', revision_number: null, file_url: null }], [], []);
 expect(result.findings.map(f => f.rule)).toEqual(['missing_revision', 'missing_pdf', 'missing_title']);
 expect(result.findings[0].href).toBe('/DrawingViewer?drawingId=d1');
 expect(result).toMatchObject({checked:1,errors:1,warnings:0,clear:0});
});
it('uses current revision evidence but does not mistake historical revisions for current', () => {
 expect(validateDetailingSheets([{ ...sheet, revision_number:null, file_url:null }], [{drawing_id:'d1',is_current:true,revision_code:'B',file_url:'app-files/b.pdf'}], []).findings).toEqual([]);
 expect(validateDetailingSheets([{ ...sheet, revision_number:null }], [{drawing_id:'d1',is_current:false,revision_code:'B'}], []).findings[0].rule).toBe('missing_revision');
});
it('flags an empty current revision even when a legacy revision number exists', () => {
 expect(validateDetailingSheets([sheet], [{drawing_id:'d1',is_current:true,revision_code:''}], []).findings[0].rule).toBe('missing_revision');
});
it('skips deleted/superseded sheets and only flags active holds without reasons', () => {
 const result=validateDetailingSheets([sheet,{...sheet,id:'old',is_superseded:true},{...sheet,id:'deleted',is_deleted:true}], [], [{drawing_id:'d1',is_active:true,reason:' '},{drawing_id:'d1',is_active:false,reason:null}]);
 expect(result.checked).toBe(1);expect(result.findings.map(f=>f.rule)).toEqual(['hold_no_reason']);
});
it('does not choose arbitrarily between conflicting current revisions', () => {
 expect(validateDetailingSheets([sheet], [{drawing_id:'d1',is_current:true,revision_code:'B'},{drawing_id:'d1',is_current:true,revision_code:'C'}], []).findings[0].rule).toBe('multiple_current_revisions');
});
it('deduplicates record counts when a sheet breaks several rules', () => {
 const result=validateDetailingSheets([{...sheet,title:'',revision_number:'',file_url:''},{...sheet,id:'warn',title:''},{...sheet,id:'ok'}],[],[]);
 expect(result).toMatchObject({checked:3,errors:1,warnings:1,clear:1});
});
