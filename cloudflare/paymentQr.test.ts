import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import generatePayload from 'promptpay-qr';
import { createQrTicket, readQrTicket, paymentQrPng, paymentQrPayload, paymentQrPage } from './paymentQr';
import { staticBankQr } from '../src/bankQr';
import { parsePaymentChannels } from '../src/paymentChannels';
import { qrImageFile, saveQrImage } from '../src/qrExport';

test('bank-linked PromptPay QR prepopulates amount and overrides an older static QR without using the second mobile', async () => {
  const account = { kind: 'bank' as const, bankName: 'BAY', accountName: 'Bank fixture', accountNumber: '1234567890', bankPromptPayPhone: '0899999999', bankQrPayload: generatePayload('0812345678', {}) };
  const payload = paymentQrPayload(account, 12050);
  assert.equal(payload, generatePayload('0899999999', { amount: 120.50 }));
  assert.notEqual(payload, generatePayload('0812345678', { amount: 120.50 }));
  const png = PNG.sync.read(Buffer.from(await paymentQrPng(payload)));
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, payload);
  const page = paymentQrPage('fixture', account.accountName, 12050, false);
  assert.match(page, /QR พร้อมเพย์ระบุยอดจองแล้ว/); assert.doesNotMatch(page, /กรอกยอดจอง/);
});

test('Worker PNG can be decoded to the exact dynamic or uploaded static Thai payment QR', async () => {
  const phone = { kind: 'promptpay' as const, bankName: 'พร้อมเพย์', accountName: 'Test', accountNumber: '0812345678' };
  const staticQr = generatePayload('0812345678', {});
  assert.equal(staticBankQr(staticQr), staticQr);
  for (const payload of [paymentQrPayload(phone, 12050), paymentQrPayload({ ...phone, kind: 'bank', bankQrPayload: staticQr }, 12050)]) {
    const png = PNG.sync.read(Buffer.from(await paymentQrPng(payload)));
    assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, payload);
  }
  assert.equal(staticBankQr(generatePayload('0812345678', { amount: 190 })), null);
  assert.equal(staticBankQr(staticQr.slice(0,-4) + 'FFFF'), null);
  assert.equal(staticBankQr('SLIPREF123456'), null);
  assert.equal(parsePaymentChannels([{ id: 'bank', kind: 'bank', enabled: true, bankName: 'BAY', accountName: 'Test', accountNumber: '1234567890', bankQrPayload: staticQr }])?.[0].bankQrPayload, staticQr);
  assert.equal(parsePaymentChannels([{ ...phone, id: 'promptpay', enabled: true, bankQrPayload: staticQr }]), null);
});

test('QR-only ticket is encrypted, expires after five minutes and cannot use an admin token or be tampered with', async () => {
  const secret = 'fixture-private-qr-key', now = 1000000, claim = { kind: 'game' as const, id: 'booking', channel: 'promptpay' };
  const token = await createQrTicket(secret, claim, now);
  assert.doesNotMatch(token, /booking|promptpay/);
  assert.deepEqual(await readQrTicket(secret, token, now + 1), { ...claim, exp: now + 300000 });
  assert.equal(await readQrTicket(secret, token, now + 300000), null);
  assert.equal(await readQrTicket('wrong', token, now), null);
  assert.equal(await readQrTicket(secret, token.slice(0,20) + (token[20] === 'A' ? 'B' : 'A') + token.slice(21), now), null);
  assert.equal(await readQrTicket(secret, 'admin-cookie.fixture', now), null);
  const html = paymentQrPage(token, '<script>fixture</script>', 12050, true);
  assert.match(html, /120\.50/); assert.match(html, /กรอกยอดจอง/); assert.doesNotMatch(html, /<script>/);
});

test('QR export shares a real PNG file when available, handles cancellation and offers download when file sharing is absent', async () => {
  const image = 'data:image/png;base64,' + Buffer.from(await paymentQrPng(generatePayload('0812345678', {}))).toString('base64');
  let shares = 0, downloads = 0;
  const file = qrImageFile(image, 'test.png'); assert.equal(file.type, 'image/png'); assert.ok(file.size > 100);
  assert.equal(await saveQrImage(image, 'test.png', { canShare: () => true, share: async data => { shares++; assert.equal(data.files?.[0].name, 'test.png'); }, download: () => { downloads++; } }), 'shared');
  assert.equal(shares, 1); assert.equal(downloads, 0);
  assert.equal(await saveQrImage(image, 'test.png', { canShare: () => true, share: async () => { throw new DOMException('Cancelled', 'AbortError'); }, download: () => { downloads++; } }), 'cancelled');
  assert.equal(downloads, 0);
  assert.equal(await saveQrImage(image, 'test.png', { canShare: () => true, share: async () => { throw new DOMException('Blocked', 'NotAllowedError'); }, download: () => { downloads++; } }), 'unavailable');
  assert.equal(await saveQrImage(image, 'test.png', { download: () => { downloads++; } }), 'download-started'); assert.equal(downloads, 1);
});

test('opening another QR never extends the original seat hold deadline', async () => {
  const secret = 'fixture-qr', now = Date.now(), deadline = new Date(now + 120000).toISOString();
  const claim = { kind: 'game' as const, id: 'fixture', channel: 'promptpay' };
  for (const issuedAt of [now, now + 119000]) {
    const ticket = await createQrTicket(secret, claim, issuedAt, deadline);
    assert.equal((await readQrTicket(secret, ticket, issuedAt))!.exp, Date.parse(deadline));
    assert.equal(await readQrTicket(secret, ticket, Date.parse(deadline)), null);
    assert.match(paymentQrPage(ticket, 'Fixture', 19000, false, deadline), /การเปิด QR ไม่ต่อเวลาจอง/);
  }
});
