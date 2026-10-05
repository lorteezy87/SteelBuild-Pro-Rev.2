import { describe, expect, it } from 'vitest';
import { normalizeRequestLimits } from './requestLimits';

describe('LLM request cost boundary', () => {
  it.each([64000, '64000', '6.4e4'])('caps numeric and string token requests: %s', (maxTokens) => {
    expect(normalizeRequestLimits({ maxTokens }, 'openai').maxTokens).toBe(16000);
  });
  it.each([null, '', ' ', true, [], {}, 'Infinity', Infinity, NaN, -1, 0, 0.5])('rejects invalid token values: %j', (maxTokens) => {
    expect(() => normalizeRequestLimits({ maxTokens }, 'openai')).toThrow();
  });
  it('keeps zero temperature and provides the existing token default', () => {
    expect(normalizeRequestLimits({ temperature: '0' }, 'openai')).toEqual({ maxTokens: 1000, temperature: 0 });
  });
  it('validates provider-specific temperature limits', () => {
    expect(() => normalizeRequestLimits({ temperature: 1.5 }, 'anthropic')).toThrow();
    expect(normalizeRequestLimits({ temperature: 1.5 }, 'openai').temperature).toBe(1.5);
  });
});
