import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFinance } from './finance';
import { marketplaceRouter } from './marketplace';
import { playerRouter } from './player';
import { normalizeSlipOcr, readSlipOcr } from './slipOcr';

test('OCR output becomes review-only JSON', () => {
  assert.deepEqual(normalizeSlipOcr([{ generated_text: '{"amount":"1,234.00","reference":"ABC123","confidence":0.91}' }]), {
    status: 'complete', amount: 1234, transferredAt: null, reference: 'ABC123', sender: null, receiver: null, rawText: '{"amount":"1,234.00","reference":"ABC123","confidence":0.91}', confidence: 0.91,
  });
  assert.equal(normalizeSlipOcr({ generated_text: 'อ่านข้อความได้ แต่ไม่ใช่ JSON' }).amount, null);
});

test('OCR adapter sends raw image to configured HTTPS endpoint and keeps token server-side', async () => {
  const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  let requested = false;
  const fakeFetch: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://example.endpoints.huggingface.cloud/ocr');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer private-test-token');
    assert.deepEqual(Buffer.from(init?.body as Uint8Array), image);
    requested = true;
    return new Response(JSON.stringify({ amount: 190, reference: 'REF-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await readSlipOcr(image, 'image/jpeg', 'https://example.endpoints.huggingface.cloud/ocr', 'private-test-token', fakeFetch);
  assert.equal(requested, true);
  assert.equal(result.amount, 190);
  assert.equal(result.reference, 'REF-1');
  assert.equal((await readSlipOcr(image, 'image/jpeg', '', '', fakeFetch)).status, 'unavailable');
});

test('LINE slip upload is private, rejection permits resubmission, approval settles income', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cb-receipt-'));
  const file = path.join(dir, 'marketplace.json');
  const app = express(); app.use(express.json());
  const finance = createFinance(dir, true);
  app.use('/api/finance', finance.router);
  app.use('/api/marketplace', finance.requireAdmin, marketplaceRouter(file, true));
  app.use('/api/player', playerRouter(file, 'test-channel', async token => {
    if (token !== 'alice-valid-id-token-0123456789') throw Error('invalid');
    return { sub: 'alice', name: 'Alice' };
  }, true));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const auth = { Authorization: 'Bearer alice-valid-id-token-0123456789' };
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64');
  try {
    const created = await fetch(base + '/api/player/bookings', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'night-chicken' }) });
    assert.equal(created.status, 201);
    const bookingId = (await created.json()).booking.id;
    const upload = () => fetch(base + `/api/player/bookings/${bookingId}/receipt`, { method: 'POST', headers: { ...auth, 'Content-Type': 'image/png' }, body: image });
    assert.equal((await fetch(base + `/api/player/bookings/${bookingId}/receipt`, { method: 'POST', headers: { ...auth, 'Content-Type': 'image/png', Origin: 'https://other.example' }, body: image })).status,403);
    const first = await upload(); assert.equal(first.status, 201);
    const receiptId = (await first.json()).receipt.id;
    assert.equal((await upload()).status, 409);
    assert.equal((await fetch(base + `/api/player/bookings/${bookingId}/cancel`, { method: 'POST', headers: auth })).status, 409);
    assert.equal((await fetch(base + `/api/marketplace/bookings/${bookingId}/receipts/${receiptId}`)).status, 401);
    const login = await fetch(base + '/api/finance/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-receipt-password', setup: true }) });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const admin = { Cookie: cookie, 'Content-Type': 'application/json' };
    const fileResponse = await fetch(base + `/api/marketplace/bookings/${bookingId}/receipts/${receiptId}`, { headers: { Cookie: cookie } });
    assert.equal(fileResponse.status, 200);
    assert.deepEqual(Buffer.from(await fileResponse.arrayBuffer()), image);
    const reject = await fetch(base + `/api/marketplace/bookings/${bookingId}/receipts/${receiptId}/review`, { method: 'POST', headers: admin, body: JSON.stringify({ action: 'reject', reason: 'ภาพไม่ชัด' }) });
    assert.equal(reject.status, 200);
    assert.equal((await (await fetch(base + '/api/player/bookings', { headers: auth })).json()).bookings[0].receipt.status, 'rejected');
    const second = await upload(); assert.equal(second.status, 201);
    const nextId = (await second.json()).receipt.id;
    assert.notEqual(nextId, receiptId);
    assert.equal((await fetch(base + `/api/marketplace/bookings/${bookingId}/payment`, { method: 'POST', headers: admin, body: JSON.stringify({ method: 'transfer' }) })).status, 400);
    const approve = await fetch(base + `/api/marketplace/bookings/${bookingId}/receipts/${nextId}/review`, { method: 'POST', headers: admin, body: JSON.stringify({ action: 'approve' }) });
    assert.equal(approve.status, 200);
    assert.ok((await approve.json()).paidAt);
    const report = await (await fetch(base + '/api/finance/report', { headers: { Cookie: cookie } })).json();
    assert.equal(report.summary.income, 19000);
    assert.equal(report.summary.pendingIncome, 0);
    assert.equal((await fetch(base + `/api/marketplace/bookings/${bookingId}/receipts/${nextId}/review`, { method: 'POST', headers: admin, body: JSON.stringify({ action: 'approve' }) })).status, 409);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(dir, { recursive: true }); }
});
