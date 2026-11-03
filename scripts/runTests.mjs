import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const collect = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? collect(path.join(dir, entry.name)) : entry.name.endsWith('.test.ts') ? [path.join(dir, entry.name)] : []);
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...['src', 'server', 'cloudflare'].flatMap(collect)], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
