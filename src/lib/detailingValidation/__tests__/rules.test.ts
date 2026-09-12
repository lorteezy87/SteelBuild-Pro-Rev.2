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
 // Same number three times, but all in set "Main": not a cross-set duplicate.
 expect(result.findings.some(f=>f.rule==='duplicate_live_sheet')).toBe(false);
});
const inSet=(id:string,sheetNumber:string,title:string,setId:string|null,setName:string)=>({...sheet,id,sheet_number:sheetNumber,title,drawing_set_id:setId,drawing_set_name:setName});
it('warns on each copy of a sheet number live in two sets, naming the other set', () => {
 const result=validateDetailingSheets([inSet('a','S-201','Framing Plan','set-a','Main Steel – L2'),inSet('b','S201','FRAMING  PLAN','set-b','Main Steel – L2 Rev A')],[],[]);
 const dupes=result.findings.filter(f=>f.rule==='duplicate_live_sheet');
 expect(dupes.map(f=>f.recordId).sort()).toEqual(['a','b']);
 expect(dupes.find(f=>f.recordId==='a')?.detail).toBe('Also live in Main Steel – L2 Rev A — same title, likely a replaced copy: check which one is current.');
 expect(dupes.find(f=>f.recordId==='b')?.detail).toBe('Also live in Main Steel – L2 — same title, likely a replaced copy: check which one is current.');
 expect(dupes[0]).toMatchObject({severity:'warning',label:'Sheet number live in more than one set',href:expect.stringContaining('/DrawingViewer?drawingId=')});
 expect(result).toMatchObject({checked:2,errors:0,warnings:2,clear:0});
});
it('says when the shared number is a different drawing', () => {
 const result=validateDetailingSheets([inSet('lad','602E124','LADDER L-4 LAYOUT','set-lad','Ladders - Bldg. 2'),inSet('br','602E124','GUARDRAIL LAYOUT','set-br','Balcony Rail - Bldg. 2'),inSet('ar','602E124','Guardrail Layout','set-ar','Added Rails - Bldg. 2')],[],[]);
 const detail=(id:string)=>result.findings.find(f=>f.recordId===id&&f.rule==='duplicate_live_sheet')?.detail;
 expect(detail('lad')).toBe('Also live in Balcony Rail - Bldg. 2 and Added Rails - Bldg. 2 — different title: the same number is used for a different drawing.');
 expect(detail('br')).toBe('Also live in Ladders - Bldg. 2 (different title) and Added Rails - Bldg. 2 (same title) — check which copy is current.');
});
it('names a same-and-different title mix in one other set without claiming a title is missing', () => {
 const a=inSet('a','S-201','FRAMING PLAN','set-a','Main Steel – L2');
 const same=inSet('b1','S-201','FRAMING PLAN','set-b','Main Steel Rev A');
 const different=inSet('b2','S201','CONNECTION DETAILS','set-b','Main Steel Rev A');
 const detail=(sheets:Array<typeof a>)=>validateDetailingSheets(sheets,[],[]).findings.find(f=>f.recordId==='a'&&f.rule==='duplicate_live_sheet')?.detail;
 expect(detail([a,same,different])).toBe('Also live in Main Steel Rev A (same and different titles) — check which copy is current.');
 expect(detail([a,different,same])).toBe('Also live in Main Steel Rev A (same and different titles) — check which copy is current.');
 // A copy that really has no title still says so.
 expect(detail([a,same,{...different,title:''}])).toBe('Also live in Main Steel Rev A (title missing) — check which copy is current.');
});
it('does not flag a copy once the other is superseded or deleted, nor a legacy row of the same set', () => {
 const a=inSet('a','S-201','Framing Plan','set-a','Main Steel – L2');
 for (const other of [{...inSet('b','S-201','Framing Plan','set-b','Rev A'),is_superseded:true},{...inSet('b','S-201','Framing Plan','set-b','Rev A'),is_deleted:true},inSet('legacy','S-201','Framing Plan',null,'Main Steel – L2')]) {
  expect(validateDetailingSheets([a,other],[],[]).findings.filter(f=>f.rule==='duplicate_live_sheet')).toEqual([]);
 }
});
