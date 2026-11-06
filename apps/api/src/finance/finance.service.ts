import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
import { CostEntryDto, FinanceQuery } from './finance.dto';

type Row = { day: Date; value: string };
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
function scaled(value: string, places: number) { const [head, fraction=''] = value.split('.'); const whole=head??'0'; const negative=whole.startsWith('-'); const magnitude=BigInt(whole.replace('-','') || '0') * 10n**BigInt(places) + BigInt((fraction+'0'.repeat(places)).slice(0,places) || '0'); return negative ? -magnitude : magnitude; }
const sum = (rows: Row[], places=0) => rows.reduce((total, row) => total + scaled(row.value,places), 0n);
function decimal(value: bigint, places: number) { const scale=10n**BigInt(places); const sign=value<0n?'-':''; const abs=value<0n?-value:value; return `${sign}${abs/scale}.${String(abs%scale).padStart(places,'0')}`; }

@Injectable()
export class FinanceService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(AuditService) private readonly audit: AuditService) {}
  async addCost(actorId: string, dto: CostEntryDto) {
    const incurredAt=new Date(dto.incurredAt);
    if (incurredAt>new Date()) throw new BadRequestException('Future cost date');
    try { return await this.db.$transaction(async tx=>{
      await this.identity.requireSystemAdmin(tx,actorId);
      if (dto.workspaceId && !await tx.workspace.findUnique({where:{id:dto.workspaceId}})) throw new NotFoundException('Workspace');
      const cost=await tx.financialCost.create({data:{actorId,workspaceId:dto.workspaceId,category:dto.category,amountMicros:BigInt(dto.amountMicros),incurredAt,sourceKey:dto.sourceKey.trim(),note:dto.note.trim()}});
      await this.audit.record(tx,{actorId,workspaceId:dto.workspaceId,action:'finance.cost_recorded',entityType:'financial_cost',entityId:cost.id,metadata:{category:dto.category,amountMicros:dto.amountMicros,sourceKey:dto.sourceKey}});
      return cost;
    }); } catch(error) { if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002') throw new ConflictException('Cost source key already exists'); throw error; }
  }
  async costs(actorId:string,query:FinanceQuery) {
    await this.db.$transaction(tx=>this.identity.requireSystemAdmin(tx,actorId));
    return this.db.financialCost.findMany({where:{incurredAt:{gte:new Date(query.from),lt:new Date(query.to)},...(query.workspaceId?{workspaceId:query.workspaceId}:{})},orderBy:{incurredAt:'desc'},take:100,select:{id:true,workspaceId:true,category:true,amountMicros:true,incurredAt:true,sourceKey:true,note:true}});
  }
  async report(actorId: string, query: FinanceQuery) {
    await this.db.$transaction(tx => this.identity.requireSystemAdmin(tx, actorId));
    const from = new Date(query.from); const to = new Date(query.to);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to || to.getTime() - from.getTime() > 366 * 2 * 86400000 || to > new Date()) throw new BadRequestException('Invalid date range (maximum two years, ending no later than now)');
    const currency = query.currency ?? 'USD';
    const ws = query.workspaceId ? Prisma.sql` AND "workspaceId" = ${query.workspaceId}::uuid` : Prisma.empty;
    const provider = query.provider ? Prisma.sql` AND g.provider = ${query.provider}` : Prisma.empty;
    // Numeric is returned as text to preserve exact aggregate precision at the API boundary.
    const [revenue, collections, aiCost, creditUsage, growth, byPlan, byProvider, byWorkspace, active, enteredCosts, costDaily, costWorkspaces] = await Promise.all([
      this.db.$queryRaw<Row[]>(Prisma.sql`SELECT day::date AS day, SUM(i."amountMinor"::numeric * EXTRACT(EPOCH FROM (LEAST(i."periodEnd", day + interval '1 day', ${to}::timestamptz) - GREATEST(i."periodStart", day, ${from}::timestamptz))) / NULLIF(EXTRACT(EPOCH FROM (i."periodEnd" - i."periodStart")),0))::text AS value FROM "Invoice" i CROSS JOIN LATERAL generate_series(date_trunc('day', GREATEST(i."periodStart", ${from}::timestamptz)), date_trunc('day', LEAST(i."periodEnd" - interval '1 microsecond', ${to}::timestamptz - interval '1 microsecond')), interval '1 day') day WHERE i.status = 'PAID' AND i.currency = ${currency} AND i."periodStart" < ${to} AND i."periodEnd" > ${from} ${query.workspaceId ? Prisma.sql`AND i."workspaceId" = ${query.workspaceId}::uuid` : Prisma.empty} ${query.planId ? Prisma.sql`AND i."planId" = ${query.planId}::uuid` : Prisma.empty} GROUP BY 1 ORDER BY 1`),
      this.db.$queryRaw<Row[]>(Prisma.sql`SELECT date_trunc('day', "collectedAt") AS day, COALESCE(SUM("amountMinor"),0)::text AS value FROM "Payment" WHERE status = 'SUCCEEDED' AND currency = ${currency} AND "collectedAt" >= ${from} AND "collectedAt" < ${to} ${ws} GROUP BY 1 ORDER BY 1`),
      this.db.$queryRaw<Row[]>(Prisma.sql`SELECT date_trunc('day', u."createdAt") AS day, COALESCE(SUM(u."costMicros"),0)::text AS value FROM "AiUsage" u JOIN "AiGeneration" g ON g.id = u."generationId" WHERE u."createdAt" >= ${from} AND u."createdAt" < ${to} ${query.workspaceId ? Prisma.sql`AND u."workspaceId" = ${query.workspaceId}::uuid` : Prisma.empty} ${provider} GROUP BY 1 ORDER BY 1`),
      this.db.$queryRaw<Row[]>(Prisma.sql`SELECT date_trunc('day', u."createdAt") AS day, COALESCE(SUM(u.credits),0)::text AS value FROM "AiUsage" u JOIN "AiGeneration" g ON g.id = u."generationId" WHERE u."createdAt" >= ${from} AND u."createdAt" < ${to} ${query.workspaceId ? Prisma.sql`AND u."workspaceId" = ${query.workspaceId}::uuid` : Prisma.empty} ${provider} GROUP BY 1 ORDER BY 1`),
      this.db.$queryRaw<Row[]>(Prisma.sql`SELECT date_trunc('day', "createdAt") AS day, count(*)::text AS value FROM "User" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1 ORDER BY 1`),
      this.db.$queryRaw<{ planId: string; name: string; value: string }[]>(Prisma.sql`SELECT i."planId", p.name, SUM(i."amountMinor")::text AS value FROM "Invoice" i JOIN "Plan" p ON p.id=i."planId" WHERE i.status='PAID' AND i.currency=${currency} AND i."createdAt">=${from} AND i."createdAt"<${to} ${query.workspaceId ? Prisma.sql`AND i."workspaceId"=${query.workspaceId}::uuid` : Prisma.empty} ${query.planId ? Prisma.sql`AND i."planId"=${query.planId}::uuid` : Prisma.empty} GROUP BY 1,2 ORDER BY 2`),
      this.db.$queryRaw<{ provider: string; value: string }[]>(Prisma.sql`SELECT g.provider, SUM(u."costMicros")::text AS value FROM "AiUsage" u JOIN "AiGeneration" g ON g.id=u."generationId" WHERE u."createdAt">=${from} AND u."createdAt"<${to} ${query.workspaceId ? Prisma.sql`AND u."workspaceId"=${query.workspaceId}::uuid` : Prisma.empty} ${provider} GROUP BY 1 ORDER BY 1`),
      this.db.$queryRaw<{ workspaceId: string; name: string; value: string }[]>(Prisma.sql`SELECT u."workspaceId", w.name, SUM(u."costMicros")::text AS value FROM "AiUsage" u JOIN "AiGeneration" g ON g.id=u."generationId" JOIN "Workspace" w ON w.id=u."workspaceId" WHERE u."createdAt">=${from} AND u."createdAt"<${to} ${query.workspaceId ? Prisma.sql`AND u."workspaceId"=${query.workspaceId}::uuid` : Prisma.empty} ${provider} GROUP BY 1,2 ORDER BY SUM(u."costMicros") DESC LIMIT 100`),
      this.db.subscription.findMany({ where: { status: 'ACTIVE', plan: { priceMinor: { gt: 0 }, currency }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}), ...(query.planId ? { planId: query.planId } : {}) }, select: { workspaceId: true, plan: { select: { priceMinor: true, cadence: true } } } }),
      this.db.financialCost.groupBy({by:['category'],where:{incurredAt:{gte:from,lt:to},...(query.workspaceId?{workspaceId:query.workspaceId}:{})},_sum:{amountMicros:true}}),
      this.db.$queryRaw<{day:Date;category:string;value:string}[]>(Prisma.sql`SELECT date_trunc('day',"incurredAt") AS day, category, SUM("amountMicros")::text AS value FROM "FinancialCost" WHERE "incurredAt">=${from} AND "incurredAt"<${to} ${ws} GROUP BY 1,2 ORDER BY 1`),
      this.db.financialCost.groupBy({by:['workspaceId'],where:{incurredAt:{gte:from,lt:to},workspaceId:{not:null},...(query.workspaceId?{workspaceId:query.workspaceId}:{})},_sum:{amountMicros:true}})
    ]);
    const mrrScaled = active.reduce((total, item) => total + item.plan.priceMinor * 1000000n / (item.plan.cadence === 'YEARLY' ? 12n : 1n), 0n);
    const recognizedScaled = sum(revenue,6); const collectedMinor = sum(collections); const providerCostMicros = sum(aiCost);
    const contributionMicros = currency === 'USD' && !query.planId ? recognizedScaled / 100n - providerCostMicros : null;
    const storageCost=enteredCosts.find(item=>item.category==='STORAGE')?._sum.amountMicros??null;
    const infrastructureCost=enteredCosts.find(item=>item.category==='INFRASTRUCTURE')?._sum.amountMicros??null;
    const fullContribution=contributionMicros!==null && !query.provider && storageCost!==null && infrastructureCost!==null ? contributionMicros-storageCost-infrastructureCost : null;
    const daily = new Map<string, { day: string; revenueMinor: number; collectedMinor: number; providerCostMicros: number; credits: number; users: number; contributionMicros: number | null }>();
    for (let at = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); at < to; at.setUTCDate(at.getUTCDate()+1)) { const day=dateKey(at); daily.set(day,{day,revenueMinor:0,collectedMinor:0,providerCostMicros:0,credits:0,users:0,contributionMicros:null}); }
    for (const [rows, key] of [[revenue,'revenueMinor'],[collections,'collectedMinor'],[aiCost,'providerCostMicros'],[creditUsage,'credits'],[growth,'users']] as const) for (const row of rows) { const item=daily.get(dateKey(row.day)); if (item) item[key]=Number(row.value); }
    for (const item of daily.values()) if (currency === 'USD' && !query.planId) item.contributionMicros = Math.round(item.revenueMinor * 10000 - item.providerCostMicros);
    const manualByWorkspace=new Map(costWorkspaces.map(item=>[item.workspaceId!,item._sum.amountMicros??0n]));
    const costPerWorkspace=[...new Set([...byWorkspace.map(item=>item.workspaceId),...manualByWorkspace.keys()])].map(id=>{const ai=BigInt(byWorkspace.find(item=>item.workspaceId===id)?.value??'0');const entered=manualByWorkspace.get(id)??0n;return {workspaceId:id,name:byWorkspace.find(item=>item.workspaceId===id)?.name??id,aiMicros:String(ai),enteredMicros:String(entered),totalKnownMicros:String(ai+entered)};});
    return { window: { from, to, currency, workspaceId: query.workspaceId ?? null, planId: query.planId ?? null, provider: query.provider ?? null }, definitions: { recognizedRevenue: 'Paid invoice amount allocated over its service period, in currency minor units', collections: 'Succeeded payments by collectedAt, in currency minor units', mrr: 'Current active paying subscriptions normalized to one month; snapshot, not historical', providerCost: 'Measured AI usage cost in USD micros', contribution: 'Recognized USD revenue less measured AI provider cost only; full contribution also subtracts manually entered costs when both categories have entries', refunds: 'No refund event or timestamp source is available', historicalCollections: 'Pre-Phase-12 succeeded payments were backfilled from updatedAt' }, totals: { recognizedMinor: decimal(recognizedScaled,6), collectedMinor: String(collectedMinor), mrrMinor: decimal(mrrScaled,6), activePayingCustomers: new Set(active.map(item => item.workspaceId)).size, providerCostMicros: String(providerCostMicros), aiCostMicros: String(providerCostMicros), creditUsage: String(sum(creditUsage)), refundsMinor: null, storageCostMicros: storageCost===null?null:String(storageCost), infrastructureCostMicros: infrastructureCost===null?null:String(infrastructureCost), grossContributionMicros: contributionMicros === null ? null : String(contributionMicros), fullContributionMicros: fullContribution===null?null:String(fullContribution) }, charts: { daily: [...daily.values()], byPlan, byProvider, byWorkspace, costDaily, costPerWorkspace } };
  }
  async csv(actorId: string, query: FinanceQuery) {
    const report = await this.report(actorId, query);
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"','""')}"`;
    return ['day,revenue_minor,collected_minor,provider_cost_usd_micros,storage_cost_usd_micros,infrastructure_cost_usd_micros,credits,new_users,partial_contribution_usd_micros',...report.charts.daily.map(row => [row.day,row.revenueMinor,row.collectedMinor,row.providerCostMicros,...(['STORAGE','INFRASTRUCTURE'] as const).map(category=>report.charts.costDaily.filter(item=>dateKey(item.day)===row.day&&item.category===category).reduce((total,item)=>total+BigInt(item.value),0n)),row.credits,row.users,row.contributionMicros].map(quote).join(','))].join('\r\n');
  }
}
