// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/api/client/drawingCommands', () => ({ getDrawingRevisionSources: read }));
import { useDrawingSourceSnapshots } from '../useDrawingSourceSnapshots';

const PROJECT = '22222222-2222-4222-8222-222222222222';
const PATH = '11111111-1111-4111-8111-111111111111/uploads/' + PROJECT + '/33333333-3333-4333-8333-333333333333.pdf';
const source = { path: PATH, token: 'a'.repeat(64) };
beforeEach(() => { read.mockReset(); read.mockResolvedValue([source]); });

describe('source review snapshots', () => {
  it('captures once before review and preserves the original immutable identity at confirmation', async () => {
    const { result } = renderHook(() => useDrawingSourceSnapshots(PROJECT));
    await act(async () => { await result.current.capture([PATH]); });
    const original = result.current.snapshots;
    expect(result.current.ready).toBe(true);
    expect(Object.isFrozen(original)).toBe(true);
    expect(Object.isFrozen(original[0])).toBe(true);
    await act(async () => { await result.current.capture([PATH]); });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await result.current.verify([PATH])).toBe(true); });
    expect(result.current.snapshots).toBe(original);
  });

  it.each(['replaced', 'unknown', 'missing'])('sourceChangedRequiresFreshReview: %s', async mode => {
    const { result } = renderHook(() => useDrawingSourceSnapshots(PROJECT));
    await act(async () => { await result.current.capture([PATH]); });
    const original = result.current.snapshots;
    if (mode === 'unknown') read.mockRejectedValue(new Error('unavailable'));
    else read.mockResolvedValue(mode === 'missing' ? [] : [{ path: PATH, token: 'b'.repeat(64) }]);
    await act(async () => { expect(await result.current.verify([PATH])).toBe(false); });
    expect(result.current.ready).toBe(false);
    expect(result.current.snapshots).toBe(original);
    await act(async () => { await expect(result.current.capture([PATH])).rejects.toThrow(/fresh review/i); });
  });

  it('unknown initial identity blocks review, including malformed tokens', async () => {
    read.mockResolvedValue([{ path: PATH, token: null }]);
    const { result } = renderHook(() => useDrawingSourceSnapshots(PROJECT));
    await act(async () => { await expect(result.current.capture([PATH])).rejects.toThrow(); });
    expect(result.current.ready).toBe(false);
  });

  it('page/file edits invalidate review and cannot adopt a new source at confirmation', async () => {
    const { result } = renderHook(() => useDrawingSourceSnapshots(PROJECT));
    await act(async () => { await result.current.capture([PATH]); });
    act(() => result.current.invalidate());
    expect(result.current.ready).toBe(false);
    await act(async () => { expect(await result.current.verify([PATH])).toBe(false); });
    expect(read).toHaveBeenCalledTimes(1);
    act(() => result.current.reset());
    await act(async () => { await result.current.capture([PATH]); });
    expect(result.current.ready).toBe(true);
  });

  it('refuses empty/over-bound/duplicate paths without sending and holds a changed roster', async () => {
    const { result } = renderHook(() => useDrawingSourceSnapshots(PROJECT));
    for (const paths of [[], Array(251).fill(PATH), [PATH, PATH]]) {
      await act(async () => { await expect(result.current.capture(paths)).rejects.toThrow(); });
    }
    expect(read).not.toHaveBeenCalled();
    await act(async () => { await result.current.capture([PATH]); });
    await act(async () => { expect(await result.current.verify([])).toBe(false); });
    expect(result.current.ready).toBe(false);
  });

  it('discards a delayed capture after project change', async () => {
    let resolve!: (sources: typeof source[]) => void;
    read.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result, rerender } = renderHook(({ project }) => useDrawingSourceSnapshots(project), { initialProps: { project: PROJECT } });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.capture([PATH]); });
    rerender({ project: '44444444-4444-4444-8444-444444444444' });
    await act(async () => { resolve([source]); await expect(pending).rejects.toThrow(); });
    expect(result.current.ready).toBe(false);
    expect(result.current.snapshots).toEqual([]);
  });
});
