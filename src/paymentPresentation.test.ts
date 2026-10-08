import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { paymentTicketLabel } from './paymentPresentation';
import SlipVerificationStatus from './SlipVerificationStatus';
import PlayerTransferInstructions from './PlayerTransferInstructions';
import SlipOKSettings from './SlipOKSettings';
import type { SlipVerification } from '../cloudflare/slipok';

const verification: SlipVerification = { provider: 'slipok', status: 'verified', checkedAt: '2026-10-07T10:00:00Z', message: 'รอแอดมินอนุมัติเงิน', amountSatang: 19000, reference: 'TESTTRANSFER0001' };
test('player payment statuses distinguish provider verification, admin receipt approval and court admission', () => {
  assert.match(paymentTicketLabel({ receipt: { status: 'pending', verification } }), /รอแอดมินอนุมัติ/);
  assert.match(paymentTicketLabel({ receipt: { status: 'pending', verification: { ...verification, status: 'retry' } } }), /รอตรวจซ้ำ/);
  assert.match(paymentTicketLabel({ receipt: { status: 'pending', verification: { ...verification, status: 'rejected' } } }), /รอผู้จัดตรวจ/);
  assert.match(paymentTicketLabel({ receipt: { status: 'rejected', verification } }), /ส่งสลิปใหม่/);
  assert.match(paymentTicketLabel({ paidAt: verification.checkedAt, admissionStatus: 'pending' }), /รอผู้จัดเลือก/);
  assert.match(paymentTicketLabel({ paidAt: verification.checkedAt, admissionStatus: 'approved' }), /รับเข้าสนามแล้ว/);
  assert.equal(paymentTicketLabel({ cancelledAt: verification.checkedAt, paidAt: verification.checkedAt }), 'ยกเลิกแล้ว');
  assert.match(paymentTicketLabel({ stripe: { status: 'test_paid' } }), /ยังไม่รับเงินจริง/);
  const approved = renderToStaticMarkup(createElement(SlipVerificationStatus, { verification, receiptStatus: 'approved' }));
  assert.match(approved, /แอดมินตรวจรับเงินเรียบร้อยแล้ว/); assert.doesNotMatch(approved, /รอแอดมิน/);
});

test('customer transfer view uses booking account and exact amount, and pending evidence does not request another transfer', () => {
  const props = { account: { bankName: 'KBANK', accountName: 'Test receiver', accountNumber: '0000000000' }, amount: 19000, slipok: true };
  const fresh = renderToStaticMarkup(createElement(PlayerTransferInstructions, { ...props, pending: false }));
  assert.match(fresh, /190\.00/); assert.match(fresh, /0000000000/); assert.match(fresh, /คัดลอกเลขบัญชี/); assert.match(fresh, /แนบสลิปจากแอปธนาคาร/);
  const pending = renderToStaticMarkup(createElement(PlayerTransferInstructions, { ...props, pending: true }));
  assert.match(pending, /ไม่ต้องโอนซ้ำ/); assert.doesNotMatch(pending, /คัดลอกเลขบัญชี|1\. โอนเงิน/);
  const settings = renderToStaticMarkup(createElement(SlipOKSettings, { configured: false }));
  assert.match(settings, /ตรวจการเชื่อมต่อ SlipOK/); assert.doesNotMatch(settings, /disabled=""/);
});
