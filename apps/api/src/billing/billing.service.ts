import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../platform/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { CatalogService } from '../catalog/catalog.service';
import { MediaService } from '../media/media.service';
import { AuditService } from '../audit/audit.service';
import { cursorPage, pageRange, PageQuery } from '../common/pagination';
import { CancelSubscriptionDto, ManualConfirmDto, PlanActivationDto, PlanCreateDto, SubscribeDto } from './billing.dto';

type Tx = Prisma.TransactionClient;
function periodEnd(start: Date, cadence: string) {
  const year = start.getUTCFullYear() + (cadence === 'YEARLY' ? 1 : 0);
  const month = start.getUTCMonth() + (cadence === 'MONTHLY' ? 1 : 0);
  const first = new Date(Date.UTC(year, month, 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
  const finalDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(start.getUTCDate(), finalDay));
  return first;
}
export { periodEnd };

@Injectable()
export class BillingService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(WorkspaceService) private readonly workspaces: WorkspaceService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(CreditWalletService) private readonly wallet: CreditWalletService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  plans() { return this.db.plan.findMany({ where: { active: true }, orderBy: [{ priceMinor: 'asc' }, { code: 'asc' }], select: { id: true, code: true, name: true, tier: true, cadence: true, priceMinor: true, currency: true, memberLimit: true, brandLimit: true, storageLimitBytes: true, periodCredits: true, features: true } }); }
  adminPlans(actorId: string) { return this.db.$transaction(async tx => { await this.identity.requireSystemAdmin(tx, actorId); return tx.plan.findMany({ orderBy: { code: 'asc' } }); }); }

  async createPlan(actorId: string, dto: PlanCreateDto) {
    if (dto.code !== `${dto.tier}_${dto.cadence}_V${dto.code.split('_V').at(-1)}` || dto.tier === 'FREE' && dto.priceMinor !== '0' || dto.tier !== 'FREE' && dto.active && dto.priceMinor === '0') throw new BadRequestException('Plan code/tier/cadence/price mismatch');
    try { return await this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx, actorId);
      const plan = await tx.plan.create({ data: { code: dto.code, name: dto.name.trim(), tier: dto.tier, cadence: dto.cadence, priceMinor: BigInt(dto.priceMinor), currency: dto.currency, memberLimit: dto.memberLimit, brandLimit: dto.brandLimit, storageLimitBytes: BigInt(dto.storageLimitBytes), periodCredits: BigInt(dto.periodCredits), monthlyCredits: BigInt(dto.periodCredits), features: dto.features, active: dto.active } });
      await this.audit.record(tx, { actorId, action: 'billing.plan_created', entityType: 'plan', entityId: plan.id, metadata: { code: plan.code, priceMinor: dto.priceMinor, currency: dto.currency } });
      return plan;
    }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Plan code already exists'); throw error; }
  }

  activatePlan(actorId: string, planId: string, dto: PlanActivationDto) {
    return this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx, actorId);
      const plan = await tx.plan.findUnique({ where: { id: planId } }); if (!plan) throw new NotFoundException();
      if (dto.active && plan.tier !== 'FREE' && plan.priceMinor === 0n) throw new ConflictException('Paid plan has no configured price');
      const result = await tx.plan.update({ where: { id: planId }, data: { active: dto.active } });
      await this.audit.record(tx, { actorId, action: 'billing.plan_activation', entityType: 'plan', entityId: planId, metadata: { active: dto.active } });
      return result;
    });
  }

  private async owner(tx: Tx, workspaceId: string, actorId: string) {
    if (await this.workspaces.authorize(tx, workspaceId, actorId, true) !== 'OWNER') throw new ForbiddenException();
    await this.identity.requireActiveVerifiedUser(tx, actorId);
  }
  private async entitlements(tx: Tx, workspaceId: string, plan: { memberLimit: number; brandLimit: number; storageLimitBytes: bigint }) {
    if (await tx.membership.count({ where: { workspaceId } }) > plan.memberLimit) throw new ConflictException('Workspace member count exceeds plan limit');
    await this.catalog.applyPlanLimit(tx, workspaceId, plan.brandLimit);
    await this.media.applyPlanLimit(tx, workspaceId, plan.storageLimitBytes);
  }
  private async credits(tx: Tx, workspaceId: string, subscriptionId: string, plan: { periodCredits: bigint }, start: Date, end: Date) {
    if (plan.periodCredits === 0n) return;
    const reference = `subscription:${subscriptionId}:${start.toISOString()}`;
    await this.wallet.grant(tx, workspaceId, { source: 'SUBSCRIPTION', amount: plan.periodCredits.toString(), expiresAt: end.toISOString(), idempotencyKey: reference, reference });
  }

  async current(workspaceId: string, actorId: string) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, actorId);
      return tx.subscription.findFirst({ where: { workspaceId, status: { in: ['ACTIVE', 'PAST_DUE', 'INCOMPLETE'] } }, include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 1, include: { payment: true } } }, orderBy: { createdAt: 'desc' } });
    });
  }

  async subscribe(workspaceId: string, actorId: string, dto: SubscribeDto) {
    return this.db.$transaction(async tx => {
      await this.owner(tx, workspaceId, actorId);
      await this.workspaces.lockForAdministration(tx, workspaceId);
      const existing = await tx.subscription.findUnique({ where: { provider_externalId: { provider: 'internal-request', externalId: `${workspaceId}:${dto.idempotencyKey}` } }, include: { invoices: { include: { payment: true } } } });
      if (existing) { if (existing.planId !== dto.planId) throw new ConflictException('Subscription request key reused for a different plan'); return existing; }
      if (await tx.subscription.findFirst({ where: { workspaceId, status: { in: ['INCOMPLETE', 'ACTIVE', 'PAST_DUE'] } } })) throw new ConflictException('Workspace already has an open subscription');
      const plan = await tx.plan.findFirst({ where: { id: dto.planId, active: true } }); if (!plan) throw new NotFoundException();
      const free = plan.tier === 'FREE' && plan.priceMinor === 0n;
      if (!free && plan.priceMinor === 0n) throw new ConflictException('Paid plan has no configured price');
      const now = new Date(); const end = periodEnd(now, plan.cadence); const subscriptionId = randomUUID();
      await tx.subscription.create({ data: { id: subscriptionId, workspaceId, planId: plan.id, provider: 'internal-request', externalId: `${workspaceId}:${dto.idempotencyKey}`, status: free ? 'ACTIVE' : 'INCOMPLETE', currentPeriodStart: free ? now : null, currentPeriodEnd: free ? end : null } });
      await tx.subscriptionEvent.create({ data: { workspaceId, subscriptionId, planId: plan.id, action: free ? 'ACTIVATED' : 'REQUESTED', periodStart: now, periodEnd: end } });
      if (free) { await this.entitlements(tx, workspaceId, plan); await this.credits(tx, workspaceId, subscriptionId, plan, now, end); }
      else {
        const invoice = await tx.invoice.create({ data: { workspaceId, subscriptionId, planId: plan.id, amountMinor: plan.priceMinor, currency: plan.currency, periodStart: now, periodEnd: end } });
        await tx.payment.create({ data: { workspaceId, subscriptionId, invoiceId: invoice.id, provider: 'manual', externalId: invoice.id, amountMinor: invoice.amountMinor, currency: invoice.currency } });
      }
      await this.audit.record(tx, { workspaceId, actorId, action: 'billing.subscription_requested', entityType: 'subscription', entityId: subscriptionId, metadata: { planId: plan.id, free } });
      return tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { invoices: { include: { payment: true } } } });
    });
  }

  async confirmManual(workspaceId: string, actorId: string, paymentId: string, dto: ManualConfirmDto) {
    return this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx, actorId); await this.workspaces.lockForAdministration(tx, workspaceId);
      const payment = await tx.payment.findFirst({ where: { id: paymentId, workspaceId, provider: 'manual' }, include: { invoice: true, subscription: { include: { plan: true } } } });
      if (!payment?.invoice || !payment.subscription) throw new NotFoundException();
      if (payment.status === 'SUCCEEDED') return payment;
      if (payment.status !== 'PENDING' || payment.invoice.status !== 'PENDING' || !['INCOMPLETE', 'ACTIVE', 'PAST_DUE'].includes(payment.subscription.status)) throw new ConflictException('Payment is not pending');
      const invoice = payment.invoice; const subscription = payment.subscription; const plan = await tx.plan.findUniqueOrThrow({ where: { id: invoice.planId } });
      if (invoice.amountMinor !== payment.amountMinor || invoice.currency !== payment.currency || invoice.amountMinor !== plan.priceMinor) throw new ConflictException('Invoice/payment mismatch');
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED', collectedAt: new Date() } });
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID' } });
      await tx.subscription.update({ where: { id: subscription.id }, data: { status: 'ACTIVE', currentPeriodStart: invoice.periodStart, currentPeriodEnd: invoice.periodEnd, graceUntil: null, cancelAtPeriodEnd: false } });
      await this.entitlements(tx, workspaceId, plan);
      await this.credits(tx, workspaceId, subscription.id, plan, invoice.periodStart, invoice.periodEnd);
      await tx.subscriptionEvent.create({ data: { workspaceId, subscriptionId: subscription.id, planId: plan.id, action: 'ACTIVATED', periodStart: invoice.periodStart, periodEnd: invoice.periodEnd } });
      await this.audit.record(tx, { workspaceId, actorId, action: 'billing.payment_manually_confirmed', entityType: 'payment', entityId: payment.id, metadata: { evidence: dto.evidence, invoiceId: invoice.id, amountMinor: invoice.amountMinor.toString(), currency: invoice.currency } });
      return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    });
  }

  async cancel(workspaceId: string, actorId: string, subscriptionId: string, dto: CancelSubscriptionDto) {
    if (dto.atPeriodEnd === false) throw new BadRequestException('Immediate cancellation is not supported');
    return this.db.$transaction(async tx => {
      await this.owner(tx, workspaceId, actorId);
      await this.workspaces.lockForAdministration(tx, workspaceId);
      const subscription = await tx.subscription.findFirst({ where: { id: subscriptionId, workspaceId, status: { in: ['ACTIVE', 'INCOMPLETE'] } } }); if (!subscription) throw new NotFoundException();
      if (subscription.status === 'INCOMPLETE') {
        await tx.invoice.updateMany({ where: { workspaceId, subscriptionId, status: 'PENDING' }, data: { status: 'VOID' } });
        await tx.payment.updateMany({ where: { workspaceId, subscriptionId, status: 'PENDING' }, data: { status: 'FAILED' } });
        const cancelled = await tx.subscription.update({ where: { id: subscriptionId }, data: { status: 'CANCELLED' } });
        await tx.subscriptionEvent.create({ data: { workspaceId, subscriptionId, planId: subscription.planId, action: 'REQUEST_CANCELLED' } });
        await this.audit.record(tx, { workspaceId, actorId, action: 'billing.request_cancelled', entityType: 'subscription', entityId: subscriptionId });
        return cancelled;
      }
      if (subscription.cancelAtPeriodEnd) return subscription;
      const updated = await tx.subscription.update({ where: { id: subscriptionId }, data: { cancelAtPeriodEnd: true } });
      await tx.subscriptionEvent.create({ data: { workspaceId, subscriptionId, planId: subscription.planId, action: 'CANCELLATION_SCHEDULED', periodStart: subscription.currentPeriodStart, periodEnd: subscription.currentPeriodEnd } });
      await this.audit.record(tx, { workspaceId, actorId, action: 'billing.cancellation_scheduled', entityType: 'subscription', entityId: subscriptionId });
      return updated;
    });
  }

  async invoices(workspaceId: string, actorId: string, query: PageQuery) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, actorId);
      const scope = `invoices:${workspaceId}`;
      return cursorPage(await tx.invoice.findMany({ where: { workspaceId, ...pageRange(query, scope, true) }, include: { payment: { select: { id: true, status: true, provider: true, createdAt: true } }, plan: { select: { name: true, tier: true, cadence: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 }), query, scope);
    });
  }
}
