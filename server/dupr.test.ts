import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { duprRouter, parseDuprRating } from './dupr';
test('DUPR parser accepts official schema, preserves NR and rejects mismatched identity', () => {
  const value = parseDuprRating({ id: 'ABC123', fullName: 'Test', ratings: { singles: 'NR', doubles: '3.825', isDoublesReliable: true } }, 'ABC123');
  assert.equal(value.singles, null); assert.equal(value.doubles, 3.825); assert.equal(value.doublesReliable, true);
  assert.throws(() => parseDuprRating({ id: 'OTHER', fullName: 'Test' }, 'ABC123'));
  assert.throws(() => parseDuprRating({ id: 'ABC123', fullName: 'Test', ratings: { singles: 'garbage' } }, 'ABC123'));
});
test('DUPR configuration gate, real API contract, caching and unlink', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cb-dupr-')); let calls = 0;
  const request = (async (url: string, init: RequestInit) => {
    calls++;
    if (url.endsWith('/auth/v1.0/token')) { assert.equal(new Headers(init.headers).get('x-authorization'), Buffer.from('client:secret').toString('base64')); return Response.json({ status: 'SUCCESS', result: { token: 'test-token', expiry: new Date(Date.now() + 3600000).toISOString() } }); }
    assert.equal(url, 'https://uat.mydupr.com/api/user/v1.0/ABC123'); assert.equal(new Headers(init.headers).get('authorization'), 'Bearer test-token');
    return Response.json({ status: 'SUCCESS', result: { id: 'ABC123', fullName: 'Test Player', ratings: { singles: 'NR', doubles: '3.825' } } });
  }) as typeof fetch;
  const app = express(); app.use(express.json()); app.use('/not-configured', duprRouter({ file: path.join(dir, 'off.json'), enabled: true, baseUrl: '', clientKey: '', clientSecret: '', request }));
  app.use('/on', duprRouter({ file: path.join(dir, 'on.json'), enabled: true, baseUrl: 'https://uat.mydupr.com/api', clientKey: 'client', clientSecret: 'secret', request }));
  app.use('/denied', duprRouter({ file: path.join(dir, 'denied.json'), enabled: true, baseUrl: 'https://uat.mydupr.com/api', clientKey: 'client', clientSecret: 'secret', request: (async () => Response.json({}, { status: 403 })) as typeof fetch }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r)); const root = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (url: string, body?: unknown) => { const res = await fetch(root + url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, data: await res.json() }; };
  try {
    let data = (await call('/not-configured')).data; assert.equal(data.state, 'not_configured'); assert.equal(data.rating, null);
    await call('/not-configured/link', { id: 'ABC123', consent: true }); assert.equal(calls, 0);
    assert.equal((await call('/on/link', { id: 'ABC123' })).status, 400);
    data = (await call('/on/link', { id: 'abc123', consent: true })).data; assert.equal(data.rating.doubles, 3.825); assert.equal(data.environment, 'uat'); assert.equal(calls, 2);
    await call('/on'); await call('/on'); assert.equal(calls, 2);
    assert.ok(!JSON.stringify(data).includes('test-token')); assert.ok(!JSON.stringify(data).includes('secret'));
    data = (await call('/denied/link', { id: 'ABC123', consent: true })).data; assert.equal(data.state, 'error'); assert.match(data.message, /SSO/); assert.equal(data.rating, null);
    data = (await call('/on/unlink', {})).data; assert.equal(data.id, null); assert.equal(data.rating, null);
  } finally { await new Promise<void>(r => server.close(() => r())); rmSync(dir, { recursive: true }); }
});
