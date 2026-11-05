import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
  // Idempotent, configuration-only. Never changes existing configuration or creates users.
  await prisma.systemSetting.upsert({
    where: { key: 'supported_languages' },
    create: { key: 'supported_languages', value: ['vi', 'en'] },
    update: {}
  });
  await prisma.plan.upsert({
    where: { code: 'FREE_MONTHLY_V1' },
    create: { code: 'FREE_MONTHLY_V1', name: 'Free', tier: 'FREE', cadence: 'MONTHLY', monthlyCredits: 0n, periodCredits: 0n, priceMinor: 0n, currency: 'USD', memberLimit: 1, brandLimit: 1, storageLimitBytes: 104857600n, features: [], active: true },
    update: {}
  });
}
void main().catch(() => { console.error('Seed failed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
