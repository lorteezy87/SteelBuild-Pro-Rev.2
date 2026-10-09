import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { corsHeaders, errorResponse, jsonResponse } from '../cors';
import { CORS, json } from '../../account-delete/handlers';
const marker='PRIVATE_MARKER_provider_secret@example.invalid';
type Handler=(req:Request)=>Promise<Response>;
function entry(slug:string, bindings:Record<string,unknown>, whole=false):Handler {
 const file=readFileSync(new URL(`../../${slug}/index.ts`,import.meta.url),'utf8');
 const source=ts.createSourceFile('index.ts',file,ts.ScriptTarget.Latest,true);
 const statements=source.statements.filter(s=>!ts.isImportDeclaration(s)&& (whole || (ts.isExpressionStatement(s)&&s.getText(source).startsWith('Deno.serve'))));
 const code=ts.transpileModule(statements.map(s=>s.getText(source)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 let handler:Handler;const runtime={env:{get:(key:string)=>key==='ALLOWED_ORIGINS'?'https://app.example.invalid':'fixture'},serve:(value:Handler)=>{handler=value;}};
 vi.stubGlobal('Deno',runtime);
 new Function(...Object.keys(bindings),'Deno',code)(...Object.values(bindings),runtime);
 return handler!;
}
afterEach(()=>vi.unstubAllGlobals());
it.each(['email-send','project-export','llm-proxy'])('%s top-level failures do not echo raw provider errors',async slug=>{
 const handler=entry(slug,{handle:async()=>{throw new Error(marker);},reportError:async()=>{},errorResponse,jsonResponse,json:jsonResponse,PROTOCOL_VERSION:8,EdgeBoundaryError:class extends Error{}});
 const response=await handler(new Request('https://edge.example.invalid',{method:'POST',headers:{origin:'https://app.example.invalid'}}));
 expect(response.status).toBe(500);expect(await response.text()).not.toContain(marker);expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.invalid');
});
it.each(['https://app.example.invalid','https://attacker.example.invalid'])('account deletion CORS is exact on preflight and denial for %s',async origin=>{
 const handler=entry('account-delete',{CORS,json,corsHeaders,reportError:async()=>{}},true);
 for(const method of ['OPTIONS','POST']) {
   const response=await handler(new Request('https://edge.example.invalid',{method,headers:{origin}}));
   expect(response.status).toBe(method==='OPTIONS'?200:401);
   expect(response.headers.get('access-control-allow-origin')).toBe(origin==='https://app.example.invalid'?origin:null);
   expect(response.headers.get('vary')).toContain('Origin');
 }
});
