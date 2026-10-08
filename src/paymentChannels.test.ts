import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { activeTransferAccount, configuredChannels, parsePaymentChannels, publicTransferAccount, transferOptions, type PaymentChannel } from './paymentChannels';
import { promptPayImage, promptPayPayload } from './promptPay';
import { slipokResult, matchesSlipMobile } from '../cloudflare/slipok';
import { recordVerifiedTransfer } from '../cloudflare/receiptVerification';
import ReceiptReview from './ReceiptReview';
import PlayerTransferInstructions from './PlayerTransferInstructions';
import type { ReceiptSubmission } from './marketplaceTypes';

const bank: PaymentChannel = { id: 'bank', kind: 'bank', enabled: true, bankName: 'BAY', accountName: 'Bank fixture', accountNumber: '1234567890' };
const phone: PaymentChannel = { id: 'promptpay', kind: 'promptpay', enabled: true, bankName: 'พร้อมเพย์', accountName: 'Phone fixture', accountNumber: '0812345678', linkedBank: { bankName: 'KBANK', accountNumber: '9876543210' } };
const now = Date.parse('2026-10-08T06:00:00Z'), bookedAt = '2026-10-08T05:50:00Z';
const payload = () => ({ success: true, data: { success: true, transRef: 'CHANNELTEST0001', amount: 190, receivingBank: '004', countryCode: 'TH', transDate: '20261008', transTime: '12:55:00', receiver: { displayName: 'Phone fixture', proxy: { type: 'MSISDN', value: '081xxx5678' }, account: { type: 'BANKAC', value: 'xxx-x-x4321-x' } } } });

test('channel settings migrate the old bank, only snapshot enabled recipients, and keep linked-bank details private', () => {
  assert.equal(configuredChannels(bank).length, 1);
  const parsed = parsePaymentChannels([bank, phone])!;
  assert.equal(parsed.length, 2);
  const snapshot = activeTransferAccount({ channels: parsed })!;
  assert.equal(transferOptions(snapshot).length, 2);
  parsed[0].enabled = false; parsed[1].accountNumber = '0899999999';
  assert.equal(transferOptions(snapshot)[1].accountNumber, phone.accountNumber);
  assert.equal(activeTransferAccount({ channels: [ { ...bank, enabled: false }, phone ] })!.kind, 'promptpay');
  assert.equal(activeTransferAccount({ ...bank, channels: [{ ...bank, enabled: false }, { ...phone, enabled: false }] }), null);
  assert.doesNotMatch(JSON.stringify(publicTransferAccount(snapshot)), /linkedBank|9876543210/);
  for (const values of [[phone, phone], [{ ...phone, accountNumber: '1234567890123' }], [{ ...bank, enabled: 'true' }], [{ ...phone, linkedBank: { bankName: 'KBANK' } }]]) assert.equal(parsePaymentChannels(values), null);
});

test('SlipOK accepts the separate PromptPay recipient by mobile or its linked bank, never by sender or a disabled channel', () => {
  const account = activeTransferAccount({ channels: [bank, phone] })!;
  let result = slipokResult(payload(), true, 19000, account, bookedAt, now);
  assert.equal(result.status, 'verified'); assert.equal(result.paymentChannel, 'promptpay');
  const bankOnly = activeTransferAccount({ channels: [bank, { ...phone, enabled: false }] })!;
  assert.equal(slipokResult(payload(), true, 19000, bankOnly, bookedAt, now).status, 'rejected');
  const byBank = payload(); byBank.data.receiver.proxy.value = 'xxx';
  assert.equal(slipokResult(byBank, true, 19000, account, bookedAt, now).status, 'verified');
  const noLinked = { ...phone, linkedBank: undefined };
  assert.equal(slipokResult(byBank, true, 19000, noLinked, bookedAt, now).status, 'rejected');
  const wrong = payload(); wrong.data.receiver.proxy.value = '089xxx9999'; wrong.data.receiver.account.value = 'xxx-x-x9999-x';
  assert.equal(slipokResult({ ...wrong, data: { ...wrong.data, sender: payload().data.receiver } }, true, 19000, account, bookedAt, now).status, 'rejected');
  wrong.data.receiver.proxy = { type: 'NATID', value: '081xxx5678' };
  assert.equal(slipokResult(wrong, true, 19000, account, bookedAt, now).status, 'rejected');
  for (const value of ['081xxx5678', '+6681xxx5678', '006681xxx5678', '6681xxx5678']) assert.equal(matchesSlipMobile(value, phone.accountNumber), true);
  assert.equal(matchesSlipMobile('xxxxxxxxxx', phone.accountNumber), false);
  assert.equal(matchesSlipMobile('5678', phone.accountNumber), false);
});

