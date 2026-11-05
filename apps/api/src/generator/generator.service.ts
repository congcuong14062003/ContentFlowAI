import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type GeneratorRun } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { CatalogService } from '../catalog/catalog.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { CreditsService } from '../credits/credits.service';
import { ContentDraftService } from '../content/content-draft.service';
import { AuditService } from '../audit/audit.service';
import { fingerprint, sameOperation } from '../credits/money';
import { cursorPage, pageRange, PageQuery } from '../common/pagination';
import { getTool, parseInput, toolGallery } from './tool-registry';
import { makePrompt, outputSchema, validateOutput } from './output-contract';
import type { CreateRunDto } from './generator.dto';
type Tx = Prisma.TransactionClient;
interface Snapshot { version: 1; prompt: string; outputTokens: number; estimate: { pricingFingerprint: string; worstCredits: string; worstCostMicros: string; environmentEnabled: boolean }; sources: Prisma.InputJsonValue }
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item)) as Prisma.InputJsonValue;
const key = (id: string) => `generator-${id}`;
@Injectable()
export class GeneratorService {
  private readonly active = new Map<string, Promise<void>>();
  private readonly logger = new Logger(GeneratorService.name);
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(CatalogService) private readonly catalog: CatalogService, @Inject(AiGatewayService) private readonly gateway: AiGatewayService, @Inject(CreditsService) private readonly credits: CreditsService, @Inject(ContentDraftService) private readonly content: ContentDraftService, @Inject(AuditService) private readonly audit: AuditService) {}
  private async writer(tx: Tx, workspaceId: string, userId: string) {
    if (await this.workspaces.authorize(tx, workspaceId, userId, true) === 'VIEWER') throw new ForbiddenException();
    await this.identity.requireActiveVerifiedUser(tx, userId);
  }
  async gallery(workspaceId: string, userId: string) { await this.db.$transaction(tx => this.workspaces.authorize(tx, workspaceId, userId)); return toolGallery(); }
  async quote(workspaceId: string, userId: string, raw: unknown) {
    await this.db.$transaction(tx => this.writer(tx, workspaceId, userId));
    const input = parseInput(raw); const sources = await this.catalog.generatorContext(workspaceId, userId, input.brandId, input.productIds);
    const prompt = makePrompt(input, sources.brand, sources.products); const outputTokens = getTool(input.toolId).outputTokens * input.variations;
    const estimate = await this.gateway.estimate(workspaceId, userId, { taskType: 'TEXT_GENERATION', prompt, maxOutputTokens: outputTokens });
    const snapshot = json({ version: 1, prompt, outputTokens, estimate, sources });
    const row = await this.db.$transaction(async tx => {
      await this.writer(tx, workspaceId, userId);
      return tx.generatorQuote.create({ data: { workspaceId, actorId: userId, toolId: input.toolId, fingerprint: fingerprint(input), input: json(input), snapshot, expiresAt: new Date(Date.now() + 300000) } });
    });
    return { id: row.id, expiresAt: row.expiresAt, estimate, credits: await this.credits.balance(workspaceId, userId) };
  }
  async create(workspaceId: string, userId: string, dto: CreateRunDto) {
    const run = await this.db.$transaction(async tx => {
      await this.writer(tx, workspaceId, userId);
      const previous = await tx.generatorRun.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: dto.idempotencyKey } } });
      if (previous) { sameOperation(previous.quoteId, dto.quoteId); if (previous.actorId !== userId) throw new NotFoundException(); return previous; }
      const quote = await tx.generatorQuote.findFirst({ where: { id: dto.quoteId, workspaceId, actorId: userId } });
      if (!quote) throw new NotFoundException(); if (quote.expiresAt <= new Date()) throw new ConflictException('Quote expired');
      if (await tx.generatorRun.findUnique({ where: { quoteId: quote.id } })) throw new ConflictException('Quote already used; request a new preview');
      const result = await tx.generatorRun.create({ data: { workspaceId, actorId: userId, quoteId: quote.id, idempotencyKey: dto.idempotencyKey } });
      await this.audit.record(tx, { actorId: userId, workspaceId, action: 'generator.requested', entityType: 'generator_run', entityId: result.id, metadata: { tool: quote.toolId } }); return result;
    });
    this.launch(run, userId); return this.detail(workspaceId, userId, run.id);
  }
  private launch(run: GeneratorRun, userId: string) {
    if (this.active.has(run.id) || !['PENDING', 'RUNNING', 'FAILED'].includes(run.status)) return;
    const work = this.execute(run, userId).catch(() => { this.logger.error('Generator projection update failed; restore via run history'); }).finally(() => this.active.delete(run.id));
    this.active.set(run.id, work);
  }
  private async execute(run: GeneratorRun, userId: string) {
    try {
      const quote = await this.db.generatorQuote.findFirstOrThrow({ where: { id: run.quoteId, workspaceId: run.workspaceId } });
      const input = parseInput(quote.input); const snapshot = quote.snapshot as unknown as Snapshot;
      const existing = await this.gateway.peek(run.workspaceId, userId, key(run.id));
      if (!existing) {
        if (quote.expiresAt <= new Date()) throw new ConflictException('Quote expired');
        const current = await this.gateway.estimate(run.workspaceId, userId, { taskType: 'TEXT_GENERATION', prompt: snapshot.prompt, maxOutputTokens: snapshot.outputTokens });
        if (current.pricingFingerprint !== snapshot.estimate.pricingFingerprint) throw new ConflictException('Model pricing changed; request a new preview');
      }
      await this.gateway.generate(run.workspaceId, userId, { taskType: 'TEXT_GENERATION', prompt: snapshot.prompt, maxOutputTokens: snapshot.outputTokens, idempotencyKey: key(run.id) }, undefined, { key: `generator/v1/${input.toolId}`, validate: raw => validateOutput(input, raw) });
      await this.sync(run, userId);
    } catch (error) {
      const gateway = await this.gateway.peek(run.workspaceId, userId, key(run.id)).catch(() => null);
      if (gateway) { await this.sync(run, userId); return; }
      let code = 'GENERATION_FAILED';
      if (error instanceof HttpException) { const body = error.getResponse(); code = typeof body === 'object' && body && 'code' in body && typeof body.code === 'string' ? body.code : `HTTP_${error.getStatus()}`; }
      await this.db.generatorRun.updateMany({ where: { id: run.id, workspaceId: run.workspaceId, aiGenerationId: null }, data: { status: 'FAILED', errorCode: code } });
    }
  }
  private async sync(run: GeneratorRun, userId: string) {
    const generation = await this.gateway.peek(run.workspaceId, userId, key(run.id));
    if (!generation) {
      const quote = await this.db.generatorQuote.findFirstOrThrow({ where: { id: run.quoteId, workspaceId: run.workspaceId } });
      if (run.status === 'PENDING' && quote.expiresAt <= new Date() && Date.now() - run.createdAt.getTime() > 120000) {
        await this.db.generatorRun.updateMany({ where: { id: run.id, workspaceId: run.workspaceId, aiGenerationId: null, status: 'PENDING' }, data: { status: 'FAILED', errorCode: 'REQUEST_NOT_DISPATCHED' } });
        return this.db.generatorRun.findUniqueOrThrow({ where: { id: run.id } });
      }
      return run;
    }
    let status: string = generation.status; let result: Prisma.InputJsonValue | undefined;
    if (generation.status === 'QUEUED') status = 'RESERVED';
    if (generation.status === 'SUCCEEDED') {
      if (!generation.output) status = 'OUTPUT_UNAVAILABLE';
      else {
        const quote = await this.db.generatorQuote.findFirstOrThrow({ where: { id: run.quoteId, workspaceId: run.workspaceId } });
        const parsed = outputSchema(parseInput(quote.input)).safeParse(generation.output);
        if (!parsed.success) status = 'OUTPUT_UNAVAILABLE'; else result = json(parsed.data);
      }
    }
    if (generation.errorCode === 'OUTPUT_SCHEMA_INVALID') status = 'INVALID_OUTPUT';
    await this.db.generatorRun.updateMany({ where: { id: run.id, workspaceId: run.workspaceId, ...(['RESERVED','RUNNING'].includes(status) ? { status: { notIn: ['SUCCEEDED','FAILED','INVALID_OUTPUT','OUTPUT_UNAVAILABLE','CANCELLED'] } } : {}) }, data: { aiGenerationId: generation.id, status, errorCode: generation.errorCode, ...(result ? { result } : {}) } });
    return this.db.generatorRun.findUniqueOrThrow({ where: { id: run.id } });
  }
  async detail(workspaceId: string, userId: string, id: string) {
    let run = await this.db.$transaction(async tx => { await this.workspaces.authorize(tx, workspaceId, userId); const row = await tx.generatorRun.findFirst({ where: { id, workspaceId } }); if (!row) throw new NotFoundException(); return row; });
    run = await this.sync(run, userId);
    const [quote, generation, credits, drafts] = await Promise.all([
      this.db.generatorQuote.findFirstOrThrow({ where: { id: run.quoteId, workspaceId } }), this.gateway.peek(workspaceId, userId, key(run.id)), this.credits.balance(workspaceId, userId), this.db.generatedDraft.findMany({ where: { workspaceId, runId: id }, select: { variationIndex: true, contentId: true } })
    ]);
    return { id: run.id, status: run.status, errorCode: run.errorCode, createdAt: run.createdAt, toolId: quote.toolId, input: quote.input, result: run.result, estimate: (quote.snapshot as unknown as Snapshot).estimate, usage: generation?.usage ?? null, reservation: generation?.reservation ?? null, credits, drafts, canResume: !generation && quote.actorId === userId && quote.expiresAt > new Date() && (run.status === 'FAILED' || Date.now() - run.createdAt.getTime() > 10000) };
  }
  async resume(workspaceId: string, userId: string, id: string) {
    const run = await this.db.$transaction(async tx => { await this.writer(tx, workspaceId, userId); const row = await tx.generatorRun.findFirst({ where: { id, workspaceId, actorId: userId } }); if (!row) throw new NotFoundException(); return row; });
    this.launch(run, userId); return this.detail(workspaceId, userId, id);
  }
  async history(workspaceId: string, userId: string, query: PageQuery) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId); const scope = `generator:${workspaceId}`;
      return cursorPage(await tx.generatorRun.findMany({ where: { workspaceId, ...pageRange(query, scope, true) }, select: { id: true, status: true, createdAt: true, quote: { select: { toolId: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 }), query, scope);
    });
  }
  async save(workspaceId: string, userId: string, id: string, variationIndex: number) {
    await this.detail(workspaceId, userId, id);
    return this.db.$transaction(async tx => {
      await this.writer(tx, workspaceId, userId);
      const run = await tx.generatorRun.findFirst({ where: { workspaceId, id, status: 'SUCCEEDED' }, include: { quote: true } }); if (!run || !run.result) throw new ConflictException('Only validated successful results can be saved');
      const prior = await tx.generatedDraft.findUnique({ where: { workspaceId_runId_variationIndex: { workspaceId, runId: id, variationIndex } } });
      if (prior) return this.content.read(tx, workspaceId, userId, prior.contentId);
      const input = parseInput(run.quote.input); const result = outputSchema(input).parse(run.result); const variation = result.variations[variationIndex];
      if (!variation) throw new BadRequestException('Unavailable variation');
      const body = json({ schemaVersion: 1, kind: 'generated_marketing', toolId: input.toolId, language: input.language, platform: input.platform, variation, warnings: result.warnings, sourceRunId: id });
      const content = await this.content.create(tx, workspaceId, userId, input.brandId, variation.title, body, id);
      await tx.generatedDraft.create({ data: { workspaceId, runId: id, variationIndex, contentId: content.id } });
      return this.content.read(tx, workspaceId, userId, content.id);
    });
  }
  readDraft(workspaceId: string, userId: string, id: string) { return this.db.$transaction(tx => this.content.read(tx, workspaceId, userId, id)); }
}
