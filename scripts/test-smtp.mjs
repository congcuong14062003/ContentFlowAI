import { config } from 'dotenv'; import { createServer } from 'node:tls'; import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, rm } from 'node:fs/promises'; import { resolve } from 'node:path'; import { spawnSync } from 'node:child_process'; import assert from 'node:assert/strict';
import { Queue } from 'bullmq'; import { startMailWorker, encryptMail, mailQueueName } from '@contentflow/mail';
import Redis from 'ioredis';
config({ path: '.env', quiet: true });
const name = `smtp_test_${randomUUID().replaceAll('-', '')}`; const directory = resolve('.local', name); await mkdir(directory, { recursive: true });
const certificate = resolve(directory, 'cert.pem'); const keyFile = resolve(directory, 'key.pem');
let generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', keyFile, '-out', certificate, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore', windowsHide: true });
if (generated.error?.code === 'ENOENT') generated = spawnSync('docker', ['run', '--rm', '--entrypoint', 'openssl', '-v', `${directory}:/certs`, 'contentflow-dev-api', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', '/certs/key.pem', '-out', '/certs/cert.pem', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore', windowsHide: true });
assert.equal(generated.status, 0, 'Generate a private test CA/certificate');
const username = randomUUID(); const password = randomBytes(24).toString('hex'); const secret = randomBytes(32).toString('hex');
const received = []; const sockets = new Set(); let authenticated = 0;
const server = createServer({ key: await readFile(keyFile), cert: await readFile(certificate) }, (socket) => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.write('220 localhost SMTP test\r\n'); let buffer = ''; let data = false; let message = ''; let auth = false;
  socket.on('data', (chunk) => { buffer += chunk.toString(); while (buffer.includes('\r\n')) {
    const index = buffer.indexOf('\r\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
    if (data) { if (line === '.') { data = false; received.push(message); socket.write('250 accepted\r\n'); } else message += `${line}\n`; continue; }
    if (line.startsWith('EHLO')) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
    else if (line.startsWith('AUTH PLAIN ')) { const parts = Buffer.from(line.slice(11), 'base64').toString().split('\0'); auth = parts[1] === username && parts[2] === password; if (auth) authenticated++; socket.write(auth ? '235 authenticated\r\n' : '535 denied\r\n'); }
    else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) socket.write(auth ? '250 ok\r\n' : '530 authenticate\r\n');
    else if (line === 'DATA') { data = true; message = ''; socket.write('354 send data\r\n'); }
    else if (line === 'QUIT') socket.end('221 goodbye\r\n'); else socket.write('250 ok\r\n');
  } });
});
server.on('tlsClientError', () => undefined); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port; const environment = { ...process.env, NODE_ENV: 'test', MAIL_MODE: 'smtp', MAIL_ENCRYPTION_KEY: secret, RATE_LIMIT_PREFIX: name, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: 'true', SMTP_CA_FILE: certificate, SMTP_USER: username, SMTP_PASSWORD: password, MAIL_FROM: 'sender@example.invalid' };
const worker = startMailWorker(environment); const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, commandTimeout: 3000 }); const queue = new Queue(mailQueueName, { connection, prefix: name });
try {
  await worker.worker.waitUntilReady(); await queue.add('send', encryptMail({ to: 'recipient@example.invalid', subject: 'TLS acceptance', text: 'A queued verification link' }, secret));
  for (let attempt = 0; attempt < 200 && !received.length; attempt++) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(authenticated, 1); assert.equal(received.length, 1); assert.ok(received[0].includes('A queued verification link'));
  const negative = startMailWorker({ ...environment, RATE_LIMIT_PREFIX: `${name}_untrusted`, SMTP_CA_FILE: undefined });
  const negativeQueue = new Queue(mailQueueName, { connection, prefix: `${name}_untrusted` });
  try {
    await negative.worker.waitUntilReady();
    const rejected = new Promise((resolve, reject) => { negative.worker.once('failed', resolve); const timeout = setTimeout(() => reject(new Error('Untrusted certificate was not rejected')), 10000); timeout.unref(); });
    await negativeQueue.add('send', encryptMail({ to: 'recipient@example.invalid', subject: 'Must fail', text: 'Untrusted certificate must prevent authentication' }, secret), { attempts: 1 });
    await rejected; assert.equal(authenticated, 1); assert.equal(received.length, 1);
  } finally { await negative.close(); await negativeQueue.obliterate({ force: true }); await negativeQueue.close(); }
  console.log('SMTP adapter: verified TLS, authenticated delivery and rejection of untrusted certificates passed');
} finally {
  await worker.close(); assert.match(name, /^smtp_test_[a-f0-9]{32}$/); await queue.obliterate({ force: true }); await queue.close(); await connection.quit();
  for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); assert.equal(directory, resolve('.local', name)); await rm(directory, { recursive: true, force: true });
}
