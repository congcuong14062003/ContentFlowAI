import type { GeneratorInput, GeneratorTool, GeneratedVariation } from '../../../../../packages/shared/src/generator';
export type { GeneratorInput, GeneratorTool, GeneratorQuote, GeneratorRunRecord, GeneratedVariation, GeneratedDraftRecord } from '../../../../../packages/shared/src/generator';
export function newInput(tool: GeneratorTool, brandId = '', language: 'vi' | 'en' = 'vi'): GeneratorInput {
  return { toolId: tool.id, brandId, productIds: [], audience: '', platform: tool.platforms[0]!, variantPlatforms: [], tone: '', language, objective: '', variations: 1, verifiedFacts: [], params: Object.fromEntries(tool.fields.map(field => [field.key, field.type === 'number' ? field.min : field.type === 'select' ? field.options?.[0] : ''])) };
}
export function variationText(variation: GeneratedVariation) {
  const text = [variation.title, variation.hook, variation.mainText, variation.cta, variation.hashtags.join(' '), variation.visualConcept];
  if (variation.email) text.push(variation.email.subject, variation.email.preheader);
  if (variation.seo) text.push(variation.seo.metaTitle, variation.seo.metaDescription, ...variation.seo.outline);
  for (const item of variation.items ?? []) text.push(`${item.text}\n${item.angle}`);
  for (const scene of variation.scenes ?? []) text.push(`${scene.start}–${scene.end}s: ${scene.spokenText}\n${scene.visual}`);
  for (const entry of variation.planEntries ?? []) text.push(`${entry.day}. ${entry.platform}: ${entry.topic}\n${entry.objective}\n${entry.format}\n${entry.cta}`);
  for (const variant of variation.platformVariants) text.push(`${variant.platform}\n${variant.title}\n${variant.hook}\n${variant.mainText}\n${variant.cta}\n${variant.hashtags.join(' ')}`);
  return text.filter(Boolean).join('\n\n');
}
