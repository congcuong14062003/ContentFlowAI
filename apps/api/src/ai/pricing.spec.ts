import { describe, expect, it } from 'vitest';
import { cost, worstCost, type Pricing } from './pricing';
import { parseProviderConfig } from './ai.config';
import { units } from '../credits/money';
const pricing: Pricing = { route: { id: 'text', provider: 'provider', model: 'text-model', priceVersion: 'v1', capability: 'TEXT', tasks: ['TEXT_GENERATION'], maxInputTokens: 4096, maxOutputTokens: 100, contextTokens: 8192, inputMicrosPerMillion: '1234567', outputMicrosPerMillion: '2345678', imagePriceMicros: '0' }, maxOutputTokens: 100, creditMicrosPerAtom: '10' };
describe('financial pricing', () => {
  it('uses integer arithmetic, rounds costs and credits upwards without float loss', () => {
    const actual = cost(pricing, 10, 5, 0); expect(actual.micros).toBe(25n); expect(actual.credits).toBe(3n);
    expect(units('9007199254740993')).toBe(9007199254740993n);
    expect(() => units('1.01')).toThrow(); expect(() => units('-1')).toThrow(); expect(() => units('01')).toThrow();
  });
  it('bounds every permitted token count by the reserved worst case', () => {
    const worst = worstCost(pricing);
    for (let input = 0; input <= 4096; input += 257) for (let output = 0; output <= 100; output += 7) {
      const actual = cost(pricing, input, output, 0); expect(actual.micros <= worst.micros).toBe(true); expect(actual.credits <= worst.credits).toBe(true);
    }
    expect(() => cost(pricing, 4097, 1, 0)).toThrow(); expect(() => cost(pricing, 1, 101, 0)).toThrow(); expect(() => cost(pricing, -1, 1, 0)).toThrow();
  });
  it('requires explicit configured provider, trusted endpoint and bounded capability routing', () => {
    const config = { providers: [{ id: 'provider', baseUrl: 'https://api.openai.com/v1', keyEnv: 'AI_SECRET_PROVIDER' }], models: [pricing.route] };
    expect(parseProviderConfig(JSON.stringify(config), 'production').models[0]?.id).toBe('text');
    expect(() => parseProviderConfig(JSON.stringify({ ...config, models: [pricing.route, pricing.route] }), 'test')).toThrow();
    expect(() => parseProviderConfig(JSON.stringify({ ...config, providers: [{ ...config.providers[0], baseUrl: 'http://localhost:1234/v1' }] }), 'production')).toThrow();
    expect(() => parseProviderConfig(JSON.stringify({ ...config, models: [{ ...pricing.route, capability: 'IMAGE_FIXED_PRICE', model: 'gpt-image-1', tasks: ['IMAGE_GENERATION'], imagePriceMicros: '100' }] }), 'production')).toThrow();
    expect(() => parseProviderConfig(JSON.stringify({ ...config, models: [{ ...pricing.route, maxOutputTokens: 10000 }] }), 'production')).toThrow();
  });
});
