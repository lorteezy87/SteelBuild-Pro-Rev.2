// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { usePdfRenderer } from '../usePdfRenderer';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const viewport = { width: 100, height: 80, convertToViewportPoint: (x: number, y: number) => [x, y] };
const link = (id: string) => [{ id, subtype: 'Link', rect: [1, 2, 3, 4], url: 'https://example.invalid/' + id }];
function setup(doc: object) {
  const onRenderError = vi.fn();
  const observed: Array<{ page: number; ready: boolean; viewport: unknown; links: unknown[] }> = [];
  const hook = renderHook(props => {
    const value = usePdfRenderer(props);
    observed.push({ page: props.currentPage, ready: value.renderReady, viewport: value.currentViewport, links: value.linkHotspots });
    return value;
  }, { initialProps: { pdfDoc: null as object | null, currentPage: 1, zoom: 1, rotation: 0, onRenderError } });
  const canvas = document.createElement('canvas');
  canvas.getContext = vi.fn() as typeof canvas.getContext;
  act(() => { hook.result.current.canvasRef.current = canvas; });
  hook.rerender({ pdfDoc: doc, currentPage: 1, zoom: 1, rotation: 0, onRenderError });
  return { ...hook, onRenderError, observed, props: { pdfDoc: doc, currentPage: 1, zoom: 1, rotation: 0, onRenderError } };
}
it('hides old render facts synchronously until the newly requested canvas completes', async () => {
  const next = deferred<void>();
  const doc = { numPages: 2, getPage: async (page: number) => ({ getViewport: () => viewport, getAnnotations: async () => link(String(page)),
    render: () => ({ promise: page === 2 ? next.promise : Promise.resolve(), cancel: vi.fn() }) }) };
  const { result, rerender, props, observed } = setup(doc);
  await waitFor(() => expect(result.current.currentViewport).toBe(viewport));
  rerender({ ...props, currentPage: 2 });
  expect(observed.find(entry => entry.page === 2)).toEqual({ page: 2, ready: false, viewport: null, links: [] });
  expect(result.current.renderReady).toBe(false);
  await act(async () => next.resolve());
  await waitFor(() => expect(result.current.renderReady).toBe(true));
  expect(result.current.linkHotspots[0].id).toBe('2');
});
it.each(['resolve', 'reject'] as const)('drops late old annotation %s and does not clear the new render error', async outcome => {
  const oldAnnotations = deferred<ReturnType<typeof link>>();
  const doc = { numPages: 2, getPage: async (page: number) => ({ getViewport: () => viewport,
    getAnnotations: () => page === 1 ? oldAnnotations.promise : Promise.resolve(link('new')),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }) }) };
  const { result, rerender, props, onRenderError } = setup(doc);
  await waitFor(() => expect(result.current.currentViewport).toBe(viewport));
  rerender({ ...props, currentPage: 2 });
  await waitFor(() => expect(result.current.linkHotspots[0]?.id).toBe('new'));
  onRenderError.mockClear();
  await act(async () => { if (outcome === 'resolve') oldAnnotations.resolve(link('old')); else oldAnnotations.reject(new Error('old failed')); });
  expect(result.current.linkHotspots[0]?.id).toBe('new');
  expect(onRenderError).not.toHaveBeenCalled();
});
