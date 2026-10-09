import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
const marker='PRIVATE_MARKER_password_token_customer@example.invalid';
type Event = Record<string, unknown>;
function reporter(options:{loadFailure?:boolean;captureFailure?:boolean;flushFailure?:boolean;consoleFailure?:boolean;loadGate?:Promise<void>;flushGate?:Promise<void>}={}) {
 const sent:Event[]=[];let init:Record<string,unknown>={};
 const deliver=(event:Event)=>{
   if(options.captureFailure)throw new Error(marker);
   // Simulate ambient SDK context/breadcrumbs added after the application call.
   const enriched={...event,request:{headers:{authorization:marker},data:marker},user:{email:marker},breadcrumbs:[{message:marker}],extra:{body:marker},contexts:{request:marker}};
   const clean=typeof init.beforeSend==='function'?init.beforeSend(enriched,{}):enriched;
   if(clean)sent.push(clean);
 };
 const sdk={init:vi.fn((value)=>{init=value;}),captureEvent:vi.fn(deliver),captureException:vi.fn((err:Error,hint:Event)=>deliver({...hint,exception:{message:err.message,stack:err.stack}})),flush:vi.fn(async()=>{if(options.flushFailure)throw new Error(marker);await options.flushGate;return true;})};
 const loadSdk=vi.fn(async()=>{if(options.loadFailure)throw new Error(marker);await options.loadGate;return sdk;});
 const log=vi.fn(()=>{if(options.consoleFailure)throw new Error(marker);});
 let text=readFileSync(new URL('../reportError.ts',import.meta.url),'utf8').replace(/import\("npm:@sentry\/deno@11\.4\.0"\)/g,'loadSdk()');
 const source=ts.createSourceFile('reportError.ts',text,ts.ScriptTarget.Latest,true);
 text=ts.transpileModule(source.statements.map(s=>s.getText(source).replace(/^export /,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const Deno={env:{get:(key:string)=>key==='EDGE_SENTRY_DSN'?'https://public@example.ingest.sentry.io/1':key==='EDGE_SENTRY_ENVIRONMENT'?marker:undefined}};
 const report=new Function('loadSdk','Deno','console',`${text};return reportError;`)(loadSdk,Deno,{error:log});
 return {report,sent,sdk,log,getInit:()=>init};
}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('exports only safe error metadata and a shared generated correlation ID',async()=>{
 const f=reporter();const error=new Error(marker);error.stack=marker;
 await f.report(error,'stripe-billing',{path:'/webhook',eventType:'checkout.session.completed',unhandled:true,token:marker,nested:{message:marker},request:new Request('https://example.invalid/?token='+marker)});
 expect(JSON.stringify(f.log.mock.calls)).not.toContain(marker);expect(JSON.stringify(f.sent)).not.toContain(marker);
 expect(f.sent).toHaveLength(1);expect(f.sent[0]).toMatchObject({message:'Edge operation failed',tags:{edge_function:'stripe-billing',event_type:'checkout.session.completed',path:'/webhook',unhandled:'true'}});
 expect(f.sent[0].event_id).toMatch(/^[a-f0-9]{32}$/);expect(JSON.stringify(f.log.mock.calls)).toContain(f.sent[0].event_id);
 expect(f.sent[0]).not.toHaveProperty('exception');expect(f.sent[0]).not.toHaveProperty('request');expect(f.sent[0]).not.toHaveProperty('extra');expect(f.sent[0]).not.toHaveProperty('user');expect(f.sent[0]).not.toHaveProperty('breadcrumbs');
 expect(f.sdk.captureException).not.toHaveBeenCalled();expect(f.sdk.flush).toHaveBeenCalledWith(2000);
});
it('does not stringify arbitrary values or admit unrecognized function/context tags',async()=>{
 const f=reporter();const dangerous={toString(){throw new Error(marker);}};
 await expect(f.report(dangerous,marker,{eventType:marker,path:marker,error_kind:marker})).resolves.toBeUndefined();
 expect(JSON.stringify(f.sent)).not.toContain(marker);expect(f.sent[0]).toMatchObject({tags:{edge_function:'unknown-edge'}});
});
it('disables automatic context, breadcrumbs, tracing and default integrations',async()=>{
 const f=reporter();await f.report(new TypeError(marker),'email-send');
 expect(f.getInit()).toMatchObject({defaultIntegrations:false,sendDefaultPii:false,attachStacktrace:false,maxBreadcrumbs:0,tracesSampleRate:0});
 expect(f.getInit().environment).toBe('production');
});
it.each(['loadFailure','captureFailure','flushFailure','consoleFailure'] as const)('remains best effort when %s fails',async field=>{const f=reporter({[field]:true});await expect(f.report(new Error(marker),'email-send')).resolves.toBeUndefined();expect(JSON.stringify(f.log.mock.calls)).not.toContain(marker);});

it.each(['loadGate','flushGate'] as const)('does not hold the caller beyond the reporting deadline during %s',async gate=>{
 vi.useFakeTimers();let release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 const f=reporter({[gate]:pending});let settled=false;
 const done=f.report(new Error(marker),'email-send').then(()=>{settled=true;});
 await vi.advanceTimersByTimeAsync(2499);expect(settled).toBe(false);
 await vi.advanceTimersByTimeAsync(1);await done;expect(settled).toBe(true);
 release();await vi.advanceTimersByTimeAsync(0);
 if(gate==='loadGate')expect(f.sdk.captureEvent).not.toHaveBeenCalled();
 else expect(f.sdk.captureEvent).toHaveBeenCalledTimes(1);
 expect(JSON.stringify(f.sent)).not.toContain(marker);
});
