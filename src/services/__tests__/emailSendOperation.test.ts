import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture-token'}}})}}}));
vi.mock('@/lib/env',()=>({env:{supabaseUrl:'https://db.example.invalid'}}));
import { sendEmail } from '../emailSendService';
afterEach(()=>vi.unstubAllGlobals());
it('sends the caller operation key unchanged across a transport retry',async()=>{
 const fetch=vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(Response.json({success:true,message_id:'saved'}));vi.stubGlobal('fetch',fetch);
 const body={project_id:'11000000-5eed-4000-8000-000000000001',to:['gc@example.invalid'],subject:'Review',body_text:'Steel'};const key='22000000-5eed-4000-8000-000000000002';
 expect((await sendEmail(body,key)).success).toBe(false);expect((await sendEmail(body,key)).success).toBe(true);
 expect(fetch.mock.calls.map(([,init])=>init.headers['Idempotency-Key'])).toEqual([key,key]);
});
