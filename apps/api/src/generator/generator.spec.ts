import { describe, expect, it } from 'vitest';
import { getTool, parseInput, tools } from './tool-registry';
import { makePrompt, outputSchema, planDays } from './output-contract';
const brandId = '12345678-1234-4234-9234-123456789abc';
function input(toolId = 'facebook_post') {
  const tool = getTool(toolId);
  return { toolId, brandId, productIds: [brandId], audience: 'Teams', tone: 'Clear', language: 'en', platform: tool.platforms[0], variantPlatforms: [], objective: 'Explain sourced benefits', variations: 1, verifiedFacts: ['A supplied fact'], params: Object.fromEntries(tool.fields.map(field => [field.key, field.type === 'number' ? field.min : field.type === 'select' ? field.options![0] : field.type === 'month' ? '2028-02' : field.key === 'startDate' ? '2026-11-04' : 'Topic'])) };
}
const copy = { title:'Draft',hook:'Opening',mainText:'Supplied facts only',cta:'Learn more',hashtags:['#Marketing'] };
function output() { return { schemaVersion:1,warnings:[],variations:[{...copy,visualConcept:'Show the actual product',platformVariants:[{platform:'facebook',...copy}]}] }; }
describe('tool contracts', () => {
  it('validates dedicated inputs for all twelve tools and forbids unknown price/model overrides', () => {
    expect(tools).toHaveLength(12);
    for (const tool of tools) {
      expect(parseInput(input(tool.id)).toolId).toBe(tool.id);
      expect(() => parseInput({ ...input(tool.id), params: {} })).toThrow();
    }
    expect(() => parseInput({ ...input(), credits: '0' })).toThrow();
    expect(() => parseInput({ ...input('product_description'), productIds: [] })).toThrow();
    expect(() => parseInput({ ...input('weekly_plan'), variations: 2 })).toThrow();
  });
  it('rejects incorrect variation counts, missing/duplicate platforms and unbounded extra output', () => {
    const schema = outputSchema(parseInput(input())); expect(schema.safeParse(output()).success).toBe(true);
    expect(schema.safeParse({ ...output(), variations: [] }).success).toBe(false);
    expect(schema.safeParse({ ...output(), injected: '<script>' }).success).toBe(false);
    const value = output(); value.variations[0]!.platformVariants[0]!.platform = 'instagram'; expect(schema.safeParse(value).success).toBe(false);
  });
  it('requires tool-specific email/SEO fields and exact calendar plan length', () => {
    expect(outputSchema(parseInput(input('email_marketing'))).safeParse(output()).success).toBe(false);
    expect(outputSchema(parseInput(input('seo_blog'))).safeParse(output()).success).toBe(false);
    expect(planDays(parseInput(input('monthly_plan')))).toBe(29);
    expect(planDays(parseInput({ ...input('monthly_plan'), params: { theme: 'Topic', month: '2027-02' } }))).toBe(28);
    expect(planDays(parseInput(input('weekly_plan')))).toBe(7);
  });
  it('includes source context and explicit factual limits without requesting fabricated evidence', () => {
    const prompt = makePrompt(parseInput(input()), { voice:'Warm',forbiddenPhrases:['unsupported promise'] }, [{ name:'Sourced product' }]);
    expect(prompt).toContain('Never invent statistics'); expect(prompt).toContain('testimonials'); expect(prompt).toContain('Sourced product'); expect(prompt).toContain('unsupported promise'); expect(prompt).toContain('untrusted reference data');
  });
});
