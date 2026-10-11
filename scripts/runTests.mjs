import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const files = [];
for (const directory of ['cloudflare', 'server', 'src', 'scripts']) {
  for (const name of readdirSync(directory)) {
    if (/\.test\.(ts|mjs)$/.test(name)) files.push(path.join(directory, name));
  }
}
if (!files.length) throw new Error('No test files found; refusing to report a false pass');
files.sort();
console.log('Running ' + files.length + ' Chick&Pick test files');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit', env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
