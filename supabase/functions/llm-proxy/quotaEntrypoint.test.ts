import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import * as edge from '../_shared/edgeOperation';
import * as costs from './providers/cost';
import * as quota from './quota';
import { LLMError } from './providers/types';
import { getProviderForUseCase } from './router';
import { normalizeRequestLimits } from './requestLimits';
import { authorizeTelemetryProject, readBoundedJson, RequestBoundaryError } from './requestBoundary';
import { mfaDenialForVerifiedUser } from '../_shared/mfa';
import { corsHeaders, jsonResponse } from '../_shared/cors';

// Execute the actual handler and provider adapter. Mock only Deno's module/runtime
// boundary and remote HTTP; quota SQL is exercised separately by PGlite.
function moduleBody(path: string) {
  const source = ts.createSourceFile('index.ts', readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  return ts.transpileModule(source.statements.filter(s => !ts.isImportDeclaration(s))
    .map(s => s.getText(source).replace(/^export /, '')).join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
const user = '11000000-5eed-4000-8000-000000000001';
const project = '22000000-5eed-4000-8000-000000000002';
const key = '33000000-5eed-4000-8000-000000000003';
const key2 = '44000000-5eed-4000-8000-000000000004';
const authorization = `Bearer header.${Buffer.from(JSON.stringify({sub:user,aal:'aal2'})).toString('base64url')}.signature`;
const json = (value: unknown, status = 200) => Response.json(value, { status });
function fixture(options: { count?: string; cost?: string; unavailable?: boolean; unknown?: boolean; missingUsage?: boolean; access?: boolean } = {}) {
  let handle: (req: Request) => Promise<Response>;
  const env: Record<string,string> = { SUPABASE_URL:'https://db.example.invalid', SUPABASE_ANON_KEY:'anon', SUPABASE_SERVICE_ROLE_KEY:'service', OPENAI_API_KEY:'provider', ANTHROPIC_API_KEY:'provider', LLM_DAILY_REQUEST_LIMIT: options.count ?? '100', LLM_DAILY_COST_LIMIT_USD: options.cost ?? '5' };
  const runtime = { env:{get:(name:string)=>env[name]}, serve:(handler:typeof handle)=>{handle=handler;} };
  vi.stubGlobal('Deno',runtime);
  const calls: Record<string,unknown>[] = [];
  const reserves: Record<string,unknown>[] = [];
  const finishes: Record<string,unknown>[] = [];
  const operations = new Map<string,{id:string;hash:string;state:string;result:unknown}>();
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo | URL, init?:RequestInit)=>{
    const request = new Request(input,init); const url = new URL(request.url);
    if(url.pathname==='/auth/v1/user') return json({id:user,factors:[]});
    if(url.pathname.endsWith('/user_has_project_access')) {
      expect(request.headers.get('authorization')).toBe(authorization);
      return json(options.access ?? true);
    }
    if(url.pathname.endsWith('/get_llm_usage_window')) return json([{request_count:0,cost_sum:0}]);
    if(url.pathname.endsWith('/reserve_edge_operation')) {
      const args=await request.json(); reserves.push(args);
      if(options.unavailable)return json({},503);
      const prior=operations.get(args.p_request_key);
      if(prior)return json({decision:prior.hash!==args.p_fingerprint?'conflict':prior.state==='completed'?'replay':prior.state,operation_id:prior.id,result:prior.result,response_status:200});
      if(args.p_count_limit>0&&operations.size>=args.p_count_limit)return json({decision:'limited'});
      const id=crypto.randomUUID();operations.set(args.p_request_key,{id,hash:args.p_fingerprint,state:'pending',result:null});return json({decision:'reserved',operation_id:id});
    }
    if(url.pathname.endsWith('/finish_edge_operation')) {
      const args=await request.json(); finishes.push(args);
      for(const op of operations.values())if(op.id===args.p_operation_id){op.state=args.p_state;op.result=args.p_result;}
      return json(true);
    }
    if(url.pathname==='/rest/v1/llm_telemetry')return new Response(null,{status:201});
    if(url.hostname==='api.openai.com') {
      calls.push(await request.json());
      if(options.unknown)throw new Error('response lost after provider accepted');
      return json({choices:[{message:{content:'result'}}],...(options.missingUsage?{}:{usage:{prompt_tokens:100,completion_tokens:20}})});
    }
    throw new Error(`Unexpected HTTP ${url}`);
  }));
  const bindings:Record<string,unknown>={Deno:runtime, ...edge,...costs,...quota,LLMError,getProviderForUseCase,normalizeRequestLimits,authorizeTelemetryProject,readBoundedJson,RequestBoundaryError,mfaDenialForVerifiedUser,corsHeaders,jsonResponse,reportError:vi.fn()};
  const provider = new Function(...Object.keys(bindings),`${moduleBody('./providers/openai.ts')}; return openaiClient;`)(...Object.values(bindings));
  bindings.openaiClient=provider; bindings.anthropicClient=provider;
  new Function(...Object.keys(bindings),moduleBody('./index.ts'))(...Object.values(bindings));
  return {calls,reserves,finishes,raw:handle!,run:(id:string | null=key,override:Record<string,unknown>={})=>handle(new Request('https://edge.example.invalid',{method:'POST',headers:{authorization,'content-type':'application/json',...(id?{'idempotency-key':id}:{})},body:JSON.stringify({provider:'openai',model:'gpt-4o-mini',prompt:'classify',project_id:project,...override})}))};
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('durable AI dispatch boundary',()=>{
  it('replays a successful operation without a second paid call',async()=>{const f=fixture();const first=await f.run();expect(first.status).toBe(200);expect(await (await f.run()).json()).toEqual(await first.json());expect(f.calls).toHaveLength(1);});
  it('rejects a missing operation key before the provider',async()=>{const f=fixture();expect((await f.run(null)).status).toBe(400);expect(f.calls).toHaveLength(0);});
  it('rejects changed content under the same key',async()=>{const f=fixture();await f.run();expect((await f.run(key,{prompt:'different'})).status).toBe(409);expect(f.calls).toHaveLength(1);});
  it('counts the private reservation even when telemetry is mutable',async()=>{const f=fixture({count:'1'});await f.run();expect((await f.run(key2)).status).toBe(429);expect(f.calls).toHaveLength(1);});
  it.each(['-1','1.5','garbage',' '])('fails closed for configured count %s',async(count)=>{const f=fixture({count});expect((await f.run()).status).toBe(503);expect(f.calls).toHaveLength(0);});
  it('does not dispatch when the ledger is unavailable',async()=>{const f=fixture({unavailable:true});expect((await f.run()).status).toBe(503);expect(f.calls).toHaveLength(0);});
  it('never redispatches an uncertain provider outcome',async()=>{const f=fixture({unknown:true});expect((await f.run()).status).toBe(409);expect((await f.run()).status).toBe(409);expect(f.calls).toHaveLength(1);});
  it('reserves full possible model input and settles only observed usage',async()=>{const f=fixture();await f.run();expect(f.reserves[0].p_reserved_cost).toBeCloseTo(.0198,6);expect(f.finishes[0].p_actual_cost).toBeCloseTo(.000027,6);});
  it('missing provider usage keeps the reservation',async()=>{const f=fixture({missingUsage:true});await f.run();expect(f.finishes[0].p_actual_cost).toBeNull();});
  it('rechecks project authorization before replay',async()=>{const f=fixture({access:false});expect((await f.run()).status).toBe(403);expect(f.reserves).toHaveLength(0);expect(f.calls).toHaveLength(0);});
  it('rejects separately billed native tools and prompt cache controls',async()=>{const f=fixture();expect((await f.run(key,{tools:[{type:'web_search_20250305',name:'web_search'}]})).status).toBe(400);expect((await f.run(key,{messages:[{role:'user',content:[{type:'text',text:'x',cache_control:{type:'ephemeral'}}]}]})).status).toBe(400);expect(f.calls).toHaveLength(0);});
});

it.each([undefined,'1',String(25*1024*1024)])('bounds actual LLM bytes with Content-Length %s',async length=>{
 const f=fixture();const chunk=new Uint8Array(4*1024*1024);let sent=0;const body=new ReadableStream({pull(c){if(sent++<7)c.enqueue(chunk);else c.close();}});
 const response=await f.raw(new Request('https://edge.example.invalid',{method:'POST',headers:{authorization,...(length?{'content-length':length}:{})},body,duplex:'half'} as RequestInit));
 expect(response.status).toBe(413);expect(f.calls).toEqual([]);expect(f.reserves).toEqual([]);
});
