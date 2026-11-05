/** Versioned context consumed by future generation adapters; never executable instructions. */
export interface BrandKitContext {
  schemaVersion: 1;
  colors: string[];
  industry: string;
  businessDescription: string;
  targetAudiences: string[];
  voice: string;
  tone: string[];
  keywords: string[];
  forbiddenPhrases: string[];
  preferredCta: string;
  languages: string[];
  socialPlatforms: string[];
  aiInstructions: string;
}
export interface BrandRecord {
  id: string; workspaceId: string; name: string; guidelines: BrandKitContext;
  isDefault: boolean; logoAssetId: string | null; assets?: CatalogAssetRecord[];
}
export interface ProductRecord {
  id: string; workspaceId: string; name: string; description: string; priceReference: string;
  features: string[]; benefits: string[]; audiences: string[]; categories: string[]; tags: string[];
  status: 'ACTIVE' | 'ARCHIVED'; brands: { brandId: string }[]; assets?: CatalogAssetRecord[];
}
export interface CatalogAssetRecord { id: string; originalName: string; mimeType: string; size: number }
export const emptyBrandKit = (): BrandKitContext => ({ schemaVersion: 1, colors: [], industry: '', businessDescription: '', targetAudiences: [], voice: '', tone: [], keywords: [], forbiddenPhrases: [], preferredCta: '', languages: ['vi'], socialPlatforms: [], aiInstructions: '' });
