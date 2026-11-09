import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('installed and both locked LIFF versions pass the build security gate', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./checkLiffVersion.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.match(output, /LIFF security check passed/);
});
test('all public app entry pages prevent stale HTML from pinning the previous SDK bundle', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  for (const path of ['/', '/index.html', '/miniapp', '/miniapp/', '/admin', '/admin/']) assert.ok(headers.includes(path + '\n  Cache-Control: no-store'), path);
});
