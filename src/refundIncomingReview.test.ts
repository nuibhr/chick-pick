import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RefundIncomingReview from './RefundIncomingReview';
import type { ReceiptSubmission } from './marketplaceTypes';
const receipt = (): ReceiptSubmission => ({ id: 'fixture-slip', fileName: 'fixture.png', mimeType: 'image/png', size: 100, status: 'pending', submittedAt: new Date().toISOString(), ocr: { status: 'unavailable', amount: null, transferredAt: null, reference: null, sender: null, receiver: null, rawText: null, confidence: null } });
const render = (receipts: ReceiptSubmission[]) => renderToStaticMarkup(createElement(RefundIncomingReview, { receipts, amount: 19000, busy: false, mutate() {} }));
test('verified refund evidence shows server reference and amount with no editable incoming fields', () => {
  const r = receipt(); r.verification = { provider: 'slipok', status: 'verified', checkedAt: r.submittedAt, message: 'Verified', reference: 'IN123456', amountSatang: 19000 };
  const html = render([r]);
  assert.match(html, /IN123456/); assert.match(html, /190\.00/); assert.match(html, /ไม่ต้องกรอกเอง/);
  assert.doesNotMatch(html, /inputMode="decimal"|autoComplete="off"|ตรวจแล้วไม่พบเงินเข้า/);
});
test('unverified preserved slip offers checking and manual bank fallback without trusting OCR reference', () => {
  const r = receipt(); r.ocr.reference = 'OCRUNTRUSTED123';
  const html = render([r]); assert.match(html, /ตรวจสลิปและเติมข้อมูลอัตโนมัติ/); assert.match(html, /เลขอ้างอิงเงินเข้าที่ตรวจจากธนาคาร/); assert.doesNotMatch(html, /OCRUNTRUSTED123/);
});
test('definitive failed checks do not promise another verification, and missing evidence does not offer a fake check', () => {
  const r = receipt(); r.verification = { provider: 'slipok', status: 'rejected', checkedAt: r.submittedAt, message: 'ภาพไม่ใช่สลิปโอนสำเร็จ' };
  assert.doesNotMatch(render([r]), /ตรวจสลิปและเติมข้อมูลอัตโนมัติ/); assert.match(render([r]), /ภาพไม่ใช่สลิปโอนสำเร็จ/);
  assert.doesNotMatch(render([]), /ตรวจสลิปและเติมข้อมูลอัตโนมัติ/);
});
