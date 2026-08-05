// @vitest-environment jsdom
/**
 * Billing page — native (sign-in-only) gating.
 *
 * In the native App Store build the page must show NO in-app purchase surface:
 * no plan/upgrade cards (Stripe Checkout) and no "Manage billing" (Stripe
 * portal) button — only the read-only current plan plus a "managed on the web"
 * note. The org is given a stripe_customer_id and an owner role so the purchase
 * UI WOULD render if it weren't gated.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => true }));
vi.mock('@/components/shared/OrgContext', () => ({
  useOrg: () => ({
    currentOrg: { id: 'org1', name: 'Acme Steel', stripe_customer_id: 'cus_1', current_period_end: null },
    currentRole: 'owner',
    refetchOrgs: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({ plan: { name: 'Free' }, planKey: 'free', status: 'free', isActive: false }),
}));
vi.mock('@/hooks/useFeatureFlag', () => ({ useFlag: () => false }));
vi.mock('@/lib/billing/billingService', () => ({
  startCheckout: vi.fn(),
  openBillingPortal: vi.fn(),
}));

import Billing from '@/pages/Billing.jsx';

function renderBilling() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Billing />
    </QueryClientProvider>,
  );
}

describe('Billing native sign-in-only gating', () => {
  it('hides all purchase UI and shows a manage-on-web note', () => {
    renderBilling();
    // Read-only current plan still shown.
    expect(screen.getByText(/current plan/i)).toBeInTheDocument();
    // Manage-on-web note present.
    expect(screen.getByText(/managed on the web/i)).toBeInTheDocument();
    // No Stripe portal button, no plan-card purchase buttons.
    expect(screen.queryByRole('button', { name: /manage billing/i })).toBeNull();
    expect(screen.queryByText(/choose |switch to /i)).toBeNull();
    expect(screen.queryByText(/secure payments by stripe/i)).toBeNull();
  });
});
