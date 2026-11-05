import { z } from 'zod';
import { modelSchema, type ModelRoute } from './ai.config';
import { ceilDiv, MAX_UNITS, units } from '../credits/money';
export const pricingSchema = z.object({ route: modelSchema, maxOutputTokens: z.number().int().positive(), creditMicrosPerAtom: z.string().regex(/^[1-9]\d{0,8}$/) });
export type Pricing = z.infer<typeof pricingSchema>;
export function tokenCost(route: ModelRoute, input: number, output: number) {
  return ceilDiv(BigInt(input) * units(route.inputMicrosPerMillion, true), 1000000n) + ceilDiv(BigInt(output) * units(route.outputMicrosPerMillion, true), 1000000n);
}
export function cost(pricing: Pricing, input: number, output: number, images: number) {
  if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0 || input > pricing.route.maxInputTokens || (pricing.route.capability === 'TEXT' && output > pricing.maxOutputTokens)) throw new Error('Provider usage exceeded configured bounds');
  const micros = pricing.route.capability === 'TEXT' ? tokenCost(pricing.route, input, output) : images === 1 ? units(pricing.route.imagePriceMicros) : (() => { throw new Error('Image quantity mismatch'); })();
  const credits = ceilDiv(micros, BigInt(pricing.creditMicrosPerAtom));
  if (micros > MAX_UNITS || credits > MAX_UNITS) throw new Error('Cost bound exceeds accounting range');
  return { micros, credits };
}
export function worstCost(pricing: Pricing) { return cost(pricing, pricing.route.maxInputTokens, pricing.maxOutputTokens, pricing.route.capability === 'TEXT' ? 0 : 1); }
