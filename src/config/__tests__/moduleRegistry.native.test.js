/**
 * moduleRegistry — native (sign-in-only) nav gating.
 *
 * The billing/subscription page must not appear in the nav menus of the native
 * App Store build (Guideline 3.1.x — plans are managed on the web), while the
 * web build keeps it. The filter runs at module-eval time, so each direction is
 * exercised with a fresh import under a different isNativePlatform() mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function navPagesWhenNative(nativeValue) {
  vi.doMock('@/lib/native/platform', () => ({ isNativePlatform: () => nativeValue }));
  const mod = await import('@/config/moduleRegistry');
  return [...mod.NAV_GROUPS, ...mod.SIDEBAR_GROUPS].flatMap((g) => (g.items || []).map((i) => i.page));
}

describe('moduleRegistry native nav gating', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.doUnmock('@/lib/native/platform'); vi.resetModules(); });

  it('hides Billing from nav menus when running natively', async () => {
    const pages = await navPagesWhenNative(true);
    expect(pages).not.toContain('Billing');
    // The rest of the ADMINISTRATION group survives.
    expect(pages).toContain('OrgMembers');
    expect(pages).toContain('Settings');
  });

  it('keeps Billing in the nav menus on the web', async () => {
    const pages = await navPagesWhenNative(false);
    expect(pages).toContain('Billing');
  });
});
