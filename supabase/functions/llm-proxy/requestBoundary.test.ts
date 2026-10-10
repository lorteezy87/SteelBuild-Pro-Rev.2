import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeTelemetryProject, readBoundedJson } from './requestBoundary';

afterEach(() => vi.unstubAllGlobals());

describe('bounded gateway request body', () => {
  it('accepts a JSON object at the byte limit', async () => {
    const body = JSON.stringify({ prompt: 'steel' });
    await expect(readBoundedJson(new Request('https://example.test', { method: 'POST', body }), body.length)).resolves.toEqual({ prompt: 'steel' });
  });
  it.each([undefined, '1'])('rejects oversized UTF-8 input with declared length %s', async (length) => {
    const request = new Request('https://example.test', {
      method: 'POST', body: JSON.stringify({ prompt: 'é'.repeat(20) }),
      headers: length ? { 'content-length': length } : undefined,
    });
    await expect(readBoundedJson(request, 35)).rejects.toMatchObject({ status: 413 });
  });
  it.each(['null', '[]', '42', '{oops'])('rejects invalid object %s', async (body) => {
    await expect(readBoundedJson(new Request('https://example.test', { method: 'POST', body }), 100)).rejects.toMatchObject({ status: 400 });
  });
  it('cancels a streamed body before reading unbounded subsequent chunks', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(20)); }, cancel });
    const request = { headers: new Headers(), body: stream } as Request;
    await expect(readBoundedJson(request, 10)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('project telemetry authorization', () => {
  const config = { url: 'https://example.test', anonKey: 'public-key', authorization: 'Bearer caller-jwt' };
  const projectId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  it('keeps project-less requests compatible', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(authorizeTelemetryProject(undefined, config)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses the authenticated caller for project membership', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(true)); vi.stubGlobal('fetch', fetcher);
    await expect(authorizeTelemetryProject(projectId, config)).resolves.toBe(projectId);
    expect(fetcher).toHaveBeenCalledWith(`${config.url}/rest/v1/rpc/user_has_project_access`, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: config.authorization, apikey: config.anonKey }),
      body: JSON.stringify({ p_project_id: projectId }),
    }));
  });
  it('rejects a foreign project', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(false)));
    await expect(authorizeTelemetryProject(projectId, config)).rejects.toMatchObject({ status: 403 });
  });
  it.each([Response.json({}, { status: 500 }), new Response('not json')])('fails closed on an invalid access response', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(authorizeTelemetryProject(projectId, config)).rejects.toMatchObject({ status: 503 });
  });
  it('fails closed on a network outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(authorizeTelemetryProject(projectId, config)).rejects.toMatchObject({ status: 503 });
  });
});
