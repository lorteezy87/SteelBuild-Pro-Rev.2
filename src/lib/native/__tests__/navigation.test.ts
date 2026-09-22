import { describe, expect, it } from 'vitest';
import { extractInAppPath, passwordResetRedirect } from '../navigation';

describe('trusted native navigation', () => {
  it('preserves an internal destination and query on either production host', () => {
    expect(extractInAppPath('https://steelbuild-pro.com/RFIs?id=42#details')).toBe('/RFIs?id=42#details');
    expect(extractInAppPath('https://www.steelbuild-pro.com/')).toBe('/');
  });
  it.each(['https://evil.test/RFIs', 'http://steelbuild-pro.com/RFIs', 'https://steelbuild-pro.com.evil.test/RFIs', 'https://steelbuild-pro.com:444/RFIs', 'https://user@steelbuild-pro.com/RFIs', 'javascript:alert(1)', 'https://steelbuild-pro.com//evil.test/path', 'https://steelbuild-pro.com/%2f%2fevil.test', 'not a url'])('rejects untrusted URL %s', (url) => {
    expect(extractInAppPath(url)).toBeNull();
  });
  it.each(['https://steelbuild-pro.com/update-password#access_token=secret&type=recovery', 'https://steelbuild-pro.com/?code=secret', 'https://steelbuild-pro.com/update-password#error=access_denied&error_code=otp_expired'])('leaves auth callbacks to the hosted recovery flow: %s', (url) => {
    expect(extractInAppPath(url)).toBeNull();
  });
  it('sends native recovery to HTTPS while preserving web environments', () => {
    expect(passwordResetRedirect(true, 'http://localhost')).toBe('https://steelbuild-pro.com/update-password');
    expect(passwordResetRedirect(false, 'https://staging.example')).toBe('https://staging.example/update-password');
  });
});
