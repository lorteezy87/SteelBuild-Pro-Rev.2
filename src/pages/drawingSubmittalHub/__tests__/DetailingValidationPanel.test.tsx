// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const backend=vi.hoisted(()=>({fail:false}));
vi.mock('@/lib/detailingValidation/repository',()=>({runDetailingValidation:async()=>{
 if(backend.fail)throw new Error('Read failed');
 return {checked:1,errors:1,warnings:0,clear:0,checkedAt:'2026-09-11T07:00:00Z',findings:[{id:'d1:missing_pdf',drawingId:'d1',sheet:'S1',set:'Main',rule:'missing_pdf',severity:'error',label:'No PDF reference',detail:'Attach a PDF.',href:'/DrawingViewer?drawingId=d1'}]};
}}));
import DetailingValidationPanel from '../DetailingValidationPanel';
afterEach(()=>{cleanup();backend.fail=false;});
function mount(){return render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><DetailingValidationPanel projectId="p1" /></QueryClientProvider></MemoryRouter>);}
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
