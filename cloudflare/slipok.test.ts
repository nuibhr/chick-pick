import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSlipOkConnection, matchesSlipAccount, slipokConfigured, slipokResult, verifySlipOk } from './slipok';
import { recordVerifiedTransfer } from './receiptVerification';
import type { ReceiptSubmission } from '../src/marketplaceTypes';
import { unavailableOcr } from './pilotDomain';

const now = Date.parse('2026-10-07T06:00:00Z'), bookedAt = '2026-10-07T05:50:00Z';
const account = { bankName: 'ธนาคารกสิกรไทย', accountName: 'Test', accountNumber: '1234531090' };
const valid = () => ({ success: true, data: { success: true, transRef: 'TRANSFER0001', amount: 190, countryCode: 'TH', paidLocalCurrency: '764', receivingBank: '004', transDate: '20261007', transTime: '12:55:00', receiver: { displayName: 'Test', account: { value: 'xxx-x-x3109-x' } } } });

test('SCB PromptPay with TH, null optional currency and only the matching receiver mobile is verified', () => {
  const target = { kind: 'promptpay' as const, bankName: 'พร้อมเพย์', accountName: 'Fixture', accountNumber: '0812345678', linkedBank: { bankName: 'SCB', accountNumber: '1234531090' } };
  const scb = { ...valid(), data: { ...valid().data, sendingBank: '014', receivingBank: '', paidLocalCurrency: null, paidLocalAmount: null, receiver: { displayName: 'Fixture', proxy: { type: 'MSISDN', value: '081xxx5678' }, account: { type: '', value: '' } } } };
  const result = slipokResult(scb, true, 19000, target, bookedAt, now);
  assert.equal(result.status, 'verified', result.message);
  assert.equal(result.paymentChannel, 'promptpay');
  for (const currency of [undefined, '', '  ', 764, ' THB ']) assert.equal(slipokResult({ ...scb, data: { ...scb.data, paidLocalCurrency: currency } }, true, 19000, target, bookedAt, now).status, 'verified');
  for (const change of [{ countryCode: 'US' }, { countryCode: null }, { paidLocalCurrency: '840' }, { paidLocalCurrency: 'USD' }, { paidLocalCurrency: 0 }, { paidLocalCurrency: ['THB'] }, { paidLocalCurrency: {} }, { sendingBank: '' }, { receivingBank: '999' }, { receivingBank: '004' }, { amount: 189 }, { receiver: { proxy: { type: 'MSISDN', value: '089xxx9999' } } }, { receiver: { proxy: { type: 'NATID', value: '081xxx5678' } } }]) assert.equal(slipokResult({ ...scb, data: { ...scb.data, ...change } }, true, 19000, target, bookedAt, now).status, 'rejected');
  assert.equal(slipokResult(scb, true, 19000, { ...target, kind: 'bank', bankName: 'SCB', accountNumber: target.linkedBank.accountNumber, bankPromptPayPhone: target.accountNumber }, bookedAt, now).status, 'verified');
});

test('SCB mobile-only recipient also matches a bank QR linked to the booking phone without accepting contradictory evidence', () => {
  const target = { kind: 'bank' as const, bankName: 'ธนาคารกรุงศรี', accountName: 'Fixture', accountNumber: '1234531090', bankPromptPayPhone: '0812345678' };
  const scb = { ...valid(), data: { ...valid().data, sendingBank: '014', receivingBank: '', paidLocalCurrency: null, receiver: { proxy: { type: 'MSISDN', value: '081xxx5678' }, account: { type: '', value: '' } } } };
  const result = slipokResult(scb, true, 19000, target, bookedAt, now);
  assert.equal(result.status, 'verified', result.message);
  assert.equal(result.paymentChannel, 'bank');
  assert.equal(slipokResult(scb, true, 19000, { ...target, bankPromptPayPhone: undefined }, bookedAt, now).status, 'rejected');
  for (const change of [
    { sendingBank: '' }, { receivingBank: '999' }, { receivingBank: '004' },
    { receiver: { ...scb.data.receiver, proxy: { type: 'MSISDN', value: '089xxx9999' } } },
    { receiver: { ...scb.data.receiver, proxy: { type: 'MSISDN', value: 'xxxxxxx678' } } },
    { receiver: { ...scb.data.receiver, proxy: { type: 'NATID', value: '081xxx5678' } } },
    { receiver: { ...scb.data.receiver, account: { type: 'BANKAC', value: 'xxx-x-x9999-x' } } },
    { amount: 189 }, { countryCode: 'US' }, { paidLocalCurrency: 'USD' },
  ]) assert.equal(slipokResult({ ...scb, data: { ...scb.data, ...change } }, true, 19000, target, bookedAt, now).status, 'rejected');
});

test('SlipOK validates complete bank results, exact cents, visible receiver positions and booking time', () => {
  assert.equal(slipokResult(valid(), true, 19000, account, bookedAt, now).status, 'verified');
  for (const change of [ { amount: 190.001 }, { amount: 189 }, { receivingBank: '006' }, { countryCode: 'US' }, { paidLocalCurrency: '840' }, { transRef: '' }, { transDate: '20260901' }, { transTime: '23:59:59' }, { receiver: { account: { value: 'xxx-x-x9999-x' } } } ]) {
    const p = valid(); Object.assign(p.data, change); assert.equal(slipokResult(p, true, 19000, account, bookedAt, now).status, 'rejected');
  }
  assert.equal(matchesSlipAccount('xxxxxxxxxx', account.accountNumber), false);
  assert.equal(matchesSlipAccount('3109', account.accountNumber), false);
  assert.equal(matchesSlipAccount('xxx-x-x3109-x', account.accountNumber), true);
});

