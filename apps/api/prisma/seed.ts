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
}
void main().catch(() => { console.error('Seed failed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
