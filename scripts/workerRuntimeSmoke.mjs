import assert from 'node:assert/strict';

// Never point this probe at a hosted site or at a configured customer database.
const origin = 'http://127.0.0.1:8787';
let ready = false;
for (let attempt = 0; attempt < 45; attempt++) {
  try {
    const response = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(2000) });
    await response.arrayBuffer(); ready = true; break;
  } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
}
assert.ok(ready, 'Local workerd did not become ready');

const root = await fetch(origin + '/', { signal: AbortSignal.timeout(5000) });
assert.equal(root.status, 200);
assert.match(root.headers.get('content-type') || '', /text\/html/);
assert.match(root.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
await root.arrayBuffer();

for (const path of ['/.env', '/.git/config', '/data/marketplace.json', '/brand/messageImage_1790922360771.jpg']) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 404, path);
  await response.arrayBuffer();
}
for (const path of ['/api/health', '/api/player/config']) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 503, path);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  await response.arrayBuffer();
}
for (const path of ['/api/player/bookings', '/api/finance/auth']) {
  const response = await fetch(origin + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 503, path);
  await response.arrayBuffer();
}
console.log('LOCAL_WORKER_SMOKE_PASS: assets, security headers, four blocked paths and unconfigured services. No hosted service or payment was called.');
