// Compatibility shim (T1-1): original repository path of the entry.
// The real entry moved to src/dreamskin.mjs; this shim forwards all
// arguments unchanged and passes the exit code through, so anything
// still pointing at src/cherry/skin-cherry.mjs keeps working.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../dreamskin.mjs', import.meta.url));
const child = spawn(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('error', (e) => { console.error(String(e && e.message || e)); process.exit(1); });
child.on('exit', (code, signal) => {
  if (signal) { try { process.kill(process.pid, signal); } catch { process.exit(1); } return; }
  process.exit(code ?? 1);
});
