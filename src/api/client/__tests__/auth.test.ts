import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auth } from '../auth';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('@/lib/authMeta', () => ({
  stripPrivilegeMeta: (meta: Record<string, unknown>) => {
    const {
      role,
      roles,
      is_admin,
      isAdmin,
      admin,
      permissions,
      perms,
      ...rest
    } = meta as Record<string, unknown>;
    return rest;
  },
}));

import { supabase } from '@/lib/supabase';

function mockProfileRole(role: string | null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: role == null && !error ? null : role != null ? { role } : null,
    error,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ select });
  return { select, eq, maybeSingle };
}

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('me', () => {
    it('returns user with server-authoritative role and stripped privilege meta', async () => {
      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          user: {
            id: 'u1',
            email: 'a@b.com',
            created_at: '2026-04-06T08:59:53.219Z',
            user_metadata: { full_name: 'Ada', role: 'admin', theme: 'dark' },
          },
        },
        error: null,
      });
      mockProfileRole('user');

      const result = await auth.me();

      expect(result).toEqual({
        theme: 'dark',
        id: 'u1',
        email: 'a@b.com',
        full_name: 'Ada',
        created_date: '2026-04-06T08:59:53.219Z',
        role: 'user',
      });
      expect(result.role).toBe('user');
    });

    it('falls back full_name to meta.name then email', async () => {
      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          user: {
            id: 'u1',
            email: 'a@b.com',
            user_metadata: { name: 'Named' },
          },
        },
        error: null,
      });
      mockProfileRole('editor');

      await expect(auth.me()).resolves.toMatchObject({
        full_name: 'Named',
        role: 'editor',
      });

      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } },
        error: null,
      });
      mockProfileRole(null);

      await expect(auth.me()).resolves.toMatchObject({
        full_name: 'a@b.com',
        role: 'user',
      });
    });

    it('throws when getUser errors or user missing', async () => {
      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: null },
        error: { message: 'jwt expired' },
      });
      await expect(auth.me()).rejects.toMatchObject({ message: 'jwt expired' });

      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: null },
        error: null,
      });
      await expect(auth.me()).rejects.toThrow('Not authenticated');
    });

    it('defaults role to user when profile query fails', async () => {
      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } },
        error: null,
      });
      mockProfileRole(null, { message: 'rls' });

      await expect(auth.me()).resolves.toMatchObject({ role: 'user' });
    });
  });

  describe('loginViaEmailPassword', () => {
    it('signs in and returns data', async () => {
      const payload = { session: { access_token: 't' }, user: { id: 'u1' } };
      (supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: payload,
        error: null,
      });

      await expect(auth.loginViaEmailPassword('a@b.com', 'secret')).resolves.toEqual(
        payload,
      );
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'secret',
      });
    });

    it('rejects empty email/password with status 400', async () => {
      await expect(auth.loginViaEmailPassword(' ', 'x')).rejects.toMatchObject({
        message: 'Email is required',
        status: 400,
      });
      await expect(auth.loginViaEmailPassword('a@b.com', '')).rejects.toMatchObject({
        message: 'Password is required',
        status: 400,
      });
      expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('maps provider errors to Error with status', async () => {
      (supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { message: 'Invalid login', status: 400 },
      });

      await expect(auth.loginViaEmailPassword('a@b.com', 'bad')).rejects.toMatchObject({
        message: 'Invalid login',
        status: 400,
      });
    });
  });

  describe('logout', () => {
    it('signs out successfully', async () => {
      (supabase.auth.signOut as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: null,
      });
      await expect(auth.logout()).resolves.toBeUndefined();
    });

    it('throws when signOut fails', async () => {
      (supabase.auth.signOut as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: { message: 'network' },
      });
      await expect(auth.logout()).rejects.toMatchObject({ message: 'network' });
    });
  });

  describe('redirectToLogin', () => {
    it('navigates to / and optional redirect query', () => {
      const href = vi.fn();
      vi.stubGlobal('window', {
        location: {
          set href(v: string) {
            href(v);
          },
        },
      });

      auth.redirectToLogin();
      expect(href).toHaveBeenCalledWith('/');

      auth.redirectToLogin('/app/settings');
      expect(href).toHaveBeenCalledWith(
        `/?redirect=${encodeURIComponent('/app/settings')}`,
      );
    });

    it('is a no-op when window is undefined (SSR)', () => {
      vi.stubGlobal('window', undefined);
      expect(() => auth.redirectToLogin('/x')).not.toThrow();
    });
  });

  describe('updateMe', () => {
    it('strips blocked fields and returns authoritative role', async () => {
      (supabase.auth.updateUser as ReturnType<typeof vi.fn>).mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          expect(data).not.toHaveProperty('role');
          expect(data).not.toHaveProperty('email');
          expect(data).toMatchObject({ theme: 'light', full_name: 'Bea' });
          return {
            data: {
              user: {
                id: 'u1',
                email: 'a@b.com',
                user_metadata: { ...data, role: 'admin' },
              },
            },
            error: null,
          };
        },
      );
      mockProfileRole('user');

      const result = await auth.updateMe({
        theme: 'light',
        full_name: 'Bea',
        role: 'admin',
        email: 'evil@x.com',
      });

      expect(result.full_name).toBe('Bea');
      expect(result.role).toBe('user');
      expect(result.email).toBe('a@b.com');
    });

    it('throws when updateUser returns no user', async () => {
      (supabase.auth.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: null },
        error: null,
      });
      await expect(auth.updateMe({ theme: 'dark' })).rejects.toThrow(
        'Not authenticated',
      );
    });

    it('uses meta.name fallback consistently with me()', async () => {
      (supabase.auth.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          user: {
            id: 'u1',
            email: 'a@b.com',
            user_metadata: { name: 'OnlyName' },
          },
        },
        error: null,
      });
      mockProfileRole('user');

      await expect(auth.updateMe({ name: 'OnlyName' })).resolves.toMatchObject({
        full_name: 'OnlyName',
      });
    });

    it('propagates update errors', async () => {
      (supabase.auth.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: null },
        error: { message: 'denied' },
      });
      await expect(auth.updateMe({ theme: 'x' })).rejects.toMatchObject({
        message: 'denied',
      });
    });
  });
});
