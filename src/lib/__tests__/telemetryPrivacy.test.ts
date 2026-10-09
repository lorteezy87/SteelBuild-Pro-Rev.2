import type { Event } from '@sentry/react';
import { describe, expect, it } from 'vitest';
import { sanitizeBreadcrumb, sanitizeTelemetryEvent, sanitizeTelemetrySpan } from '../telemetryPrivacy';

describe('telemetry privacy boundary', () => {
  const secret = 'synthetic-private-marker';
  it('rebuilds standalone spans without identity, DOM names or attributes', () => {
    const result = sanitizeTelemetrySpan({ span_id: 'b'.repeat(16), trace_id: 'a'.repeat(32), start_timestamp: 1, timestamp: 2,
      description: secret, name: secret, user: { id: secret }, attributes: { secret }, data: { secret }, op: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.timestamp).toBe(2);
  });
  it('removes arbitrary exception/context/request values while preserving location and release', () => {
    const event: Event = { release: 'revision', environment: 'preview', extra: { draft: secret }, user: { email: secret }, tags: { organization: secret },
      message: secret, logentry: { message: secret }, fingerprint: [secret], contexts: { project: { value: secret }, trace: { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), data: { input: secret } } },
      request: { url: `https://steelbuild-pro.com/update-password?code=${secret}#refresh_token=${secret}`, data: secret, headers: { authorization: secret }, cookies: { session: secret } },
      exception: { values: [{ type: 'TypeError', value: secret, stacktrace: { frames: [{ filename: `/assets/code.js?key=${secret}`, function: 'render', lineno: 42, vars: { content: secret }, context_line: secret }] } }] } };
    const result = sanitizeTelemetryEvent(event);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.release).toBe('revision');
    expect(result.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({ filename: '/assets/[asset]', function: 'render', lineno: 42 });
    expect(result.contexts?.trace?.trace_id).toBe('a'.repeat(32));
  });
  it('drops console/UI text and rebuilds allowed network/navigation breadcrumbs', () => {
    expect(sanitizeBreadcrumb({ category: 'console', message: secret })).toBeNull();
    expect(sanitizeBreadcrumb({ category: 'ui.click', message: secret })).toBeNull();
    const value = sanitizeBreadcrumb({ category: 'navigation', message: secret, data: { from: `/Drawings?code=${secret}`, to: `/Settings#${secret}`, payload: secret } });
    expect(value?.data).toEqual({ from: '/Drawings', to: '/Settings' });
    expect(JSON.stringify(value)).not.toContain(secret);
  });
  it('cleans transaction spans and breadcrumbs through the same boundary', () => {
    const result = sanitizeTelemetryEvent({ type: 'transaction', transaction: `/project?name=${secret}`,
      spans: [{ span_id: 'b'.repeat(16), trace_id: 'a'.repeat(32), start_timestamp: 1, timestamp: 2,
        description: secret, data: { 'http.url': `https://example.invalid/#${secret}` }, tags: { private: secret } }],
      breadcrumbs: [{ category: 'console', message: secret }] } as unknown as Event);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.spans?.[0].timestamp).toBe(2);
  });
  it('rejects arbitrary additional event and exception channels', () => {
    const result = sanitizeTelemetryEvent({ release: 'revision', future_context: secret,
      exception: { values: [{ type: secret, value: secret, mechanism: { type: secret, data: { secret } },
        stacktrace: { registers: { secret }, frames: [{ filename: '/assets/app.js', source_link: secret, data: { secret } }] } }] },
    } as unknown as Event);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.exception?.values?.[0].type).toBe('Error');
    expect(result.release).toBe('revision');
  });
  it('does not forward URL credentials or inline/local payload URLs', () => {
    for (const url of [`https://user:${secret}@example.invalid/path?key=${secret}`, `data:text/plain,${secret}`, `blob:https://example.invalid/${secret}`, `file:///${secret}`]) {
      const result = sanitizeTelemetryEvent({ request: { url } });
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });
});
