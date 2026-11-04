import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manageRefund, assertRefundReferenceAvailable } from './refunds';
import type { FinanceDocuments } from './financeDomain';
import { revenueReport, settle } from './financeDomain';
import { financeRows, summarize } from '../src/financeModel';
import { activeBooking, type Booking, type ReceiptSubmission } from '../src/marketplaceTypes';
import { authorize } from './adminTeam';
import { defaultRevenueConfig } from '../src/revenueMath';
import { paymentTicketLabel } from '../src/paymentPresentation';
import { publicRefund } from '../src/refundTypes';

const actor = { sub: 'finance-staff', name: 'Finance' };
const stamp = '2026-10-09T05:00:00.000Z';
const slip = (): ReceiptSubmission => ({ id: 'slip', sha256: 'original-image-hash', mimeType: 'image/png', fileName: 'slip.png', size: 100, submittedAt: stamp, status: 'pending', verification: { provider: 'slipok', status: 'rejected', checkedAt: stamp, message: 'เวลาโอนไม่ตรงกับการจอง' }, ocr: { status: 'unavailable', amount: null, transferredAt: null, reference: null, sender: null, receiver: null, rawText: null, confidence: null } });
const booking = (): Booking => ({ id: 'booking', playerId: 'line:member', playerName: 'Member', sessionId: 'game', title: 'Game', amount: 19000, createdAt: stamp, admissionStatus: 'pending', receipts: [slip()] });
const fixture = (): FinanceDocuments => ({ marketplace: { sessions: [], bookings: [booking()] }, coaching: [], finance: [], 'revenue-config': [{ ...defaultRevenueConfig, confirmed: true }], 'revenue-settlements': [] });
const cancel = (d: FinanceDocuments) => manageRefund(d, 'game', 'booking', { action: 'cancel', reason: 'สลิปเดิมไม่ตรงเวลาจอง ยกเลิกและตรวจเงินคืน', confirmCancellation: true }, actor);
const received = (d: FinanceDocuments) => manageRefund(d, 'game', 'booking', { action: 'confirm_received', fundsChecked: true, receiptId: 'slip', receivedAmount: 19000, transferReference: 'BANK-IN-123456' }, actor);

