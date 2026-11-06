import { describe, expect, it, vi } from 'vitest';
import { FinanceService } from './finance.service';
import type { PrismaService } from '../platform/prisma.service';
import type { IdentityService } from '../identity/identity.service';

describe('financial report', () => {
  function fixture() {
    const rows: unknown[] = [
      [{day:new Date('2026-11-01T00:00:00Z'),value:'50.500000'}],
      [{day:new Date('2026-11-02T00:00:00Z'),value:'100'}],
      [{day:new Date('2026-11-01T00:00:00Z'),value:'100000'}],
      [{day:new Date('2026-11-01T00:00:00Z'),value:'8'}],
      [{day:new Date('2026-11-01T00:00:00Z'),value:'2'}],[],[],[],[]
    ];
    let next=0;
    const db={ $transaction:vi.fn(async (fn:(tx:unknown)=>Promise<unknown>)=>fn({})), $queryRaw:vi.fn(async()=>rows[next++]), subscription:{findMany:vi.fn(async()=>[{workspaceId:'w1',plan:{priceMinor:1200n,cadence:'YEARLY'}},{workspaceId:'w1',plan:{priceMinor:200n,cadence:'MONTHLY'}}])},financialCost:{groupBy:vi.fn(async()=>[])} };
    const identity={requireSystemAdmin:vi.fn(async()=>undefined)};
    return {service:new FinanceService(db as unknown as PrismaService,identity as unknown as IdentityService,{record:vi.fn()} as never),db,identity};
  }
  it('keeps recognized revenue, cash collection and current MRR separate',async()=>{
    const {service,identity}=fixture();const result=await service.report('admin',{from:'2026-11-01T00:00:00Z',to:'2026-11-03T00:00:00Z'});
    expect(identity.requireSystemAdmin).toHaveBeenCalled();
    expect(result.totals.recognizedMinor).toBe('50.500000');
    expect(result.totals.collectedMinor).toBe('100');
    expect(result.totals.mrrMinor).toBe('300.000000');
    expect(result.totals.activePayingCustomers).toBe(1);
    expect(result.totals.grossContributionMicros).toBe('405000');
    expect(result.totals.fullContributionMicros).toBeNull();
    expect(result.totals.refundsMinor).toBeNull();
  });
  it('rejects invalid and unbounded date ranges before aggregation',async()=>{
    const {service,db}=fixture();
    await expect(service.report('admin',{from:'2026-11-03T00:00:00Z',to:'2026-11-01T00:00:00Z'})).rejects.toThrow();
    await expect(service.report('admin',{from:'2020-01-01T00:00:00Z',to:'2026-11-01T00:00:00Z'})).rejects.toThrow();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
