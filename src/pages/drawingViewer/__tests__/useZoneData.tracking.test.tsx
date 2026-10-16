// @vitest-environment jsdom
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
const lookup = vi.hoisted(() => vi.fn().mockRejectedValue(new Error('Revision tracking required. Use reviewed upload.')));
vi.mock('@/lib/drawingHub', () => ({ ensureCurrentRevision: lookup, listZones: vi.fn(), listLinksForZones: vi.fn(), hydrateLinks: vi.fn(), computeZoneDensity: vi.fn(), summarizeLinks: vi.fn(), computeZoneStatus: vi.fn(), recomputeAndPersistZoneStatus: vi.fn(), listZoneProposals: vi.fn().mockResolvedValue({ total: 0 }), listZoneDependencies: vi.fn() }));
import { useZoneData } from '../useZoneData';
it('keeps a missing-history PDF viewer alive and exposes inline tracking state even with zones off', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, throwOnError: true } } });
  const wrapper = ({ children }: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useZoneData({ projectId: 'p', activeId: 'd', activeDrawing: { id: 'd', project_id: 'p', file_url: 'pdf', pdf_page: 3 }, zoneMode: 'off', showDeps: false, zoneFilter: { statusSet: new Set(), typeKey: 'all' } }), { wrapper });
  await waitFor(() => expect(result.current.trackingError?.message).toMatch(/tracking required/i));
  expect(result.current.currentRevision).toBeUndefined();
  expect(result.current.zones).toEqual([]);
});
