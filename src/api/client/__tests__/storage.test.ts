import { beforeEach, describe, expect, it, vi } from 'vitest';
const { sign, bucket } = vi.hoisted(() => ({ sign: vi.fn(), bucket: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://project.supabase.co' } }));
vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: bucket } } }));
import { resolveFileUrl } from '../storage';

describe('private file URL resolution', () => {
  beforeEach(() => {
    sign.mockReset().mockResolvedValue({ data: { signedUrl: 'https://new.example/file' }, error: null });
    bucket.mockReset().mockReturnValue({ createSignedUrl: sign });
  });
  it('reauthorizes an old signed URL instead of reusing its bearer token', async () => {
    await resolveFileUrl('https://project.supabase.co/storage/v1/object/sign/app-files/org/projects/project/uploads/a.pdf?token=old');
    expect(bucket).toHaveBeenCalledWith('app-files');
    expect(sign).toHaveBeenCalledWith('org/projects/project/uploads/a.pdf', 300);
  });
  it.each([
    'https://other.example/storage/v1/object/sign/app-files/a.pdf',
    'https://project.supabase.co/functions/v1/anything',
    'https://project.supabase.co/storage/v1/object/sign/blueline-files/a.pdf',
    'https://user:pass@project.supabase.co/storage/v1/object/sign/app-files/a.pdf',
    'https://project.supabase.co/storage/v1/object/sign/app-files/a%2fb.pdf',
  ])('rejects URLs outside the owned private storage contract: %s', async value => {
    expect(await resolveFileUrl(value)).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });
  it('reauthorizes email attachment URLs against their own bucket', async () => {
    await resolveFileUrl('email-attachments/project/mail/a.pdf');
    expect(bucket).toHaveBeenCalledWith('email-attachments');
    expect(sign).toHaveBeenCalledWith('project/mail/a.pdf', 300);
  });
});
