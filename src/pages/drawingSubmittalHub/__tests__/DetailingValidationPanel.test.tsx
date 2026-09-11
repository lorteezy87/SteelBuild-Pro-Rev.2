// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const backend=vi.hoisted(()=>({fail:false,holdFinding:false}));
vi.mock('@/lib/detailingValidation/repository',()=>({runDetailingValidation:async()=>{
 if(backend.fail)throw new Error('Read failed');
 return {checked:2,sheetsChecked:1,piecesChecked:1,errors:2,warnings:0,clear:0,checkedAt:'2026-09-11T07:00:00Z',findings:[{id:'d1:missing_pdf',recordType:'sheet',recordId:'d1',recordLabel:'S1',set:'Main',rule:'missing_pdf',severity:'error',label:'No PDF reference',detail:'Attach a PDF.',href:'/DrawingViewer?drawingId=d1'},{id:'piece:p1:piece_unlinked',recordType:'piece',recordId:'p1',recordLabel:'B1 · L1',set:'Unassigned',rule:'piece_unlinked',severity:'error',label:'No active drawing link',detail:'Link a drawing set.',href:'/PieceRegister?view=register&piece=p1'},...(backend.holdFinding?[{id:'d2:hold_no_reason',recordType:'sheet',recordId:'d2',recordLabel:'S2',set:'Main',rule:'hold_no_reason',severity:'error',label:'Hold without a reason',detail:'An active hold has no recorded reason.',href:'/DrawingViewer?drawingId=d2'}]:[])]};
}}));
import DetailingValidationPanel from '../DetailingValidationPanel';
afterEach(()=>{cleanup();backend.fail=false;backend.holdFinding=false;});
function mount(entry='/'){return render(<MemoryRouter initialEntries={[entry]}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><DetailingValidationPanel projectId="p1" /></QueryClientProvider></MemoryRouter>);}
it('runs only on request and lets the user filter findings and open the record',async()=>{
 mount();expect(screen.getByText('Not run yet')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Run validation'}));
 const link=await screen.findByRole('link',{name:'S1'});expect(link.getAttribute('href')).toBe('/DrawingViewer?drawingId=d1');
 fireEvent.change(screen.getByRole('searchbox',{name:'Search validation findings'}),{target:{value:'unmatched'}});
 expect(screen.getByText('No findings match these filters.')).toBeTruthy();
});
it('clears the previous success on rerun failure and supports retry',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Run validation'}));await screen.findByRole('link',{name:'S1'});
 backend.fail=true;fireEvent.click(screen.getByRole('button',{name:'Re-run validation'}));
 expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByRole('link',{name:'S1'})).toBeNull();
 backend.fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry validation'}));await screen.findByRole('link',{name:'S1'});
});

it('filters piece findings and links the exact lot rather than searching a repeated mark',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Run validation'}));await screen.findByRole('link',{name:'B1 · L1'});
 fireEvent.change(screen.getByRole('combobox',{name:'Validation record type'}),{target:{value:'piece'}});
 expect(screen.queryByRole('link',{name:'S1'})).toBeNull();
 expect(screen.getByRole('link',{name:'B1 · L1'}).getAttribute('href')).toBe('/PieceRegister?view=register&piece=p1');
 expect(screen.getByText(/1 sheets · 1 piece lots/)).toBeTruthy();
});

// An absolute in-hub link: it opens the hub's Holds tab from anywhere, and
// never re-pins a ?projectId= / ?project= the route already synced.
it.each([
 ['/DrawingSubmittalHub?hub_tab=validation&projectId=P&project=P'],
 ['/SomewhereElse?project=P'],
])('links a hold without a reason to the hub Holds tab without re-pinning the project (from %s)',async(entry)=>{
 backend.holdFinding=true;mount(entry);fireEvent.click(screen.getByRole('button',{name:'Run validation'}));
 const link=await screen.findByRole('link',{name:'Open Holds & Blockers'});
 expect(link.getAttribute('href')).toBe('/DrawingSubmittalHub?hub_tab=holds');
});
