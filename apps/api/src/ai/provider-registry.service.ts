import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../platform/prisma.service';
import { parseProviderConfig, type TaskType } from './ai.config';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import type { AiProvider } from './provider';
import { financeError } from '../credits/money';
@Injectable()
export class ProviderRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly providers = new Map<string, AiProvider>();
  private readonly logger = new Logger(ProviderRegistry.name);
  private readonly routing;
  private timer?: ReturnType<typeof setInterval>;
  constructor(@Inject(ConfigService) private readonly config: ConfigService, @Inject(PrismaService) private readonly db: PrismaService) {
    this.routing = parseProviderConfig(config.get<string>('AI_ROUTING_CONFIG')!, config.get<string>('NODE_ENV')!);
    for (const provider of this.routing.providers) {
      const key = process.env[provider.keyEnv];
      if (config.get<boolean>('AI_ENABLED') && !key) throw new Error(`Missing secret environment variable for AI provider ${provider.id}`);
      if (key) this.providers.set(provider.id, new OpenAiCompatibleProvider(provider.id, provider.baseUrl, key));
    }
  }
  route(task: TaskType) { const route = this.routing.models.find(model => model.tasks.includes(task)); if (!route || !this.providers.has(route.provider)) financeError('AI_NOT_CONFIGURED', 503); return route; }
  provider(id: string) { const provider = this.providers.get(id); if (!provider) financeError('AI_NOT_CONFIGURED', 503); return provider; }
  async refreshHealth() {
    return Promise.all([...this.providers.values()].map(async provider => {
      const healthy = await provider.health(); const data = { healthy, checkedAt: new Date(), errorCode: healthy ? null : 'PROVIDER_HEALTH_FAILED' };
      return this.db.aiProviderHealth.upsert({ where: { provider: provider.id }, create: { provider: provider.id, ...data }, update: data });
    }));
  }
  async onModuleInit() {
    if (!this.config.get<boolean>('AI_ENABLED') || !this.providers.size) return;
    await this.refreshHealth();
    this.timer = setInterval(() => { void this.refreshHealth().catch(() => this.logger.error('Provider health persistence failed')); }, 60000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  publicRoutes() { return this.routing.models.map(model => ({ id: model.id, provider: model.provider, model: model.model, tasks: model.tasks, capability: model.capability, priceVersion: model.priceVersion })); }
}
