import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(client, '..');
// Compare against the exact imported UAT baseline; never hide new errors.
const baseline = '486a3478813c7a028799696c1ba9ca2112bf2a13';
const temp = mkdtempSync(path.join(tmpdir(), 'deals-uat-types-'));
try {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, 'client'], { cwd: repo, encoding: 'utf8' }).trim().split('\n');
  for (const file of files) {
    const target = path.join(temp, file.slice(7)); mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, execFileSync('git', ['show', `${baseline}:${file}`], { cwd: repo, maxBuffer: 20 * 1024 * 1024 }));
  }
  symlinkSync(path.join(client, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
  const check = cwd => {
    const result = spawnSync(process.execPath, [path.join(client, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.app.json'], { cwd, encoding: 'utf8' });
    if (result.error || ![0, 2].includes(result.status)) throw result.error || new Error(result.stderr || 'Type checker failed');
    return result.stdout.split('\n').filter(line => line.includes('error TS')).sort();
  };
  const before = check(temp), after = check(client);
  const added = after.filter(line => !before.includes(line));
  if (added.length) { console.error(added.join('\n')); process.exitCode = 1; }
  else console.log(`No new TypeScript errors; ${before.length} existing UAT errors preserved.`);
} finally { rmSync(temp, { recursive: true, force: true }); }
