import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedRequest, configuredLimit, fetchWithDeadline } from './edgeOperation';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('configured operation limits',()=>{
  it('defaults only when unset and preserves explicit zero',()=>{vi.stubGlobal('Deno',{env:{get:()=>undefined}});expect(configuredLimit('CAP',100)).toBe(100);vi.stubGlobal('Deno',{env:{get:()=> '0'}});expect(configuredLimit('CAP',100)).toBe(0);});
  it.each(['',' ','-1','NaN','Infinity','1.5','1e3'])('rejects invalid count %j',value=>{vi.stubGlobal('Deno',{env:{get:()=>value}});expect(()=>configuredLimit('CAP',100)).toThrow(/configuration/);});
  it('accepts decimal cost caps',()=>{vi.stubGlobal('Deno',{env:{get:()=> '1.25'}});expect(configuredLimit('CAP',0,false)).toBe(1.25);});
});
describe('bounded network materialization',()=>{
  it.each([undefined,'1'])('counts actual incoming bytes with length %s',async length=>{
    const cancel=vi.fn();const source=new ReadableStream({start(c){c.enqueue(new Uint8Array(4));c.enqueue(new Uint8Array(4));},cancel});
    const req=new Request('https://example.invalid',{method:'POST',headers:length?{'content-length':length}:{},body:source,duplex:'half'} as RequestInit);
    await expect(boundedRequest(req,6)).rejects.toMatchObject({status:413});expect(cancel).toHaveBeenCalled();
  });
  it('preserves a valid request and auth header after bounding',async()=>{const req=await boundedRequest(new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer fixture'},body:'{"ok":true}'}),100);expect(await req.json()).toEqual({ok:true});expect(req.headers.get('authorization')).toBe('Bearer fixture');});
  it('bounds a stalled incoming body and cancels the reader',async()=>{
    vi.useFakeTimers();const cancel=vi.fn();const req=new Request('https://example.invalid',{method:'POST',body:new ReadableStream({cancel}),duplex:'half'} as RequestInit);
    const check=expect(boundedRequest(req,100)).rejects.toMatchObject({status:503});await vi.advanceTimersByTimeAsync(15000);await check;expect(cancel).toHaveBeenCalled();
  });
  it('times out even when fetch ignores its abort signal',async()=>{vi.useFakeTimers();let signal:AbortSignal;vi.stubGlobal('fetch',vi.fn((_input,init)=>{signal=init.signal;return new Promise(()=>{});}));const check=expect(fetchWithDeadline('https://example.invalid',{},50)).rejects.toMatchObject({status:503});await vi.advanceTimersByTimeAsync(50);await check;expect(signal!.aborted).toBe(true);});
  it('deadline includes a stalled response body after successful headers',async()=>{vi.useFakeTimers();const cancel=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));},cancel}))));const check=expect(fetchWithDeadline('https://example.invalid',{},50)).rejects.toMatchObject({status:503});await vi.advanceTimersByTimeAsync(50);await check;expect(cancel).toHaveBeenCalled();});
  it('aborts an oversized advertised response without leaving its network transfer running',async()=>{let signal:AbortSignal;vi.stubGlobal('fetch',vi.fn(async(_input,init)=>{signal=init.signal;return new Response(new ReadableStream(),{headers:{'content-length':'1000'}});}));await expect(fetchWithDeadline('https://example.invalid',{},50,10)).rejects.toMatchObject({status:413});expect(signal!.aborted).toBe(true);});
  it('counts response bytes when the advertised length is false',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('abcdef',{headers:{'content-length':'1'}})));await expect(fetchWithDeadline('https://example.invalid',{},50,3)).rejects.toMatchObject({status:413});});
});
