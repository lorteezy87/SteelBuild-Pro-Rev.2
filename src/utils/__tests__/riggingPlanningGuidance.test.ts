import { describe, expect, it } from 'vitest';
import { angleFromHeightSpan, buildWarnings, calculateSlingTension, getAngleStatus } from '../riggingCalculations';
import { buildExtendedWarnings, offsetTwoLegBridle } from '../cranePickMath';

describe('low-angle planning guidance', () => {
  it('wider pick spacing lowers the horizontal angle and raises tension at unchanged height', () => {
    const original = angleFromHeightSpan(2, 4);
    const wider = angleFromHeightSpan(2, 6);
    const higher = angleFromHeightSpan(4, 4);
    expect(original).toBeCloseTo(26.565051, 5);
    expect(wider).toBeCloseTo(18.434949, 5);
    expect(higher).toBeCloseTo(45, 10);
    expect(calculateSlingTension(10000, 2, wider)).toBeGreaterThan(calculateSlingTension(10000, 2, original));
    expect(calculateSlingTension(10000, 2, higher)).toBeLessThan(calculateSlingTension(10000, 2, original));
  });

  it('gives symmetric picks qualified review guidance without the reversed adjustment advice', () => {
    const angle = angleFromHeightSpan(2, 4);
    const warning = buildWarnings({ angleStatus: getAngleStatus(angle), capacityStatus: 'green',
      angleDegrees: angle, utilizationPercent: 25, numLegs: 2, liftType: 'standard' })[0];
    expect(warning.severity).toBe('red');
    expect(warning.message).toContain('below 30°');
    expect(warning.message).toContain('qualified person');
    expect(warning.message).toContain('unchanged pick-point spacing');
    expect(warning.message).not.toMatch(/reduce sling length|widen pick points/i);
  });

  it('does not prescribe an unreviewed one-leg length or pick-point change for offset geometry', () => {
    const offset = offsetTwoLegBridle(10000, 2, 4, 6);
    expect(offset).not.toBeNull();
    const warnings = buildExtendedWarnings({ offset, slingUtilization: NaN, shackleUtilization: NaN, hookBlockEntered: true });
    const lowAngle = warnings.find(warning => warning.message.includes('below 30°'))!;
    expect(lowAngle.severity).toBe('red');
    expect(lowAngle.message).toContain('qualified person');
    expect(lowAngle.message).toContain('unchanged pick-point spacing');
    expect(lowAngle.message).not.toMatch(/lengthen the sling or move the pick points/i);
  });
});
