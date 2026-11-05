import { randomBytes } from 'node:crypto'; import { readFile, appendFile } from 'node:fs/promises';
const file = new URL('../.env', import.meta.url); const source = await readFile(file, 'utf8');
if (!/^MAIL_ENCRYPTION_KEY=.+$/m.test(source)) {
  if (/^MAIL_ENCRYPTION_KEY=/m.test(source)) throw new Error('Fill the existing empty MAIL_ENCRYPTION_KEY with 32 random hex bytes');
  await appendFile(file, `\nMAIL_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`); console.log('Generated local mail encryption key; existing credentials preserved.');
} else console.log('Existing mail encryption key preserved.');