test('SlipOK error payload data.success cannot approve a duplicate, wrong amount, wrong account or delayed slip', () => {
  for (const code of [1012, 1013, 1014]) assert.equal(slipokResult({ ...valid(), code, success: false }, false, 19000, account, bookedAt, now).status, 'rejected');
  const delayed = slipokResult({ code: 1010, data: { success: true, delay: 8 } }, false, 19000, account, bookedAt, now);
  assert.equal(delayed.status, 'retry'); assert.equal(Date.parse(delayed.retryAt!), now + 8 * 60000);
  assert.equal(slipokResult({ code: 1002, message: 'secret leaked by upstream' }, false, 19000, account, bookedAt, now).status, 'unavailable');
});

test('SlipOK sends private images server-side with log=true and authoritative amount, and never returns raw credentials/errors', async () => {
  let calls = 0;
  const env = { SLIPOK_API_KEY: 'fixture-private-secret', SLIPOK_BRANCH_ID: '77946' };
  assert.equal(slipokConfigured(env), true); assert.equal(slipokConfigured({ ...env, SLIPOK_BRANCH_ID: '../other-host' }), false);
  const transport = async (url: any, init: any) => {
    calls++; assert.equal(String(url), 'https://api.slipok.com/api/line/apikey/77946'); assert.equal(init.headers['x-authorization'], env.SLIPOK_API_KEY);
    assert.equal(init.body.get('log'), 'true'); assert.equal(init.body.get('amount'), '190.00'); assert.equal(init.redirect, 'manual'); assert.ok(init.body.get('files') instanceof Blob);
    return new Response(JSON.stringify({ code: 1002, message: env.SLIPOK_API_KEY }), { status: 400 });
  };
  const result = await verifySlipOk(env, new Uint8Array([1,2,3]).buffer, 'image/png', 19000, account, bookedAt, transport);
  assert.equal(calls, 1); assert.equal(result.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(result), /fixture-private-secret/);
  const unavailable = await verifySlipOk({}, new ArrayBuffer(0), 'image/png', 19000, account, bookedAt, transport);
  assert.equal(unavailable.status, 'unavailable'); assert.equal(calls, 1);
});

test('SlipOK approval cannot alter verified reference, bypass rejected checks, or reuse a pending verified transfer', () => {
  const receipt: ReceiptSubmission = { id: 'one', fileName: 'one', mimeType: 'image/png', size: 10, submittedAt: bookedAt, status: 'pending', ocr: unavailableOcr(), verification: slipokResult(valid(), true, 19000, account, bookedAt, now) };
  assert.throws(() => recordVerifiedTransfer(receipt, 19000, { transferReference: 'FORGED0001', receivedAmount: 190 }, [receipt]));
  recordVerifiedTransfer(receipt, 19000, { transferReference: 'TRANSFER0001', receivedAmount: 190 }, [receipt]);
  const other = structuredClone(receipt); other.id = 'two';
  assert.throws(() => recordVerifiedTransfer(other, 19000, { transferReference: 'TRANSFER0001', receivedAmount: 190 }, [receipt, other]));
  other.verification!.status = 'rejected';
  assert.throws(() => recordVerifiedTransfer(other, 19000, { transferReference: 'TRANSFER0002', receivedAmount: 190 }, [other]));
});

test('Worker-compatible quota and image requests reject redirects without forwarding secrets or evidence', async () => {
  const env = { SLIPOK_API_KEY: 'fixture-private-secret', SLIPOK_BRANCH_ID: '77946' };
  for (const location of ['https://other.example/?key=fixture-private-secret', 'https://api.slipok.com/api/line/apikey/77946/']) {
    let calls = 0;
    const transport = async (_url: any, init: any) => { calls++; assert.equal(init.redirect, 'manual'); return new Response(null, { status: 307, headers: { Location: location } }); };
    const quota = await checkSlipOkConnection(env, transport); assert.equal(quota.connected, false); assert.equal(quota.diagnostic, 'upstream_redirect'); assert.equal(calls, 1);
    const verification = await verifySlipOk(env, new ArrayBuffer(1), 'image/png', 19000, account, bookedAt, transport); assert.equal(verification.status, 'retry'); assert.equal(calls, 2);
    assert.doesNotMatch(JSON.stringify([quota, verification]), /fixture-private-secret|other.example/);
  }
  const quota = await checkSlipOkConnection(env, async (_url: any, init: any) => { assert.equal(init.redirect, 'manual'); return new Response(JSON.stringify({ success: true, data: { quota: 100, overQuota: 0 } })); });
  assert.equal(quota.connected, true); assert.equal(quota.quota, 100);
  const malformed = await checkSlipOkConnection(env, async () => new Response('private upstream content', { status: 502 }));
  assert.equal(malformed.connected, false); assert.equal(malformed.upstreamStatus, 502); assert.equal(malformed.diagnostic, 'response_format'); assert.doesNotMatch(JSON.stringify(malformed), /private upstream content/);
});
