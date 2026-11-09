import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const safe = version => /^\d+\.\d+\.\d+$/.test(version || '') && version.split('.').map(Number).reduce((comparison, part, i) => comparison || Math.sign(part - [2, 31, 1][i]), 0) >= 0;
const installed = read('node_modules/@line/liff/package.json').version;
const manifest = read('package.json').dependencies['@line/liff'];
const lock = read('package-lock.json');
const alternate = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
if (!safe(installed) || manifest !== installed || lock.packages['node_modules/@line/liff']?.version !== installed
  || !alternate.includes(`specifier: ${installed}\n        version: ${installed}`)
  || Object.entries(lock.packages).some(([name, value]) => /node_modules\/@liff\//.test(name) && !safe(value.version))) {
  throw Error('LIFF security check failed: use an identical pinned SDK >= 2.31.1 in both lockfiles and installed packages.');
}
console.log('LIFF security check passed: installed and locked SDK ' + installed);
