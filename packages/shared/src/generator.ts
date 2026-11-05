import type { CreditBalance } from './credits';
export interface LocalizedLabel { vi: string; en: string }
export interface GeneratorField { key: string; label: LocalizedLabel; type: 'text' | 'textarea' | 'number' | 'select' | 'month'; required: boolean; min?: number; max?: number; maxLength?: number; options?: string[] }
export interface GeneratorTool { id: string; name: LocalizedLabel; description: LocalizedLabel; platforms: string[]; maxVariations: number; outputTokens: number; version: number; fields: GeneratorField[] }
export interface GeneratorInput { toolId: string; brandId: string; productIds: string[]; audience: string; platform: string; variantPlatforms: string[]; tone: string; language: 'vi' | 'en'; objective: string; variations: number; verifiedFacts: string[]; params: Record<string, unknown> }
export interface PlatformCopy { platform: string; title: string; hook: string; mainText: string; cta: string; hashtags: string[] }
export interface GeneratedVariation extends Omit<PlatformCopy, 'platform'> {
  visualConcept: string; platformVariants: PlatformCopy[];
  seo?: { metaTitle: string; metaDescription: string; outline: string[] };
  email?: { subject: string; preheader: string };
  items?: { text: string; angle: string }[];
  scenes?: { start: number; end: number; spokenText: string; visual: string }[];
  planEntries?: { day: number; platform: string; topic: string; objective: string; format: string; cta: string }[];
}
export interface GeneratorResult { schemaVersion: 1; warnings: string[]; variations: GeneratedVariation[] }
export interface GeneratorEstimate { worstCredits: string; worstCostMicros: string; environmentEnabled: boolean; pricingFingerprint: string }
export interface GeneratorQuote { id: string; expiresAt: string; estimate: GeneratorEstimate; credits: CreditBalance }
export interface GeneratorRunRecord {
  id: string; status: string; errorCode: string | null; createdAt: string; toolId: string; input: GeneratorInput;
  result: GeneratorResult | null; estimate: GeneratorEstimate; credits: CreditBalance; canResume: boolean;
  usage: { costMicros: string; credits: string; inputTokens: number; outputTokens: number } | null;
  reservation: { status: string; amount: string; settledAmount: string; refundedAt: string | null } | null;
  drafts: { variationIndex: number; contentId: string }[];
}
export interface GeneratedDraftRecord { id: string; title: string; status: string; version: number; body: { schemaVersion: 1; kind: 'generated_marketing'; toolId: string; variation: GeneratedVariation; warnings: string[]; sourceRunId: string } }
