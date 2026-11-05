import { spawn, spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const apiDirectory = fileURLToPath(new URL('../apps/api/', import.meta.url));
const compilerPath = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
// Nest DTO validation requires TypeScript decorator metadata; esbuild/tsx omit it.
const initial = spawnSync(process.execPath, [compilerPath, '-p', 'tsconfig.json'], { cwd: apiDirectory, stdio: 'inherit', windowsHide: true });
if (initial.status !== 0) process.exit(initial.status ?? 1);
const compiler = spawn(process.execPath, [compilerPath, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { cwd: apiDirectory, stdio: 'inherit', windowsHide: true });
const server = spawn(process.execPath, ['--watch', 'dist/main.js'], { cwd: apiDirectory, stdio: 'inherit', windowsHide: true });
let stopping = false;
function stop() { if (stopping) return; stopping = true; compiler.kill('SIGTERM'); server.kill('SIGTERM'); }
process.once('SIGTERM', stop); process.once('SIGINT', stop);
compiler.once('exit', () => { if (!stopping) { process.exitCode = 1; stop(); } });
server.once('exit', (code) => { if (!stopping) { process.exitCode = code ?? 1; stop(); } });
