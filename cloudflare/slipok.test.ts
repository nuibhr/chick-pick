import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesSlipAccount, slipokConfigured, slipokResult, verifySlipOk } from './slipok';
import { recordVerifiedTransfer } from './receiptVerification';
import type { ReceiptSubmission } from '../src/marketplaceTypes';
import { unavailableOcr } from './pilotDomain';

const now = Date.parse('2026-10-07T06:00:00Z'), bookedAt = '2026-10-07T05:50:00Z';
const account = { bankName: 'ธนาคารกสิกรไทย', accountName: 'Test', accountNumber: '1234531090' };
const valid = () => ({ success: true, data: { success: true, transRef: 'TRANSFER0001', amount: 190, countryCode: 'TH', paidLocalCurrency: '764', receivingBank: '004', transDate: '20261007', transTime: '12:55:00', receiver: { displayName: 'Test', account: { value: 'xxx-x-x3109-x' } } } });

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
    assert.equal(init.body.get('log'), 'true'); assert.equal(init.body.get('amount'), '190.00'); assert.equal(init.redirect, 'error'); assert.ok(init.body.get('files') instanceof Blob);
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
