import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import * as edge from "../../_shared/edgeOperation";
import { classifyAttachmentContent } from "../../_shared/attachmentContent";
import { computeCostUsd } from "../../llm-proxy/providers/cost";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_TOTAL_BYTES, MAX_ATTACHMENT_COUNT, isDangerousAttachment, sanitizeAttachmentName } from "../../_shared/attachments";

const source = ts.createSourceFile("index.ts", readFileSync(new URL("../index.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const executable = ts.transpileModule(source.statements.filter(s => !ts.isImportDeclaration(s)).map(s => s.getText(source)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const PROJECT = "22000000-5eed-4000-8000-000000000002";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
type Handler = (request: Request) => Promise<Response>;

function app(options: { verified?: unknown; failure?: boolean; trustedDomain?: string; ai?: boolean; flag?: boolean; limit?: string; ledgerFailure?: boolean; providerFailure?: boolean; providerError?: string; insertError?: string } = {}) {
  let handler: Handler | undefined;
  const env: Record<string, string> = { SUPABASE_URL: "https://supabase.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-service", EMAIL_WEBHOOK_SECRET: "fixture-webhook", EMAIL_CLASSIFY_DISABLED: options.ai ? "" : "1", OPENAI_API_KEY: "fixture-provider", EMAIL_CLASSIFY_DAILY_LIMIT: options.limit ?? "200", EMAIL_INGEST_UNTRUSTED_ACTION: options.flag ? "flag" : "reject", EMAIL_INGEST_TRUSTED_SENDER_DOMAINS: options.trustedDomain ?? "" };
  const Deno = { env: { get: (key: string) => env[key] }, serve: (value: Handler) => { handler = value; } };
  vi.stubGlobal("Deno", Deno);
  const stored: Record<string, unknown>[] = [];
  const rpc: unknown[] = [];
  const logs: unknown[][] = [];
  const paid: unknown[] = []; const uploads: Request[] = []; const attachments: unknown[] = [];
  const ledger = new Map<string,{id:string;state:string;result:unknown}>();
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init); const url = new URL(request.url);
    if (url.pathname === "/rest/v1/projects") return json([{ id: PROJECT }]);
    // Retain old editable metadata as an adversarial input to the real handler.
    if (url.pathname === "/rest/v1/email_accounts") return json([{ email_address: "project@example.invalid" }]);
    if (url.pathname === "/rest/v1/rpc/get_verified_email_mailboxes") {
      expect(request.method).toBe("POST");
      expect(request.headers.get("authorization")).toBe("Bearer fixture-service");
      rpc.push(await request.json());
      return options.failure ? json({}, 503) : json(options.verified ?? []);
    }
    if (url.pathname === "/rest/v1/rpc/reserve_edge_operation") {
      const args=await request.json(); if(options.ledgerFailure)return json({},503);
      const old=ledger.get(args.p_request_key); if(old)return json({decision:old.state==='completed'?'replay':old.state,operation_id:old.id,result:old.result,response_status:200});
      if(args.p_count_limit>0 && ledger.size>=args.p_count_limit)return json({decision:'limited'});
      const id=crypto.randomUUID();ledger.set(args.p_request_key,{id,state:'pending',result:null});return json({decision:'reserved',operation_id:id});
    }
    if (url.pathname === "/rest/v1/rpc/finish_edge_operation") {
      const args=await request.json();for(const op of ledger.values())if(op.id===args.p_operation_id){op.state=args.p_state;op.result=args.p_result;}return json(true);
    }
    if (url.pathname === "/rest/v1/llm_telemetry") return json([],200);
    if (url.hostname === 'api.openai.com') { paid.push(await request.json());if(options.providerFailure || options.providerError)throw new Error(options.providerError ?? 'accepted but response lost');return json({choices:[{message:{content:JSON.stringify({type:'rfi',confidence:.9})}}],usage:{prompt_tokens:100,completion_tokens:20}}); }
    if (url.pathname.startsWith('/storage/v1/object/')) { uploads.push(request);return json({}); }
    if (url.pathname === '/rest/v1/email_attachments') { attachments.push(await request.json());return json({}); }
    if (url.pathname === "/rest/v1/email_messages") {
      if (request.method !== "POST") return json([]);
      if (options.insertError) return json({ error: options.insertError }, 500);
      stored.push(await request.json()); return json([{ id: "saved-message" }]);
    }
    throw new Error(`Unexpected external request ${url.origin}${url.pathname}`);
  };
  vi.stubGlobal("fetch", fetch);
  const bindings = { Deno, fetch, ...edge, classifyAttachmentContent, computeCostUsd, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_TOTAL_BYTES, MAX_ATTACHMENT_COUNT, isDangerousAttachment, sanitizeAttachmentName, reportError: async () => undefined, console: { log: (...args: unknown[]) => logs.push(args), warn: (...args: unknown[]) => logs.push(args), error: (...args: unknown[]) => logs.push(args) } };
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  return {
    stored, rpc, paid, uploads, attachments, logs, raw: handler,
    run: (body: Record<string, unknown> = {}) => handler!(new Request(`https://functions.example.invalid/email-ingest/${PROJECT}`, { method: "POST", headers: { "x-webhook-secret": "fixture-webhook", "content-type": "application/json" }, body: JSON.stringify({ from: "project@example.invalid", subject: "Fixture", body_text: "Body", message_id: "fixture-id", ...body }) })),
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("inbound response and log privacy", () => {
  const marker = "PRIVATE_MARKER_secret_customer@example.invalid";
  it("does not log rejected sender identities", async () => {
    const f = app({ verified: [{ email_address: "project@example.invalid" }] });
    expect((await f.run({ from: marker })).status).toBe(403);
    expect(JSON.stringify(f.logs)).not.toContain(marker);
    expect(f.logs).toContainEqual(["[email-ingest] sender_rejected"]);
  });
  it("preserves regex fallback without exporting classifier failure content", async () => {
    const f = app({ verified: [{ email_address: "project@example.invalid" }], ai: true, providerError: marker });
    expect((await f.run()).status).toBe(200);
    expect(f.paid).toHaveLength(1);
    expect(JSON.parse(f.stored[0].parsed_metadata as string).classifier).toBe("regex");
    expect(JSON.stringify(f.logs)).not.toContain(marker);
  });
  it("does not expose database response content", async () => {
    const f = app({ verified: [{ email_address: "project@example.invalid" }], insertError: marker });
    const response = await f.run();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to store email message" });
    expect(JSON.stringify(f.logs)).not.toContain(marker);
  });
  it.each(["https://steelbuild-pro.com", "https://attacker.invalid"])("does not grant browser CORS to %s", async origin => {
    const f = app();
    const response = await f.raw!(new Request("https://functions.example.invalid/email-ingest", { method: "OPTIONS", headers: { origin } }));
    expect(response.status).toBe(200);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
});
describe("email-ingest verified mailbox trust", () => {
  it("does not treat an editable mailbox address as sender proof", async () => {
    const fixture = app(); expect((await fixture.run()).status).toBe(403); expect(fixture.stored).toEqual([]);
  });
  it("accepts an explicitly verified mailbox through the authenticated webhook", async () => {
    const fixture = app({ verified: [{ email_address: "project@example.invalid" }] });
    expect((await fixture.run()).status).toBe(200);
    expect(fixture.rpc).toEqual([{ p_project_id: PROJECT }]);
    expect(fixture.stored).toHaveLength(1);
    expect(JSON.parse(fixture.stored[0].parsed_metadata as string)).toMatchObject({ sender_trust: { trusted: true, trust_reason: "mapped_mailbox_sender" } });
  });
  it("preserves the separate operator-configured trusted domain path", async () => {
    const fixture = app({ trustedDomain: "example.invalid" });
    expect((await fixture.run()).status).toBe(200); expect(fixture.stored).toHaveLength(1);
  });
  it.each([{ failure: true }, { verified: {} }, { verified: [{ email_address: "Name <project@example.invalid>" }] }])("fails closed when verified lookup is unavailable or malformed: %j", async options => {
    const fixture = app(options); expect((await fixture.run()).status).toBe(500); expect(fixture.stored).toEqual([]);
  });
});

describe('inbound paid effects and attachment admission',()=>{
 const verified=[{email_address:'project@example.invalid'}];
 it('flag mode performs no paid classification and stores no attachments',async()=>{const f=app({verified,ai:true,flag:true});expect((await f.run({from:'attacker@other.invalid',attachments:[{name:'image.svg',contentType:'image/svg+xml',contentBytes:btoa('<svg></svg>')}]})).status).toBe(200);expect(f.paid).toHaveLength(0);expect(f.uploads).toHaveLength(0);expect(f.stored[0]).toMatchObject({import_status:'rejected',attachment_count:0,has_attachments:false});});
 it('missing ledger degrades to regex without a paid request',async()=>{const f=app({verified,ai:true,ledgerFailure:true});expect((await f.run()).status).toBe(200);expect(f.paid).toHaveLength(0);expect(JSON.parse(f.stored[0].parsed_metadata as string).classifier).toBe('regex');});
 it.each(['-1','1.5','invalid',' '])('invalid classification limit %s sends no paid request',async(limit)=>{const f=app({verified,ai:true,limit});expect((await f.run()).status).toBe(200);expect(f.paid).toHaveLength(0);});
 it('durably caps paid classification despite empty telemetry',async()=>{const f=app({verified,ai:true,limit:'1'});await f.run();await f.run({message_id:'other-id'});expect(f.paid).toHaveLength(1);});
 it('a repeated provider message reuses classification without another paid call',async()=>{const f=app({verified,ai:true});await f.run();await f.run();expect(f.paid).toHaveLength(1);});
 it('ambiguous classification is never automatically redispatched',async()=>{const f=app({verified,ai:true,providerFailure:true});await f.run();await f.run();expect(f.paid).toHaveLength(1);});
 it('rejects SVG and HTML bytes hidden behind a document name',async()=>{const f=app({verified});await f.run({attachments:[{name:'unsafe.svg',contentType:'image/svg+xml',contentBytes:btoa('<svg/>')},{name:'fake.pdf',contentType:'application/pdf',contentBytes:btoa('<html><script>1</script></html>')}]});expect(f.uploads).toHaveLength(0);});
 it('preserves signature-checked PDFs and neutralizes arbitrary MIME on IFC',async()=>{const f=app({verified});await f.run({attachments:[{name:'drawing.pdf',contentType:'application/pdf',contentBytes:btoa('%PDF-1.7 body')},{name:'model.ifc',contentType:'text/plain',contentBytes:btoa('ISO-10303-21;')}]});expect(f.uploads).toHaveLength(2);expect(f.uploads.map(r=>r.headers.get('content-type'))).toEqual(['application/pdf','application/octet-stream']);expect(f.uploads.every(r=>r.headers.get('content-disposition')==='attachment')).toBe(true);});
});

it.each([undefined, '1', String(41 * 1024 * 1024)])('bounds actual email-ingest bytes with Content-Length %s', async length => {
 const f=app({verified:[{email_address:'project@example.invalid'}],ai:true});const chunk=new Uint8Array(4*1024*1024);let sent=0;
 const body=new ReadableStream({pull(c){if(sent++<11)c.enqueue(chunk);else c.close();}});
 const response=await f.raw!(new Request(`https://functions.example.invalid/email-ingest/${PROJECT}`,{method:'POST',headers:{'x-webhook-secret':'fixture-webhook',...(length?{'content-length':length}:{})},body,duplex:'half'} as RequestInit));
 expect(response.status).toBe(413);expect(f.paid).toEqual([]);expect(f.uploads).toEqual([]);expect(f.stored).toEqual([]);
});
