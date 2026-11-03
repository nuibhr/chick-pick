import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const collect = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? collect(path.join(dir, entry.name)) : /\.test\.(ts|mjs)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
const files = ['cloudflare', 'server', 'src', 'scripts'].flatMap(collect);
if (!files.length) throw new Error('No test files found; refusing to report a false pass');
files.sort();
console.log('Running ' + files.length + ' Chick&Pick test files');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit', env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
