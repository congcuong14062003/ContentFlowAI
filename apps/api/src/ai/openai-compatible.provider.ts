import { z } from 'zod';
import type { ModelRoute } from './ai.config';
import { ProviderFailure, type AiProvider, type ProviderResult } from './provider';
const tokens = z.number().int().min(0).max(1000000);
const textResponse = z.object({ id: z.string().max(200), model: z.string(), choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1), usage: z.object({ prompt_tokens: tokens, completion_tokens: tokens }) });
const imageResponse = z.object({ data: z.array(z.object({ b64_json: z.string().min(1).max(16000000) })).length(1), usage: z.object({ input_tokens: tokens, output_tokens: tokens }).optional() });
export class OpenAiCompatibleProvider implements AiProvider {
  constructor(readonly id: string, private readonly baseUrl: string, private readonly key: string) {}
  private async boundedJson(response: Response, limit: number) {
    const length = Number(response.headers.get('content-length')); if (length > limit) { await response.body?.cancel(); throw new ProviderFailure('PROVIDER_RESPONSE_LIMIT', 'UNKNOWN'); }
    if (!response.body) throw new ProviderFailure('PROVIDER_EMPTY_RESPONSE', 'UNKNOWN');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) { await reader.cancel(); throw new ProviderFailure('PROVIDER_RESPONSE_LIMIT', 'UNKNOWN'); } chunks.push(part.value); } return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    finally { reader.releaseLock(); }
  }
  async generate(route: ModelRoute, prompt: string, maxOutputTokens: number, requestId: string, signal: AbortSignal): Promise<ProviderResult> {
    try {
      if (signal.aborted) throw new ProviderFailure('CANCELLED_BEFORE_SEND', 'UNBILLED');
      const image = route.capability === 'IMAGE_FIXED_PRICE';
      const response = await fetch(`${this.baseUrl}/${image ? 'images/generations' : 'chat/completions'}`, { method: 'POST', redirect: 'error', signal, headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': requestId }, body: JSON.stringify(image ? { model: route.model, prompt, n: 1, size: '1024x1024', quality: 'low', output_format: 'png' } : { model: route.model, messages: [{ role: 'user', content: prompt }], max_completion_tokens: maxOutputTokens, n: 1, stream: false, store: false }) });
      const providerId = response.headers.get('x-request-id')?.slice(0, 200);
      if (!response.ok) { await response.body?.cancel(); throw new ProviderFailure(`PROVIDER_HTTP_${response.status}`, [400,401,403,404,422,429].includes(response.status) ? 'UNBILLED' : 'UNKNOWN', providerId); }
      const raw = await this.boundedJson(response, image ? 17000000 : 2000000);
      if (image) {
        const parsed = imageResponse.safeParse(raw); if (!parsed.success) throw new ProviderFailure('PROVIDER_INVALID_IMAGE_RESPONSE', 'UNKNOWN', providerId);
        const encoded = parsed.data.data[0]!.b64_json;
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || !Buffer.from(encoded, 'base64').subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new ProviderFailure('PROVIDER_INVALID_IMAGE', 'UNKNOWN', providerId);
        return { output: { imageBase64: encoded, mimeType: 'image/png' }, inputTokens: parsed.data.usage?.input_tokens ?? 0, outputTokens: parsed.data.usage?.output_tokens ?? 0, images: 1, requestId: providerId };
      }
      const parsed = textResponse.safeParse(raw); if (!parsed.success || !(parsed.data.model === route.model || parsed.data.model.startsWith(`${route.model}-`))) throw new ProviderFailure('PROVIDER_INVALID_USAGE', 'UNKNOWN', providerId);
      return { output: { text: parsed.data.choices[0]!.message.content ?? '' }, inputTokens: parsed.data.usage.prompt_tokens, outputTokens: parsed.data.usage.completion_tokens, images: 0, requestId: providerId ?? parsed.data.id };
    } catch (error) { if (error instanceof ProviderFailure) throw error; throw new ProviderFailure('PROVIDER_TRANSPORT_UNKNOWN', 'UNKNOWN'); }
  }
  async health() {
    try { const response = await fetch(`${this.baseUrl}/models`, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Authorization: `Bearer ${this.key}` } }); await response.body?.cancel(); return response.ok; } catch { return false; }
  }
}
