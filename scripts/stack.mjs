import { spawnSync } from 'node:child_process';
const args = ['compose', '--env-file', '.env', '-f', 'infrastructure/compose.dev.yml'];
const up = spawnSync('docker', [...args, 'up', '-d', '--build'], { stdio: 'inherit', windowsHide: true });
if (up.status !== 0) process.exit(up.status ?? 1);
const expected = ['postgres', 'redis', 'storage', 'api', 'worker', 'web'];
const deadline = Date.now() + 180000; let previous = '';
while (Date.now() < deadline) {
  const result = spawnSync('docker', [...args, 'ps', '--all', '--format', 'json'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) process.exit(1);
  const rows = result.stdout.trim().startsWith('[') ? JSON.parse(result.stdout) : result.stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const state = expected.map((name) => `${name}:${rows.find((row) => row.Service === name)?.Health || 'starting'}`).join(' ');
  if (state !== previous) { console.log(state); previous = state; }
  if (expected.every((name) => rows.some((row) => row.Service === name && row.Health === 'healthy')) && ['migrate', 'storage-init'].every((name) => rows.some((row) => row.Service === name && row.ExitCode === 0))) { console.log('All application/dependency services healthy; initialization jobs completed.'); process.exit(0); }
  if (rows.some((row) => expected.includes(row.Service) && (row.Health === 'unhealthy' || row.State === 'exited'))) throw new Error('A required service failed startup; inspect docker compose logs');
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
throw new Error('Timed out waiting for stack readiness');
