// Compatibility shim (T1-1): the entry was renamed to dreamskin.mjs.
// Old shortcuts that call `node skin-cherry.mjs ...` keep working: all
// arguments are forwarded unchanged and the exit code is passed through.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./dreamskin.mjs', import.meta.url));
const child = spawn(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('error', (e) => { console.error(String(e && e.message || e)); process.exit(1); });
child.on('exit', (code, signal) => {
  if (signal) { try { process.kill(process.pid, signal); } catch { process.exit(1); } return; }
  process.exit(code ?? 1);
});
