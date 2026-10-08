import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReceiptReview from './ReceiptReview';
import type { ReceiptSubmission } from './marketplaceTypes';

const booking = { id: 'fixture', playerName: 'Fixture', title: 'Open Play', amount: 19000 };
const receipt: ReceiptSubmission = { id: 'receipt', fileName: 'fixture.png', mimeType: 'image/png', size: 1, status: 'pending', submittedAt: '2026-10-08T06:00:00Z', ocr: { status: 'unavailable', amount: null, transferredAt: null, reference: null, sender: null, receiver: null, rawText: null, confidence: null } };
const view = (value: ReceiptSubmission) => renderToStaticMarkup(createElement(ReceiptReview, { booking, receipt: value, busy: false, mutate: async () => true }));

test('legacy currency failure offers a same-image repair, while other rejected checks remain blocked', () => {
  const legacy = view({ ...receipt, verification: { provider: 'slipok', status: 'rejected', checkedAt: receipt.submittedAt, message: 'สลิปนี้ไม่ใช่รายการเงินบาทในประเทศไทย' } });
  assert.match(legacy, /ตรวจสลิปเดิมใหม่หลังแก้ระบบ/); assert.doesNotMatch(legacy, /ยืนยันเงินเข้าและอนุมัติ/);
  const duplicate = view({ ...receipt, verification: { provider: 'slipok', status: 'rejected', checkedAt: receipt.submittedAt, code: 1012, message: 'สลิปนี้ไม่ใช่รายการเงินบาทในประเทศไทย' } });
  assert.doesNotMatch(duplicate, /ตรวจสลิปเดิมใหม่หลังแก้ระบบ/);
});

test('new and failed SlipOK reviews do not ask staff to type reference or amount', () => {
  const fresh = view(receipt);
  assert.match(fresh, /ตรวจสลิปด้วย SlipOK/);
  assert.doesNotMatch(fresh, /placeholder="ตรวจจากประวัติเงินเข้าบัญชี"|placeholder="กรอกยอดที่ตรวจพบในธนาคาร"/);
  const rejected = view({ ...receipt, verification: { provider: 'slipok', status: 'rejected', checkedAt: receipt.submittedAt, message: 'ผู้รับไม่ตรง', code: 1014 } });
  assert.doesNotMatch(rejected, /placeholder="ตรวจจากประวัติเงินเข้าบัญชี"|placeholder="กรอกยอดที่ตรวจพบในธนาคาร"/);
  assert.match(rejected, /ไม่สามารถอนุมัติรายการนี้/);
});

test('verified result presents server money and reference as a summary rather than editable form fields', () => {
  const verified = view({ ...receipt, verification: { provider: 'slipok', status: 'verified', checkedAt: receipt.submittedAt, message: 'ผ่าน', amountSatang: 19000, reference: 'TESTREF123456', paymentChannelLabel: 'พร้อมเพย์ · เบอร์โทร' } });
  assert.match(verified, /190\.00/); assert.match(verified, /TESTREF123456/);
  assert.doesNotMatch(verified, /<input[^>]*value="(?:TESTREF123456|190\.00)"/);
  assert.match(verified, /ยืนยันเงินเข้าและอนุมัติ/);
});
