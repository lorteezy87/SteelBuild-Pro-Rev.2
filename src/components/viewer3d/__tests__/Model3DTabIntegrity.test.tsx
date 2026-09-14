// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { pieceControlKeys } from '@/lib/pieceControl/queryKeys';
import { CANONICAL_PIECE_COLORS } from '@/lib/ifc/viewerColoring';
const fixture=vi.hoisted(()=>({fail:false,hold:false}));
vi.mock('@/hooks/useCanonicalReportingRealtime',()=>({useCanonicalReportingRealtime:()=>{}}));
vi.mock('@/components/viewer3d/Model3dSyncPanel',()=>({default:():null=>null}));
vi.mock('@/api/supabaseClient',()=>({resolveFileUrl:async(url:string)=>url,integrations:{}}));
vi.mock('@/lib/supabase',()=>({supabase:{from:()=>{
 let project='';
 const q={select:()=>q,eq:(key:string,value:string)=>{if(key==='project_id')project=value;return q;},not:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:{file_url:`https://fixture/${project}`,file_name:`${project}.ifc`},error:null as Error|null})};return q;
}}}));
vi.mock('@/lib/pieceControl/pagedSelect',()=>({fetchAllProjectRowsPaged:async()=>{
 if(fixture.fail)throw new Error('Piece read failed');
 return [{id:'p1',piece_mark:'B1',lifecycle_status:'fabricated',on_hold:fixture.hold}];
}}));
vi.mock('@/components/viewer3d/IfcModelViewer',async()=>{
 const React=await import('react');
 return {default:React.forwardRef(function Viewer({colorFor,onSelect,onColorStats}:{colorFor:(v:{guid:string})=>string|null;onSelect:(guids:string[])=>void;onColorStats:(s:{total:number;colored:number})=>void},ref){
   React.useImperativeHandle(ref,()=>({selectGuids:onSelect,setClipHeight:()=>{}}));
   React.useEffect(()=>onColorStats({total:1,colored:colorFor({guid:'g1'})?1:0}),[colorFor,onColorStats]);
   return <><div data-testid="paint">{colorFor({guid:'g1'})||'native'}</div><button onClick={()=>onSelect(['g1'])}>Pick fixture part</button></>;
 })};
});
import Model3DTab from '../Model3DTab';
let client:QueryClient;
beforeEach(()=>{fixture.fail=false;fixture.hold=false;localStorage.clear();client=new QueryClient({defaultOptions:{queries:{retry:false}}});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})));});
afterEach(()=>{cleanup();client.clear();vi.unstubAllGlobals();});
function app(projectId='A',extra={}) {return <QueryClientProvider client={client}><Model3DTab projectId={projectId} modelMapping={{}} modelElementRows={[{piece_mark:'B1',piece_id:'p1'},{piece_mark:'B1',element_guid:'g1'}]} rosterLoading={false} {...extra}/></QueryClientProvider>;}
describe('3D status integrity',()=>{
 it('updates inferred lot colors after query invalidation without enabling an unlinked logistics action',async()=>{
   render(app());await waitFor(()=>expect(screen.getByTestId('paint').textContent).toBe(CANONICAL_PIECE_COLORS.fabricated));
   fireEvent.click(screen.getByText('Pick fixture part'));
   expect(screen.queryByRole('button',{name:'Ship'})).toBeNull();
   fixture.hold=true;
   await act(async()=>{await client.invalidateQueries({queryKey:pieceControlKeys.canonicalPieces3d('A')});});
   await waitFor(()=>expect(screen.getByTestId('paint').textContent).toBe(CANONICAL_PIECE_COLORS.hold));
   expect(screen.getByText(/1 of 1 rendered parts colored/)).toBeTruthy();
 });
 it('neutralizes stale colors on a failed refresh and recovers only after a successful retry',async()=>{
   render(app());await screen.findByTestId('paint');fixture.fail=true;
   await act(async()=>{await client.invalidateQueries({queryKey:pieceControlKeys.canonicalPieces3d('A')});});
   await screen.findByRole('alert');expect(screen.getByTestId('paint').textContent).toBe('native');
   fixture.fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry status'}));
   await waitFor(()=>expect(screen.getByTestId('paint').textContent).toBe(CANONICAL_PIECE_COLORS.fabricated));
 });
 it('discards previous geometry and selection on project switch and exposes a roster failure',async()=>{
   const view=render(app());await screen.findByText('A.ifc');fireEvent.click(screen.getByText('Pick fixture part'));
   view.rerender(app('B',{rosterError:new Error('Roster failed')}));
   await screen.findByText('B.ifc');expect(screen.queryByText('A.ifc')).toBeNull();
   expect(screen.getByTestId('paint').textContent).toBe('native');
   expect(screen.getByRole('button',{name:'Isolate'}).hasAttribute('disabled')).toBe(true);
 });
});

it('refreshes canonical status without a realtime event while the viewer remains open',async()=>{
 vi.useFakeTimers();
 try {
  render(app());
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
  expect(screen.getByTestId('paint').textContent).toBe(CANONICAL_PIECE_COLORS.fabricated);
  fixture.hold=true;
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_100);});
  expect(screen.getByTestId('paint').textContent).toBe(CANONICAL_PIECE_COLORS.hold);
 } finally {cleanup();vi.useRealTimers();}
});