test('verified receipt approval derives money and reference from the server result but still rejects overrides and duplicates', () => {
  const verification = slipokResult(payload(), true, 19000, phone, bookedAt, now);
  const receipt: ReceiptSubmission = { id: 'one', fileName: 'fixture', mimeType: 'image/png', size: 1, status: 'pending', submittedAt: bookedAt, ocr: { status: 'unavailable', amount: null, transferredAt: null, reference: null, sender: null, receiver: null, rawText: null, confidence: null }, verification };
  recordVerifiedTransfer(receipt, 19000, {}, [receipt]);
  assert.equal(receipt.verifiedTransferReference, verification.reference); assert.equal(receipt.verifiedAmount, 19000);
  assert.throws(() => recordVerifiedTransfer(receipt, 19000, { receivedAmount: 1 }, [receipt]));
  assert.throws(() => recordVerifiedTransfer(receipt, 19000, { transferReference: 'OVERRIDE0001' }, [receipt]));
  assert.throws(() => recordVerifiedTransfer({ ...receipt, id: 'two' }, 19000, {}, [receipt, { ...receipt, id: 'two' }]));
  const markup = renderToStaticMarkup(createElement(ReceiptReview, { booking: { id: 'booking', playerName: 'Fixture', title: 'Game', amount: 19000, transferAccount: phone }, receipt, busy: false, mutate: async () => true }));
  assert.match(markup, /ระบบเติมยอดและเลขอ้างอิงจาก SlipOK ให้แล้ว/); assert.match(markup, /readOnly=""/); assert.match(markup, /CHANNELTEST0001/); assert.match(markup, /190\.00/);
  const player = renderToStaticMarkup(createElement(PlayerTransferInstructions, { account: phone, amount: 19000, slipok: true, pending: false }));
  assert.match(player, /คัดลอกเบอร์พร้อมเพย์|สแกนพร้อมเพย์ตามยอดจอง/);
  const pending = renderToStaticMarkup(createElement(PlayerTransferInstructions, { account: phone, amount: 19000, slipok: true, pending: true }));
  assert.doesNotMatch(pending, /สแกนพร้อมเพย์|คัดลอกเบอร์/);
});

function tags(value: string) {
  const fields: Record<string, string> = {};
  for (let i = 0; i < value.length;) { const tag = value.slice(i, i + 2), length = Number(value.slice(i + 2, i + 4)); fields[tag] = value.slice(i + 4, i + 4 + length); i += 4 + length; }
  return fields;
}
test('customer PNG QR decodes to a PromptPay mobile, THB amount to the satang and valid EMV CRC', async () => {
  for (const amount of [19000, 12050]) {
    const qrPayload = promptPayPayload(phone.accountNumber, amount), fields = tags(qrPayload);
    assert.equal(fields['01'], '12'); assert.equal(fields['53'], '764'); assert.equal(fields['54'], (amount / 100).toFixed(2)); assert.equal(fields['58'], 'TH');
    const receiver = tags(fields['29']); assert.equal(receiver['00'], 'A000000677010111'); assert.equal(receiver['01'], '0066812345678');
    let crc = 0xffff; for (const char of qrPayload.slice(0, -4)) { crc ^= char.charCodeAt(0) << 8; for (let i = 0; i < 8; i++) crc = (crc & 0x8000 ? crc << 1 ^ 0x1021 : crc << 1) & 0xffff; }
    assert.equal(fields['63'], crc.toString(16).toUpperCase().padStart(4, '0'));
    const image = await promptPayImage(phone.accountNumber, amount), png = PNG.sync.read(Buffer.from(image.split(',')[1], 'base64'));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.equal(decoded?.data, qrPayload);
  }
  assert.throws(() => promptPayPayload('1234567890123', 19000)); assert.throws(() => promptPayPayload(phone.accountNumber, 190.1));
});
