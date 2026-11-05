import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AiGeneration, Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { CatalogService } from '../catalog/catalog.service';
import { AuditService } from '../audit/audit.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { financeError, fingerprint, sameOperation } from '../credits/money';
import { ProviderRegistry } from './provider-registry.service';
import { AiPolicyService, policyKey } from './ai-policy.service';
import { EstimateDto, GenerationInputDto, ReconcileGenerationDto } from './ai.dto';
import { cost, pricingSchema, worstCost, type Pricing } from './pricing';
import { ProviderFailure, type ProviderResult } from './provider';
import type { GenerationOutputContract } from './output-contract';
import { cursorPage, pageRange, PageQuery } from '../common/pagination';
type Tx = Prisma.TransactionClient;
const terminal = (status: string) => ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status);
const requestHash = (input: EstimateDto) => fingerprint([input.taskType, input.prompt, input.brandId ?? null, input.maxOutputTokens ?? null]);
@Injectable()
export class AiGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly inFlight = new Map<string, AbortController>();
  private readonly logger = new Logger(AiGatewayService.name);
  private timer?: ReturnType<typeof setInterval>;
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(ConfigService) private readonly config: ConfigService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(CatalogService) private readonly catalog: CatalogService, @Inject(CreditWalletService) private readonly wallet: CreditWalletService, @Inject(AuditService) private readonly audit: AuditService, @Inject(ProviderRegistry) private readonly registry: ProviderRegistry, @Inject(AiPolicyService) private readonly policy: AiPolicyService) {}
  private async validate(input: EstimateDto, generation = false) {
    const instance = generation ? plainToInstance(GenerationInputDto, input) : plainToInstance(EstimateDto, input);
    if ((await validate(instance, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException('Invalid AI request');
  }
  private async authorize(tx: Tx, workspaceId: string, userId: string) {
    if (await this.workspaces.authorize(tx, workspaceId, userId, true) === 'VIEWER') throw new ForbiddenException();
    await this.identity.requireActiveVerifiedUser(tx, userId);
  }
  private async prepare(workspaceId: string, userId: string, input: EstimateDto) {
    const route = this.registry.route(input.taskType);
    const context = input.brandId ? await this.catalog.brandContext(workspaceId, userId, input.brandId) : undefined;
    const prompt = JSON.stringify({ task: input.taskType, brandContext: context ?? null, request: input.prompt });
    if (Buffer.byteLength(prompt, 'utf8') + 64 > route.maxInputTokens) financeError('AI_INPUT_LIMIT', 400);
    if (route.capability !== 'TEXT' && input.maxOutputTokens !== undefined) throw new BadRequestException('Image routes use fixed dimensions/quality, not output token limits');
    const maxOutputTokens = input.maxOutputTokens ?? route.maxOutputTokens;
    if (maxOutputTokens > route.maxOutputTokens) throw new BadRequestException('Output token limit exceeds configured model bound');
    const pricing: Pricing = { route, maxOutputTokens, creditMicrosPerAtom: this.config.get<string>('AI_CREDIT_MICROS_PER_ATOM')! };
    return { prompt, pricing, worst: worstCost(pricing) };
  }
  async estimate(workspaceId: string, userId: string, input: EstimateDto) {
    await this.validate(input); await this.db.$transaction(tx => this.authorize(tx, workspaceId, userId));
    const prepared = await this.prepare(workspaceId, userId, input);
    return { route: prepared.pricing.route.id, provider: prepared.pricing.route.provider, model: prepared.pricing.route.model, priceVersion: prepared.pricing.route.priceVersion, pricingFingerprint: fingerprint(prepared.pricing), inputTokenUpperBound: Buffer.byteLength(prepared.prompt, 'utf8') + 64, reservedInputTokenCeiling: prepared.pricing.route.maxInputTokens, maxOutputTokens: prepared.pricing.maxOutputTokens, worstCostMicros: prepared.worst.micros, worstCredits: prepared.worst.credits, currency: 'USD', creditMicrosPerAtom: prepared.pricing.creditMicrosPerAtom, environmentEnabled: this.config.get<boolean>('AI_ENABLED') };
  }
  /** Internal entry point only. No public generation endpoint or content-generator UI. */
  async generate(workspaceId: string, userId: string, input: GenerationInputDto, signal?: AbortSignal, contract?: GenerationOutputContract): Promise<AiGeneration> {
    await this.validate(input, true); const hash = contract ? fingerprint([requestHash(input), contract.key]) : requestHash(input);
    const previous = await this.db.$transaction(async tx => { await this.authorize(tx, workspaceId, userId); return tx.aiGeneration.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: input.idempotencyKey } } }); });
    if (previous) { sameOperation(hash, previous.fingerprint); return previous; }
    if (!this.config.get<boolean>('AI_ENABLED')) financeError('AI_DISABLED', 409);
    if (signal?.aborted) throw new BadRequestException('Request cancelled before reservation');
    const prepared = await this.prepare(workspaceId, userId, input);
    const intent = await this.db.$transaction(async tx => {
      await this.policy.globalLock(tx); await this.authorize(tx, workspaceId, userId);
      const existing = await tx.aiGeneration.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: input.idempotencyKey } } });
      if (existing) { sameOperation(hash, existing.fingerprint); return { generation: existing, created: false }; }
      const day = await this.policy.admission(tx, workspaceId, prepared.worst.micros);
      const generation = await tx.aiGeneration.create({ data: { workspaceId, idempotencyKey: input.idempotencyKey, fingerprint: hash, taskType: input.taskType, provider: prepared.pricing.route.provider, model: prepared.pricing.route.model, pricing: prepared.pricing, input: { actorId: userId, brandId: input.brandId ?? null, requestHash: hash }, estimatedMicros: prepared.worst.micros, spendDay: day, deadlineAt: new Date(Date.now() + 300000) } });
      await this.wallet.reserve(tx, workspaceId, generation.id, prepared.worst.credits);
      await this.audit.record(tx, { actorId: userId, workspaceId, action: 'ai.reserved', entityType: 'generation', entityId: generation.id, metadata: { credits: prepared.worst.credits.toString(), costMicros: prepared.worst.micros.toString(), priceVersion: prepared.pricing.route.priceVersion } });
      return { generation, created: true };
    });
    if (!intent.created) return intent.generation;
    const generationId = intent.generation.id; const cancellation = new AbortController(); this.inFlight.set(generationId, cancellation);
    try {
      await this.db.$transaction(async tx => {
        const global = await this.policy.globalLock(tx); await this.authorize(tx, workspaceId, userId);
        const workspace = await tx.aiPolicy.findUnique({ where: { key: policyKey(workspaceId) } });
        if (!global.enabled || !workspace?.enabled) financeError('AI_DISABLED', 409);
        const health = await tx.aiProviderHealth.findUnique({ where: { provider: prepared.pricing.route.provider } });
        if (!health?.healthy || Date.now() - health.checkedAt.getTime() > 180000) throw new ConflictException('Provider health unavailable');
        const current = await tx.aiGeneration.findFirst({ where: { id: generationId, workspaceId } });
        if (!current || current.status !== 'QUEUED' || !current.deadlineAt || current.deadlineAt <= new Date()) throw new ConflictException('Generation no longer dispatchable');
        if (signal?.aborted || cancellation.signal.aborted) throw new BadRequestException('Cancelled before dispatch');
        await tx.aiGeneration.update({ where: { id: generationId }, data: { status: 'RUNNING', dispatchedAt: new Date(), deadlineAt: new Date(Date.now() + this.config.get<number>('AI_TIMEOUT_MS')! + 15000) } });
      }).catch(async error => { await this.failure(workspaceId, generationId, new ProviderFailure('DISPATCH_REJECTED', 'UNBILLED')); throw error; });
      const signals = [cancellation.signal, AbortSignal.timeout(this.config.get<number>('AI_TIMEOUT_MS')!), ...(signal ? [signal] : [])];
      let result: ProviderResult;
      try { result = await this.registry.provider(prepared.pricing.route.provider).generate(prepared.pricing.route, prepared.prompt, prepared.pricing.maxOutputTokens, generationId, AbortSignal.any(signals)); }
      catch (error) { return this.failure(workspaceId, generationId, error instanceof ProviderFailure ? error : new ProviderFailure('PROVIDER_UNKNOWN', 'UNKNOWN')); }
      try { return await this.complete(workspaceId, generationId, result, contract); }
      catch { return this.failure(workspaceId, generationId, new ProviderFailure('SETTLEMENT_OR_USAGE_UNKNOWN', 'UNKNOWN', result.requestId)); }
    } finally { this.inFlight.delete(generationId); }
  }
  private async accounting(tx: Tx, workspaceId: string, id: string) {
    await this.policy.globalLock(tx); await this.workspaces.lockForAccounting(tx, workspaceId);
    const generation = await tx.aiGeneration.findFirst({ where: { id, workspaceId } }); if (!generation) throw new NotFoundException(); return generation;
  }
  private async settle(tx: Tx, generation: AiGeneration, inputTokens: number, outputTokens: number, images: number, output?: Prisma.InputJsonValue, providerRequestId?: string) {
    const pricing = pricingSchema.parse(generation.pricing); let actual: ReturnType<typeof cost>;
    try { actual = cost(pricing, inputTokens, outputTokens, images); }
    catch { throw new ConflictException('Usage exceeds the original server bounds'); }
    if (actual.micros > generation.estimatedMicros || !generation.spendDay) throw new ConflictException('Cost exceeds reserved upper bound');
    await this.wallet.settle(tx, generation.workspaceId, generation.id, actual.credits);
    await this.policy.finish(tx, generation.workspaceId, generation.spendDay, generation.estimatedMicros, actual.micros);
    await tx.aiUsage.create({ data: { workspaceId: generation.workspaceId, generationId: generation.id, inputTokens, outputTokens, costMicros: actual.micros, credits: actual.credits } });
    await this.audit.record(tx, { workspaceId: generation.workspaceId, action: 'ai.settled', entityType: 'generation', entityId: generation.id, metadata: { costMicros: actual.micros.toString(), credits: actual.credits.toString() } });
    return tx.aiGeneration.update({ where: { id: generation.id }, data: { status: 'SUCCEEDED', output, errorCode: null, providerRequestId } });
  }
  private complete(workspaceId: string, id: string, result: ProviderResult, contract?: GenerationOutputContract) {
    let output: Prisma.InputJsonValue = result.output; let valid = true;
    if (contract) { try { output = contract.validate(result.output); } catch { valid = false; } }
    return this.db.$transaction(async tx => {
      const generation = await this.accounting(tx, workspaceId, id); if (terminal(generation.status)) return generation;
      const settled = await this.settle(tx, generation, result.inputTokens, result.outputTokens, result.images, valid ? output : undefined, result.requestId);
      if (valid) return settled;
      await this.wallet.refund(tx, workspaceId, id);
      await this.audit.record(tx, { workspaceId, action: 'ai.output_invalid_refunded', entityType: 'generation', entityId: id, metadata: { contract: contract!.key } });
      return tx.aiGeneration.update({ where: { id }, data: { status: 'FAILED', errorCode: 'OUTPUT_SCHEMA_INVALID' } });
    });
  }
  async peek(workspaceId: string, userId: string, idempotencyKey: string) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId); await this.identity.requireActiveVerifiedUser(tx, userId);
      return tx.aiGeneration.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } }, select: { id: true, status: true, output: true, errorCode: true, estimatedMicros: true, usage: { select: { inputTokens: true, outputTokens: true, costMicros: true, credits: true } }, reservation: { select: { status: true, amount: true, settledAmount: true, refundedAt: true } } } });
    });
  }
  private failure(workspaceId: string, id: string, error: ProviderFailure) {
    return this.db.$transaction(async tx => {
      const generation = await this.accounting(tx, workspaceId, id); if (terminal(generation.status)) return generation;
      if (error.billing === 'UNBILLED') {
        await this.wallet.release(tx, workspaceId, id);
        if (generation.spendDay) await this.policy.finish(tx, workspaceId, generation.spendDay, generation.estimatedMicros, 0n);
      }
      if (error.code === 'SETTLEMENT_OR_USAGE_UNKNOWN') {
        // Disable new admissions until an operator investigates usage/pricing or persistence failure.
        await tx.aiPolicy.update({ where: { key: 'global' }, data: { enabled: false } });
      }
      await this.audit.record(tx, { workspaceId, action: error.billing === 'UNKNOWN' ? 'ai.reconciliation_required' : 'ai.released', entityType: 'generation', entityId: id, metadata: { code: error.code } });
      return tx.aiGeneration.update({ where: { id }, data: { status: error.billing === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED', errorCode: error.code, providerRequestId: error.requestId } });
    });
  }
  async cancel(workspaceId: string, userId: string, id: string) {
    await this.db.$transaction(tx => this.authorize(tx, workspaceId, userId));
    const result = await this.db.$transaction(async tx => {
      const generation = await this.accounting(tx, workspaceId, id); await this.authorize(tx, workspaceId, userId);
      if (terminal(generation.status)) return generation;
      if (generation.status === 'QUEUED') {
        await this.wallet.release(tx, workspaceId, id); if (generation.spendDay) await this.policy.finish(tx, workspaceId, generation.spendDay, generation.estimatedMicros, 0n);
      }
      await this.audit.record(tx, { actorId: userId, workspaceId, action: 'ai.cancel_requested', entityType: 'generation', entityId: id });
      return tx.aiGeneration.update({ where: { id }, data: { status: generation.status === 'QUEUED' ? 'CANCELLED' : 'UNKNOWN', errorCode: 'CANCEL_REQUESTED' } });
    });
    this.inFlight.get(id)?.abort(); return result;
  }
  async resolve(workspaceId: string, actorId: string, id: string, dto: ReconcileGenerationDto) {
    if (dto.outcome === 'BILLED' && (dto.inputTokens === undefined || dto.outputTokens === undefined) || dto.outcome === 'UNBILLED' && (dto.inputTokens !== undefined || dto.outputTokens !== undefined)) throw new BadRequestException('Reconciliation usage does not match outcome');
    return this.db.$transaction(async tx => {
      await this.policy.globalLock(tx); await this.identity.requireSystemAdmin(tx, actorId);
      const generation = await this.accounting(tx, workspaceId, id);
      if (generation.status !== 'UNKNOWN') {
        const usage = await tx.aiUsage.findUnique({ where: { generationId: id } });
        if (dto.outcome === 'UNBILLED' && generation.errorCode === 'ADMIN_CONFIRMED_UNBILLED' || dto.outcome === 'BILLED' && usage?.inputTokens === dto.inputTokens && usage?.outputTokens === dto.outputTokens) return generation;
        throw new ConflictException('Only unresolved executions can be reconciled');
      }
      await this.audit.record(tx, { actorId, workspaceId, action: 'ai.reconciled', entityType: 'generation', entityId: id, metadata: { outcome: dto.outcome, evidence: dto.evidence } });
      if (dto.outcome === 'BILLED') return this.settle(tx, generation, dto.inputTokens!, dto.outputTokens!, pricingSchema.parse(generation.pricing).route.capability === 'TEXT' ? 0 : 1);
      await this.wallet.release(tx, workspaceId, id); if (generation.spendDay) await this.policy.finish(tx, workspaceId, generation.spendDay, generation.estimatedMicros, 0n);
      return tx.aiGeneration.update({ where: { id }, data: { status: 'FAILED', errorCode: 'ADMIN_CONFIRMED_UNBILLED' } });
    });
  }
  async history(workspaceId: string, userId: string, query: PageQuery) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId); const scope = `ai-usage:${workspaceId}`;
      const rows = await tx.aiGeneration.findMany({ where: { workspaceId, ...pageRange(query, scope, true) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, select: { id: true, taskType: true, provider: true, model: true, status: true, estimatedMicros: true, errorCode: true, createdAt: true, usage: { select: { inputTokens: true, outputTokens: true, costMicros: true, credits: true } }, reservation: { select: { amount: true, status: true, settledAmount: true, refundedAt: true } } } });
      return cursorPage(rows, query, scope);
    });
  }
  async recover() {
    const stale = await this.db.aiGeneration.findMany({ where: { status: { in: ['QUEUED', 'RUNNING'] }, deadlineAt: { lt: new Date() } }, select: { id: true, workspaceId: true }, take: 50 });
    for (const row of stale) await this.db.$transaction(async tx => {
      const generation = await this.accounting(tx, row.workspaceId, row.id);
      if (!['QUEUED', 'RUNNING'].includes(generation.status) || !generation.deadlineAt || generation.deadlineAt >= new Date()) return;
      const queued = generation.status === 'QUEUED';
      if (queued) { await this.wallet.release(tx, row.workspaceId, row.id); if (generation.spendDay) await this.policy.finish(tx, row.workspaceId, generation.spendDay, generation.estimatedMicros, 0n); }
      await tx.aiGeneration.update({ where: { id: row.id }, data: { status: queued ? 'CANCELLED' : 'UNKNOWN', errorCode: queued ? 'UNDISPATCHED_LEASE_EXPIRED' : 'DISPATCH_OUTCOME_UNKNOWN' } });
      await this.audit.record(tx, { workspaceId: row.workspaceId, action: 'ai.recovered', entityType: 'generation', entityId: row.id, metadata: { dispatched: !queued } });
    });
  }
  onModuleInit() { this.timer = setInterval(() => { void this.recover().catch(() => this.logger.error('AI accounting recovery scan failed')); }, 30000); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); for (const controller of this.inFlight.values()) controller.abort(); }
}