test('cancel pending rejected verification preserves evidence, releases seat, and never claims refund or admission', () => {
  const d = fixture(), before = structuredClone(d.marketplace.bookings[0].receipts);
  cancel(d); const b = d.marketplace.bookings[0];
  assert.equal(activeBooking(b), false); assert.equal(b.refund?.status, 'review_required');
  assert.equal(b.paidAt, undefined); assert.deepEqual(b.receipts, before);
  assert.equal(paymentTicketLabel({ cancelledAt: b.cancelledAt, refund: publicRefund(b.refund) }), 'ยกเลิกแล้ว · รอตรวจเงินเข้าเพื่อคืนเงิน');
  assert.deepEqual(summarize(financeRows([], [], d.marketplace)).summary, { income: 0, expense: 0, net: 0, pendingIncome: 0, pendingExpense: 0 });
  assert.equal(cancel(d).repeated, true);
  assert.throws(() => manageRefund(d, 'game', 'booking', { action: 'complete', refundReference: 'OUT123456', refundTransferred: true }, actor));
});
test('confirmed money reserves full refund; completion is explicit and idempotent; original income remains', () => {
  const d = fixture(); cancel(d); received(d);
  const b = d.marketplace.bookings[0]; assert.equal(b.paidAt, undefined); assert.equal(b.admissionStatus, 'pending');
  assert.deepEqual(summarize(financeRows([], [], d.marketplace)).summary, { income: 19000, expense: 0, net: 19000, pendingIncome: 0, pendingExpense: 19000 });
  assert.throws(() => manageRefund(d, 'game', b.id, { action: 'complete', refundReference: 'OUT123456' }, actor));
  const command = { action: 'complete', refundReference: 'OUT123456', refundTransferred: true };
  manageRefund(d, 'game', b.id, command, actor); assert.equal(manageRefund(d, 'game', b.id, command, actor).repeated, true);
  assert.equal(financeRows([], [], d.marketplace).filter(r => r.category === 'refund').length, 1);
  assert.deepEqual(summarize(financeRows([], [], d.marketplace)).summary, { income: 19000, expense: 19000, net: 0, pendingIncome: 0, pendingExpense: 0 });
  assert.throws(() => manageRefund(d, 'game', b.id, { action: 'no_funds', fundsChecked: true, reason: 'ไม่มีเงินเข้า' }, actor));
});
test('paid cancellation keeps gross income and reserves refund without erasing original approved slip', () => {
  const d = fixture(), b = d.marketplace.bookings[0]; b.paidAt = stamp; b.admissionStatus = 'approved'; b.receipts![0].status = 'approved'; b.receipts![0].verifiedTransferReference = 'ORIGINAL123';
  cancel(d); assert.equal(b.refund?.status, 'pending'); assert.equal(b.paidAt, stamp); assert.equal(b.admissionStatus, 'pending');
  assert.equal(summarize(financeRows([], [], d.marketplace)).summary.income, 19000);
  assert.equal(b.receipts![0].status, 'approved');
});
test('cancelled reference stays reserved across games and coaching; reused image cannot be refunded twice', () => {
  const d = fixture(); cancel(d); received(d);
  assert.throws(() => assertRefundReferenceAvailable(d, 'bank in 123456'));
  const other = booking(); other.id = 'second'; other.receipts![0].id = 'slip2'; d.marketplace.bookings.push(other);
  manageRefund(d, 'game', other.id, { action: 'cancel', reason: 'ตรวจคืนเงิน', confirmCancellation: true }, actor);
  assert.throws(() => manageRefund(d, 'game', other.id, { action: 'confirm_received', fundsChecked: true, receiptId: 'slip2', receivedAmount: 19000, transferReference: 'DIFFERENT123' }, actor));
});
test('no-money resolution requires bank check; operator and viewer cannot change refunds', () => {
  const d = fixture(); cancel(d);
  assert.throws(() => manageRefund(d, 'game', 'booking', { action: 'no_funds', reason: 'ตรวจไม่พบเงิน' }, actor));
  manageRefund(d, 'game', 'booking', { action: 'no_funds', reason: 'ตรวจรายการธนาคารแล้วไม่พบเงินเข้า', fundsChecked: true }, actor);
  assert.equal(d.marketplace.bookings[0].refund?.status, 'not_required');
  for (const role of ['operator', 'viewer'] as const) assert.throws(() => authorize(role, '/api/marketplace/bookings/booking/refund', 'POST'));
  for (const role of ['finance', 'owner', ['operator', 'finance']] as const) assert.doesNotThrow(() => authorize(role, '/api/coaching/enrollments/booking/refund', 'POST'));
  assert.throws(() => authorize('finance', '/api/marketplace/bookings/booking/refund', 'GET'));
});
test('coach cancellation releases scheduled slots and preserves completed lessons and income', () => {
  const d = fixture(); d.coaching.push({ id: 'lesson', coachId: 'coach', student: 'Member', phone: '', title: 'Lesson', totalHours: 2, amount: 800, payment: 'paid', paidAt: stamp, createdAt: stamp, lessons: [{ id: 'first', start: stamp, hours: 1, status: 'completed' }, { id: 'next', start: '2026-10-10T00:00:00Z', hours: 1, status: 'scheduled' }] });
  manageRefund(d, 'coaching', 'lesson', { action: 'cancel', reason: 'ยกเลิกคอร์สและคืนเต็มจำนวน', confirmCancellation: true }, actor);
  assert.deepEqual(d.coaching[0].lessons.map(l => l.status), ['completed', 'cancelled']);
  const report = summarize(financeRows([], d.coaching, { sessions: [], bookings: [] }));
  assert.equal(report.summary.income, 80000); assert.equal(report.summary.pendingExpense, 80000);
});
test('pending refund prevents revenue closing; fully refunded revenue cannot generate commission', async () => {
  const d = fixture(); cancel(d); received(d);
  let report = await revenueReport(d), u = report.units[0];
  assert.equal(u.gross, 19000); assert.equal(u.refunds, 19000); assert.equal(u.platform, 0);
  await assert.rejects(() => settle(d, { key: u.key, fingerprint: u.fingerprint, configVersion: report.config.version }));
  manageRefund(d, 'game', 'booking', { action: 'complete', refundReference: 'OUT123456', refundTransferred: true }, actor);
  report = await revenueReport(d); u = report.units[0];
  await settle(d, { key: u.key, fingerprint: u.fingerprint, configVersion: report.config.version });
  assert.equal(d['revenue-settlements'].length, 1);
});
test('refunds fail closed for Stripe and closed settlements; public view excludes private references and staff IDs', () => {
  const d = fixture(); d['revenue-settlements'].push({ key: 'game:game' } as any); assert.throws(() => cancel(d)); d['revenue-settlements'] = [];
  d.marketplace.bookings[0].stripe = { status: 'paid' } as any; assert.throws(() => cancel(d)); delete d.marketplace.bookings[0].stripe;
  cancel(d); received(d); const exposed = publicRefund(d.marketplace.bookings[0].refund)!;
  assert.deepEqual(Object.keys(exposed).sort(), ['completedAt', 'reason', 'receivedAmount', 'status', 'updatedAt']);
});
