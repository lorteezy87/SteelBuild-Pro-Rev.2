import { describe, expect, it } from 'vitest';
import { summarizeExecutiveLabor } from '../executiveLabor';

describe('executive labor completeness', () => {
  it('does not turn absent records into zero labor or burn', () => {
    expect(summarizeExecutiveLabor([])).toMatchObject({ budget: null, actual: null, burnPercent: null });
  });
  it.each([null, undefined, '', ' ', 'bad', Infinity, -1])('keeps missing/invalid actuals unknown: %s', (actual) => {
    expect(summarizeExecutiveLabor([{ shop_hours_budget: 100, field_hours_budget: 0, shop_hours_actual: actual, field_hours_actual: 0 }]))
      .toMatchObject({ budget: 100, actual: null, burnPercent: null, incompletePackages: 1 });
  });
  it('preserves an explicitly recorded zero', () => {
    expect(summarizeExecutiveLabor([{ shop_hours_budget: 100, field_hours_budget: 0, shop_hours_actual: 0, field_hours_actual: 0 }]))
      .toMatchObject({ budget: 100, actual: 0, burnPercent: 0, incompletePackages: 0 });
  });
  it('does not present a partial aggregate as the portfolio total', () => {
    expect(summarizeExecutiveLabor([
      { shop_hours_budget: 100, field_hours_budget: 50, shop_hours_actual: 20, field_hours_actual: 10 },
      { shop_hours_budget: 10, field_hours_budget: 0, shop_hours_actual: null, field_hours_actual: 0 },
    ])).toMatchObject({ budget: 160, actual: null, enteredActual: 30, burnPercent: null, incompletePackages: 1 });
  });
  it('accepts numeric strings and refuses a zero denominator', () => {
    expect(summarizeExecutiveLabor([{ shop_hours_budget: '0', field_hours_budget: 0, shop_hours_actual: '12', field_hours_actual: 0 }]))
      .toMatchObject({ budget: 0, actual: 12, burnPercent: null });
  });
});
