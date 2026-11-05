import { z } from 'zod';
const atomic = z.string().regex(/^(0|[1-9]\d{0,15})$/);
export const taskSchema = z.enum(['TEXT_GENERATION', 'SUMMARIZE', 'TRANSLATE', 'IMAGE_GENERATION']);
export const modelSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/), provider: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),
  model: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/), priceVersion: z.string().min(1).max(50),
  capability: z.enum(['TEXT', 'IMAGE_FIXED_PRICE']), tasks: z.array(taskSchema).min(1).max(4),
  maxInputTokens: z.number().int().min(1024).max(200000), maxOutputTokens: z.number().int().min(1).max(32000),
  contextTokens: z.number().int().min(1025).max(256000),
  inputMicrosPerMillion: atomic, outputMicrosPerMillion: atomic, imagePriceMicros: atomic.default('0')
}).superRefine((model, ctx) => {
  if (model.maxInputTokens + model.maxOutputTokens > model.contextTokens) ctx.addIssue({ code: 'custom', message: 'Token bounds exceed context' });
  if (model.capability === 'TEXT' && BigInt(model.inputMicrosPerMillion) + BigInt(model.outputMicrosPerMillion) === 0n) ctx.addIssue({ code: 'custom', message: 'Explicit positive pricing required' });
  if ((model.capability === 'IMAGE_FIXED_PRICE') !== model.tasks.every(task => task === 'IMAGE_GENERATION')) ctx.addIssue({ code: 'custom', message: 'Task/capability mismatch' });
  if (model.capability === 'TEXT' && model.tasks.includes('IMAGE_GENERATION')) ctx.addIssue({ code: 'custom', message: 'Text models cannot route image tasks' });
  if (model.capability === 'IMAGE_FIXED_PRICE' && (BigInt(model.imagePriceMicros) === 0n || /^(gpt-image|dall-e)/i.test(model.model))) ctx.addIssue({ code: 'custom', message: 'Image route requires a supported fixed-price provider contract; OpenAI token-priced/retired models are not eligible' });
});
export const providerConfigSchema = z.strictObject({
  providers: z.array(z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/), baseUrl: z.url(), keyEnv: z.string().regex(/^AI_SECRET_[A-Z0-9_]{1,60}$/) })).max(10),
  models: z.array(modelSchema).max(40)
}).superRefine((config, ctx) => {
  if (new Set(config.providers.map(p => p.id)).size !== config.providers.length || new Set(config.models.map(m => m.id)).size !== config.models.length) ctx.addIssue({ code: 'custom', message: 'Duplicate provider/model ID' });
  const tasks = config.models.flatMap(m => m.tasks); if (new Set(tasks).size !== tasks.length) ctx.addIssue({ code: 'custom', message: 'Each task must have exactly one route' });
  for (const model of config.models) if (!config.providers.some(p => p.id === model.provider)) ctx.addIssue({ code: 'custom', message: 'Unknown provider reference' });
});
export type ModelRoute = z.infer<typeof modelSchema>;
export type TaskType = z.infer<typeof taskSchema>;
export function parseProviderConfig(raw: string, mode: string) {
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('Invalid AI_ROUTING_CONFIG JSON'); }
  const parsed = providerConfigSchema.safeParse(value); if (!parsed.success) throw new Error('Invalid AI_ROUTING_CONFIG: check routes, limits and explicit pricing');
  for (const provider of parsed.data.providers) {
    const url = new URL(provider.baseUrl);
    if (url.username || url.password || url.search || url.hash || provider.baseUrl.endsWith('/') || !(url.protocol === 'https:' || mode === 'test' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('AI provider URL requires canonical HTTPS; loopback HTTP allowed only in tests');
    if (parsed.data.models.some(m => m.provider === provider.id && m.capability === 'IMAGE_FIXED_PRICE') && url.hostname === 'api.openai.com') throw new Error('OpenAI image models require token accounting; fixed-price image routes use a compatible contracted provider');
  }
  return parsed.data;
}
