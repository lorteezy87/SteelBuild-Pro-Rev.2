import { describe, expect, it } from 'vitest';
import { calculateMarginRisk } from '../marginRiskEngine';

describe('margin risk grouping keys', () => {
  it.each(['__proto__', 'constructor', 'toString'])('treats area %s as an ordinary group name', area => {
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    try {
      const risk = calculateMarginRisk({ rfis: [
        { id: 'rfi-a', status: 'Open', area_sequence: area, cost_impact_amount: 125 },
        { id: 'rfi-b', status: 'Open', area_sequence: area, cost_impact_amount: 75 },
        { id: 'rfi-c', status: 'Open', area_sequence: 'Level 2', cost_impact_amount: 50 },
      ] });
      expect(risk.totalExposure).toBe(250);
      expect(risk.byArea.map(group => [group.area, group.exposure, group.items.length]))
        .toEqual([[area, 200, 2], ['Level 2', 50, 1]]);
      expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before);
    } finally {
      // The regression must not leave prototype mutations behind on a RED run.
      for (const key of Object.getOwnPropertyNames(Object.prototype)) {
        if (!Object.hasOwn(before, key)) Reflect.deleteProperty(Object.prototype, key);
      }
      Object.defineProperties(Object.prototype, before);
    }
  });

  it.each(['__proto__', 'constructor', 'toString'])('isolates work-package grouping key %s', workPackageId => {
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    try {
      const risk = calculateMarginRisk({ rfis: [
        { id: 'rfi-a', status: 'Open', work_package_id: workPackageId, cost_impact_amount: 125 },
        { id: 'rfi-b', status: 'Open', work_package_id: workPackageId, cost_impact_amount: 75 },
      ] });
      expect(risk.byWorkPackage.map(group => [group.workPackageId, group.exposure, group.items.length]))
        .toEqual([[workPackageId, 200, 2]]);
      expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before);
    } finally {
      for (const key of Object.getOwnPropertyNames(Object.prototype)) {
        if (!Object.hasOwn(before, key)) Reflect.deleteProperty(Object.prototype, key);
      }
      Object.defineProperties(Object.prototype, before);
    }
  });
});
