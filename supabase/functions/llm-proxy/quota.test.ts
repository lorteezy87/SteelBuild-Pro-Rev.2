import { afterEach, expect, it, vi } from 'vitest';
import { assertTokenOnlyRequest, reserveLlmOperation } from './quota';
afterEach(()=>vi.unstubAllGlobals());
it('reserves even when both quota dimensions are explicitly disabled',async()=>{
 vi.stubGlobal('Deno',{env:{get:(key:string)=>({SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',LLM_DAILY_COST_LIMIT_USD:'0',LLM_DAILY_REQUEST_LIMIT:'0'}[key])}});
 const fetch=vi.fn(async()=>Response.json({decision:'reserved',operation_id:'11000000-5eed-4000-8000-000000000001'}));vi.stubGlobal('fetch',fetch);
 const req=new Request('https://example.invalid',{headers:{'idempotency-key':'22000000-5eed-4000-8000-000000000002'}});
 await reserveLlmOperation(req,'user',null,{maxTokens:1000},'openai','gpt-4o');
 expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({p_count_limit:0,p_cost_limit:0,p_kind:'llm-proxy'});
});
it('preserves custom JSON function tools',()=>{expect(()=>assertTokenOnlyRequest({tools:[{name:'extract',input_schema:{type:'object',properties:{id:{type:'string'}}}}]})).not.toThrow();});
it('rejects a cache control nested in tool examples',()=>{expect(()=>assertTokenOnlyRequest({tools:[{name:'extract',input_schema:{cache_control:{type:'ephemeral'}}}]})).toThrow(/cache/);});
