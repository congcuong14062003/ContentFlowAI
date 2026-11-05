/** Integer financial quantities are decimal strings, never JSON numbers. */
export interface CreditBalance { balance: string; reserved: string; available: string; nextExpiry: string | null; unit: 'CREDIT_ATOM' }
export interface CreditLedgerRecord { id: string; kind: string; amount: string; reservedDelta: string; reference: string | null; createdAt: string }
export interface CreditGrantRecord { id: string; source: string; amount: string; remaining: string; reserved: string; expiresAt: string | null; reference: string; createdAt: string }
export interface AiUsageRecord {
  id: string; taskType: string; provider: string; model: string; status: string; estimatedMicros: string; errorCode: string | null; createdAt: string;
  usage: { inputTokens: number; outputTokens: number; costMicros: string; credits: string } | null;
  reservation: { amount: string; status: string; settledAmount: string; refundedAt: string | null } | null;
}
