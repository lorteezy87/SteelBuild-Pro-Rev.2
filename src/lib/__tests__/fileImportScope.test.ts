import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ invoke:vi.fn(), storage:vi.fn(), upload:vi.fn() }));
vi.mock('@/lib/supabase',()=>({supabase:{functions:{invoke:mocks.invoke},storage:{from:mocks.storage}}}));
vi.mock('@/api/supabaseClient',()=>({integrations:{Core:{UploadFile:mocks.upload}}}));
import { extractShippingTicket, uploadShippingTicket } from '../importShippingTicket';
import { extractRfiLog } from '../importRfiLog';

describe('project-confirmed import file persistence',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({data:{tool_use:{input:{header:{job_number:'123'},items:[],rfis:[]}}},error:null});
    mocks.upload.mockResolvedValue({file_url:'scoped/file.pdf',path:'scoped/file.pdf'});
  });
  it.each(['shipping','rfi'] as const)('extracts a %s PDF from local bytes without creating an unclassified Storage object',async kind=>{
    const file=new File(['%PDF-1.7 fixture'],'ticket.pdf',{type:'application/pdf'});
    if(kind==='shipping') await extractShippingTicket({file});
    else await extractRfiLog({file} as never);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('passes the confirmed shipping-ticket project to the actual upload boundary',async()=>{
    const file=new File(['%PDF fixture'],'ticket.pdf',{type:'application/pdf'});
    await uploadShippingTicket(file,'reviewed-project');
    expect(mocks.upload).toHaveBeenCalledWith({file,projectId:'reviewed-project',workflow:'attachment'});
  });
  it.each(['shipping','rfi'] as const)('rejects invalid local %s inputs before a provider request',async kind=>{
    const file=new File(['html'],'fake.html',{type:'text/html'});
    await expect(kind==='shipping'?extractShippingTicket({file}):extractRfiLog({file} as never)).rejects.toThrow(/PDF/);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
