import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { configuredChannels, activeTransferAccount, parsePaymentChannels, publicTransferAccount, transferOptions, channelLabel } from './paymentChannels';
import { slipokResult } from '../cloudflare/slipok';
import PaymentChannelSettings from './PaymentChannelSettings';
const bank = { id: 'bank', kind: 'bank', enabled: true, bankName: 'BAY', accountName: 'Bank fixture', accountNumber: '1234567890' };
const linked = { id: 'bank-promptpay', kind: 'promptpay', enabled: true, bankName: 'BAY', accountName: 'Bank fixture', accountNumber: '0899999999', linkedBank: { bankName: 'BAY', accountNumber: bank.accountNumber } };
const other = { id: 'promptpay', kind: 'promptpay', enabled: false, bankName: 'พร้อมเพย์', accountName: 'Other fixture', accountNumber: '0812345678', linkedBank: { bankName: 'SCB', accountNumber: '9876543210' } };

test('legacy combined bank migrates to three independent routes without enabling the disabled other recipient or mutating input', () => {
  const settings = { channels: [{ ...bank, bankPromptPayPhone: linked.accountNumber }, other] };
  const before = JSON.stringify(settings), channels = configuredChannels(settings as any);
  assert.deepEqual(channels.map(c => [c.id, c.enabled]), [['bank', true], ['bank-promptpay', true], ['promptpay', false]]);
  assert.equal(channels[0].bankPromptPayPhone, undefined);
  assert.equal(channels[1].accountNumber, linked.accountNumber);
  assert.deepEqual(channels[1].linkedBank, linked.linkedBank);
  assert.equal(JSON.stringify(settings), before);
  const snapshot = activeTransferAccount({ channels });
  assert.equal(transferOptions(snapshot).length, 2);
  assert.equal(snapshot?.alternatives?.[0].id, 'bank-promptpay');
  channels[1].accountNumber = '0888888888';
  assert.equal(snapshot?.alternatives?.[0].accountNumber, linked.accountNumber);
  const visible = publicTransferAccount(snapshot);
  assert.equal(visible?.alternatives?.[0].linkedBank, undefined);
  assert.match(channelLabel(visible!.alternatives![0]), /BAY/);
});

test('three-channel parser validates stable IDs, distinct mobiles, linked bank and conflicting legacy configuration', () => {
  const channels = parsePaymentChannels([bank, linked, other]);
  assert.equal(channels?.length, 3);
  for (const invalid of [
    [bank, linked, { ...other, accountNumber: linked.accountNumber }],
    [bank, linked, { ...other, id: 'bank-promptpay' }],
    [bank, { ...linked, kind: 'bank' }, other],
    [bank, { ...linked, linkedBank: undefined }, other],
    [{ ...bank, bankPromptPayPhone: '0888888888' }, linked, other],
  ]) assert.equal(parsePaymentChannels(invalid), null);
  const html = renderToStaticMarkup(createElement(PaymentChannelSettings, { channels: channels!, busy: false, save: async () => true }));
  assert.equal((html.match(/<fieldset/g) || []).length, 3);
  assert.match(html, /พร้อมเพย์ที่ผูกบัญชีกรุงศรี/);
  assert.match(html, /พร้อมเพย์อีกบัญชี/);
});

test('verified receipt identifies the linked PromptPay route and rejects contradictory bank account evidence', () => {
  const account = activeTransferAccount({ channels: parsePaymentChannels([bank, linked, other])! })!;
  const now = Date.parse('2026-10-09T06:00:00Z'), bookedAt = '2026-10-09T05:50:00Z';
  const payload = { success: true, data: { success: true, amount: 190, transRef: 'THREECHANNEL001', countryCode: 'TH', paidLocalCurrency: null, sendingBank: '014', receivingBank: '', transDate: '20261009', transTime: '12:55:00', receiver: { proxy: { type: 'MSISDN', value: '089xxx9999' }, account: { type: '', value: '' } } } };
  const result = slipokResult(payload, true, 19000, account, bookedAt, now);
  assert.equal(result.status, 'verified', result.message);
  assert.equal(result.paymentChannelId, 'bank-promptpay');
  const onlyLinked = { ...linked, enabled: true };
  const bad = { ...payload, data: { ...payload.data, receivingBank: '025', receiver: { ...payload.data.receiver, account: { type: 'BANKAC', value: 'xxx-x-x9999-x' } } } };
  assert.equal(slipokResult(bad, true, 19000, onlyLinked as any, bookedAt, now).status, 'rejected');
  assert.equal(slipokResult(payload, true, 19000, bank as any, bookedAt, now).status, 'rejected');
});
