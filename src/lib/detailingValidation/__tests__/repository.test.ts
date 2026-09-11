import { beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(()=>({fail:false, projects: [] as string[]}));
vi.mock('@/lib/supabase',()=>({supabase:{from:(table:string)=>{
 const q={select:()=>q,eq:(key:string,value:string)=>{if(key==='project_id')backend.projects.push(value);return q;},order:()=>q,range:async(start:number)=>{
  if(backend.fail&&table==='drawing_revisions')return {data:null as Record<string,unknown>[]|null,error:new Error('Revision read failed')};
  return {data:table==='drawings' ? Array.from({length:Math.min(250,Math.max(0,1001-start))},(_,i)=>({id:String(start+i),sheet_number:`S${start+i}`,title:'Steel',revision_number:'A',file_url:'app-files/steel.pdf'})) : [],error:null as Error | null};
 }};return q;
}}}));
import { runDetailingValidation } from '../repository';
beforeEach(()=>{backend.fail=false;backend.projects=[];});
it('checks sheets beyond a server page cap, with every read scoped to the project',async()=>{
 const result=await runDetailingValidation('p1');expect(result.checked).toBe(1001);expect(result.findings).toEqual([]);expect(new Set(backend.projects)).toEqual(new Set(['p1']));
});
it('fails the whole run when revision evidence fails rather than passing empty evidence',async()=>{
 backend.fail=true;await expect(runDetailingValidation('p1')).rejects.toThrow('Revision read failed');
});
