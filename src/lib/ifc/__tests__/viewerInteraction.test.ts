import { describe, it, expect } from 'vitest';
import { createPickGesture, framingDistance, wheelPixels } from '../viewerInteraction';
const event = (pointerId=1,clientX=10,clientY=10,button=0) => ({pointerId,clientX,clientY,button});
describe('viewer picking gesture', () => {
  it('picks a primary tap but never a drag that returns to its origin', () => {
    const g=createPickGesture(); g.down(event()); expect(g.up(event())).toBe(true);
    g.down(event());g.move(event(1,50));g.move(event());expect(g.up(event())).toBe(false);
  });
  it('rejects multitouch, cancelled pointers, and non-primary buttons; recovers for the next tap', () => {
    const g=createPickGesture();g.down(event());g.down(event(2));expect(g.up(event(2))).toBe(false);expect(g.up(event())).toBe(false);
    g.down(event());g.cancel(event());expect(g.up(event())).toBe(false);
    g.down(event(1,10,10,2));expect(g.up(event(1,10,10,2))).toBe(false);
    g.down(event());expect(g.up(event())).toBe(true);
  });
  it('frames a small element independently of the model, respects portrait FOV, and normalizes wheel units', () => {
    expect(framingDistance(0.2,50,1)).toBeLessThan(1);
    expect(framingDistance(0.2,50,0.5)).toBeGreaterThan(framingDistance(0.2,50,1));
    expect(wheelPixels(-3,1,800)).toBe(-48);expect(wheelPixels(-1,2,800)).toBe(-800);
  });
});
