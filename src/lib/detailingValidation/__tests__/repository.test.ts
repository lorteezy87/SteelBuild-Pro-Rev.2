import { beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(()=>({fail:false, failTable:'', withPieces:false, projects: [] as string[]}));
vi.mock('@/lib/supabase',()=>({supabase:{from:(table:string)=>{
 const q={select:()=>q,eq:(key:string,value:string)=>{if(key==='project_id')backend.projects.push(value);return q;},order:()=>q,range:async(start:number)=>{
  if((backend.fail&&table==='drawing_revisions') || (table===backend.failTable && start>=250))return {data:null as Record<string,unknown>[]|null,error:new Error('Revision read failed')};
  if(backend.withPieces && ['pieces','piece_drawings'].includes(table)) return {data:Array.from({length:Math.min(250,Math.max(0,1001-start))},(_,i): Record<string,unknown> => table==='pieces' ? {id:String(start+i),piece_mark:`B${start+i}`,lot_code:'L1',parent_piece_id:null,deleted_at:null,quantity:1,weight_each_lbs:100,weight_total_lbs:null,lifecycle_status:'not_started'} : {piece_id:String(start+i),drawing_id:String(start+i)}),error:null as Error | null};
  return {data:table==='drawings' ? Array.from({length:Math.min(250,Math.max(0,1001-start))},(_,i)=>({id:String(start+i),sheet_number:`S${start+i}`,title:'Steel',revision_number:'A',file_url:'app-files/steel.pdf'})) : [],error:null as Error | null};
 }};return q;
}}}));
import { runDetailingValidation } from '../repository';
beforeEach(()=>{backend.fail=false;backend.failTable='';backend.withPieces=false;backend.projects=[];});
it('checks sheets beyond a server page cap, with every read scoped to the project',async()=>{
 const result=await runDetailingValidation('p1');expect(result.checked).toBe(1001);expect(result.findings).toEqual([]);expect(new Set(backend.projects)).toEqual(new Set(['p1']));
});
it('fails the whole run when revision evidence fails rather than passing empty evidence',async()=>{
 backend.fail=true;await expect(runDetailingValidation('p1')).rejects.toThrow('Revision read failed');
});

it('checks all pieces and links past the server cap, counting sheets and lots separately',async()=>{
 backend.withPieces=true;const result=await runDetailingValidation('p1');
 expect(result).toMatchObject({checked:2002,sheetsChecked:1001,piecesChecked:1001,clear:2002});expect(result.findings).toEqual([]);
});
it('rejects the report when a later piece-link page fails',async()=>{
 backend.withPieces=true;backend.failTable='piece_drawings';await expect(runDetailingValidation('p1')).rejects.toThrow('Revision read failed');
});
