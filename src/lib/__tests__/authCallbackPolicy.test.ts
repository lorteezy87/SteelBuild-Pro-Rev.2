// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { finishAuthCallback, inspectAuthCallbackUrl, redactUrl, rejectImplicitAuthCallback } from '../authCallbackPolicy';
import { handleNativeAuthCallback } from '../native/authCallback';

describe('PKCE callback URL boundary', () => {
  it('preserves the valid code for SDK exchange but removes it from the clean route', () => {
    expect(inspectAuthCallbackUrl('https://steelbuild-pro.com/update-password?code=valid-code&theme=dark'))
      .toMatchObject({ code: 'valid-code', rejected: false, recovery: true, path: '/update-password?theme=dark' });
  });
  it.each([
    '/#access_token=secret&refresh_token=secret', '/?access_token=secret&code=code',
    '/?code=a&code=b', '/?code=', '/?code=%0Asecret', '/Projects?code=secret',
    '/#code=secret', '/?error_description=secret', '/#provider_token=secret',
  ])('rejects unsolicited or ambiguous callback %s', path => {
    const value = inspectAuthCallbackUrl(`https://steelbuild-pro.com${path}`);
    expect(value.rejected).toBe(true);
    expect(value.code).toBeNull();
    expect(value.cleanUrl).not.toContain('secret');
  });
  it('rejects and scrubs bearer material before SDK creation while keeping ordinary links', () => {
    window.history.replaceState({}, '', '/?project=123#access_token=secret&refresh_token=secret');
    rejectImplicitAuthCallback();
    expect(window.location.href).not.toContain('secret');
    expect(window.location.search).toBe('?project=123');
    expect(inspectAuthCallbackUrl('https://steelbuild-pro.com/Drawings?project=123#sheet-7').path)
      .toBe('/Drawings?project=123#sheet-7');
  });
  it('does not overwrite a newer navigation when callback cleanup finishes', () => {
    window.history.replaceState({}, '', '/?code=first');
    const old = window.location.href;
    window.history.replaceState({}, '', '/?code=newer');
    finishAuthCallback(old, true);
    expect(window.location.search).toBe('?code=newer');
  });
  it('removes query and fragment values from telemetry URLs', () => {
    expect(redactUrl('https://steelbuild-pro.com/#access_token=secret')).toBe('https://steelbuild-pro.com/');
    expect(redactUrl('/update-password?code=secret#anything')).toBe('/update-password');
  });
  it('replaces private object paths, filenames and unknown routes with static templates', () => {
    expect(redactUrl('https://store.supabase.co/storage/v1/object/sign/email-attachments/private-project/private-filename.pdf?token=secret'))
      .toBe('https://store.supabase.co/storage/v1/[object]');
    expect(redactUrl('https://steelbuild-pro.com/Projects/private-project/secret-name'))
      .toBe('https://steelbuild-pro.com/[route]');
    expect(redactUrl('/assets/private-filename.js?key=secret')).toBe('/assets/[asset]');
    expect(redactUrl('/Drawings?project=private-project')).toBe('/Drawings');
    expect(redactUrl('//user:secret@store.supabase.co/rest/v1/private-table')).toBe('https://store.supabase.co/rest/v1/[resource]');
    expect(redactUrl('private-file.js')).toBe('[redacted-url]');
  });
});

describe('native callback exchange', () => {
  const deps = () => ({ exchangeCode: vi.fn().mockResolvedValue({ error: null }), prepareRecovery: vi.fn(), navigate: vi.fn() });
  it('holds recovery before exchanging a code and never routes secret URL parameters', async () => {
    const value = deps();
    value.exchangeCode.mockImplementation(async () => {
      expect(value.prepareRecovery).toHaveBeenCalledTimes(1);
      expect(value.navigate).toHaveBeenCalledWith('/update-password');
      return { error: null };
    });
    expect(await handleNativeAuthCallback('https://steelbuild-pro.com/update-password?code=native-first', value)).toBe(true);
    expect(value.exchangeCode).toHaveBeenCalledWith('native-first');
  });
  it('does not exchange a repeated cold-launch/deep-link callback twice', async () => {
    const value = deps();
    const url = 'https://steelbuild-pro.com/update-password?code=native-repeat';
    await Promise.all([handleNativeAuthCallback(url, value), handleNativeAuthCallback(url, value)]);
    expect(value.exchangeCode).toHaveBeenCalledTimes(1);
    expect(value.prepareRecovery).toHaveBeenCalledTimes(1);
  });
  it('does not replace an active native recovery route with a competing callback', async () => {
    const value = deps();
    let resolve!: (value: { error: null }) => void;
    value.exchangeCode.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = handleNativeAuthCallback('https://steelbuild-pro.com/update-password?code=native-pending', value);
    await handleNativeAuthCallback('https://steelbuild-pro.com/?code=native-competing', value);
    expect(value.exchangeCode).toHaveBeenCalledTimes(1);
    expect(value.navigate).toHaveBeenCalledTimes(1);
    resolve({ error: null });
    await pending;
  });
  it.each(['https://evil.invalid/update-password?code=secret',
    'https://steelbuild-pro.com.evil.invalid/?code=secret', 'http://steelbuild-pro.com/?code=secret',
    'https://user:password@steelbuild-pro.com/?code=secret'])('rejects external or credential-bearing native URL %s', async url => {
    const value = deps();
    expect(await handleNativeAuthCallback(url, value)).toBe(false);
    expect(value.exchangeCode).not.toHaveBeenCalled();
    expect(value.navigate).not.toHaveBeenCalled();
  });
  it('never adopts a native implicit session', async () => {
    const value = deps();
    expect(await handleNativeAuthCallback('https://steelbuild-pro.com/update-password#access_token=secret', value)).toBe(true);
    expect(value.exchangeCode).not.toHaveBeenCalled();
    expect(value.navigate).toHaveBeenCalledWith('/update-password');
  });
  it('handles provider and transport failures without exposing their messages', async () => {
    const value = deps();
    value.exchangeCode.mockRejectedValue(new Error('private-provider-detail'));
    await expect(handleNativeAuthCallback('https://steelbuild-pro.com/?code=native-failure', value)).resolves.toBe(true);
    expect(value.navigate).toHaveBeenCalledWith('/');
  });
});
