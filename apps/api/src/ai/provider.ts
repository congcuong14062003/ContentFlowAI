import type { ModelRoute } from './ai.config';
export interface ProviderResult {
  output: { text: string } | { imageBase64: string; mimeType: 'image/png' };
  inputTokens: number; outputTokens: number; images: number; requestId?: string;
}
export interface AiProvider {
  readonly id: string;
  generate(route: ModelRoute, prompt: string, maxOutputTokens: number, requestId: string, signal: AbortSignal): Promise<ProviderResult>;
  health(): Promise<boolean>;
}
/** Only a definitive pre-execution rejection permits automatic credit release. */
export class ProviderFailure extends Error {
  constructor(readonly code: string, readonly billing: 'UNBILLED' | 'UNKNOWN', readonly requestId?: string) { super(code); }
}
