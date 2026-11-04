import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelReservation } from './bookingCancellation';
import { book, renewBooking, unavailableOcr } from './pilotDomain';
import type { FinanceDocuments } from './financeDomain';
import { activeBooking } from '../src/marketplaceTypes';
import { financeRows, summarize } from '../src/financeModel';
import { markNotificationsRead, notificationReadKey } from './playerNotifications';
import { manageRefund } from './refunds';

const player = { sub: 'member', name: 'Member' }, owner = { sub: 'owner', name: 'Owner' };
const context = { account: { bankName: 'Fixture', accountName: 'Fixture', accountNumber: '0000000000' }, enabled: true, closed: [], venues: [{ id: 'venue', name: 'Court', area: '', address: '', active: true }] };
function fixture() {
  const docs: FinanceDocuments = { marketplace: { sessions: [{ id: 'game', title: 'Game', venue: 'Court', area: '', time: '18:00', date: '', startsAt: new Date(Date.now() + 86400000).toISOString(), status: 'open', capacity: 4, courtCount: 1, price: 190, joined: 0, dupr: '', vibe: '', host: '', hostRating: 0, venueCost: 0, tags: [] }], bookings: [] }, coaching: [], finance: [], 'revenue-config': [], 'revenue-settlements': [], 'court-venues': context.venues };
  const created = book(docs.marketplace, context, player, 'game'), row = docs.marketplace.bookings[0];
  row.receipts = [{ id: 'receipt', mimeType: 'image/png', fileName: 'receipt.png', size: 8, submittedAt: new Date().toISOString(), status: 'pending', ocr: unavailableOcr(), verification: { provider: 'slipok', status: 'rejected', checkedAt: new Date().toISOString(), message: 'ภาพไม่ใช่สลิปโอนสำเร็จ' } }];
  const command = { confirmCancellation: true, expectedReceiptId: 'receipt', expectedPaidAt: null, disposition: 'no_payment', fundsChecked: true };
  return { docs, row, command, id: created.id };
}
test('one cancellation closes a failed-slip booking and confirmed no-money case without a second cancellation or refund queue', () => {
  const { docs, row, command, id } = fixture(), image = structuredClone(row.receipts);
  const first = cancelReservation(docs, 'game', id, command, owner, true);
  assert.equal(first.refundStatus, 'not_required'); assert.equal(activeBooking(row), false); assert.deepEqual(row.receipts, image);
  assert.equal(cancelReservation(docs, 'game', id, command, owner, true).repeated, true);
  const totals = summarize(financeRows([], [], docs.marketplace)).summary;
  assert.equal(totals.income, 0); assert.equal(totals.pendingExpense, 0); assert.equal(totals.expense, 0);
});
test('unknown money cancels the seat immediately; operations cannot claim money facts or cancel received payments', () => {
  let f = fixture(); cancelReservation(f.docs, 'game', f.id, { ...f.command, disposition: 'unknown' }, player, false);
  assert.equal(f.row.refund?.status, 'review_required'); assert.equal(activeBooking(f.row), false);
  f = fixture(); assert.throws(() => cancelReservation(f.docs, 'game', f.id, f.command, player, false)); assert.equal(f.row.cancelledAt, undefined);
  f.row.paidAt = new Date().toISOString(); assert.throws(() => cancelReservation(f.docs, 'game', f.id, { ...f.command, expectedPaidAt: f.row.paidAt, disposition: 'unknown' }, player, false));
});
test('stale dialogs cannot cancel new receipts or silently override an approval; verified transfers cannot be written off', () => {
  for (const scenario of ['receipt', 'approval', 'verified']) {
    const { docs, row, command, id } = fixture();
    if (scenario === 'receipt') row.receipts![0].id = 'new-receipt';
    if (scenario === 'approval') row.paidAt = new Date().toISOString();
    if (scenario === 'verified') row.receipts![0].verification!.status = 'verified';
    assert.throws(() => cancelReservation(docs, 'game', id, command, owner, true)); assert.equal(row.cancelledAt, undefined);
  }
});
test('received money is queued automatically with server-derived reference and amount; it never claims the refund is completed', () => {
  const { docs, row, command, id } = fixture();
  row.receipts![0].verification = { provider: 'slipok', status: 'verified', reference: 'BANK123456', amountSatang: 19000, checkedAt: new Date().toISOString(), message: 'Verified' };
  cancelReservation(docs, 'game', id, { ...command, disposition: 'received', transferReference: 'CLIENTWRONG', receivedAmount: 1 }, owner, true);
  assert.equal(row.refund?.status, 'pending'); assert.equal(row.refund?.receivedAmount, 19000); assert.equal(row.refund?.transferReference, 'BANK123456'); assert.equal(row.refund?.completedAt, undefined);
  assert.equal(summarize(financeRows([], [], docs.marketplace)).summary.pendingExpense, 19000);
});
test('renewal checks availability and creates a fresh snapshot without reviving old money, proofs or paid records', () => {
  const { docs, row, id } = fixture(); row.receipts = []; row.holdExpiresAt = new Date(Date.now() - 1).toISOString();
  const renewed = renewBooking(docs.marketplace, context, player, id), next = docs.marketplace.bookings.find(b => b.id === renewed.id)!;
  assert.notEqual(next.id, id); assert.equal(row.replacementBookingId, next.id); assert.equal(next.renewedFromId, id); assert.equal(next.receipts, undefined); assert.equal(next.paidAt, undefined);
  assert.equal(activeBooking(row), false); assert.equal(activeBooking(next), true);
  assert.equal(renewBooking(docs.marketplace, context, player, id).id, next.id); assert.equal(docs.marketplace.bookings.length, 2);
  assert.throws(() => renewBooking(docs.marketplace, context, { sub: 'stranger', name: 'Stranger' }, id));
});
test('renewal is unavailable when full or money may already have arrived; fresh holds are never extended', () => {
  const { docs, row, id } = fixture();
  assert.throws(() => renewBooking(docs.marketplace, context, player, id));
  row.receipts = []; const deadline = row.holdExpiresAt; assert.equal(renewBooking(docs.marketplace, context, player, id).id, id); assert.equal(row.holdExpiresAt, deadline);
  row.holdExpiresAt = new Date(Date.now() - 1).toISOString(); for (let i = 0; i < 4; i++) book(docs.marketplace, context, { sub: 'other' + i, name: 'Other' }, 'game');
  assert.throws(() => renewBooking(docs.marketplace, context, player, id)); assert.equal(docs.marketplace.bookings.length, 5);
});
test('notification read cursors are scoped to LINE subject, monotonic and cannot hide future notifications', async () => {
  assert.notEqual(await notificationReadKey('a'), await notificationReadKey('b'));
  const state = {}, now = Date.now(), first = new Date(now - 1000).toISOString();
  assert.equal(markNotificationsRead(state, { readThrough: first }, now).readAt, first);
  assert.equal(markNotificationsRead(state, { readThrough: new Date(now - 2000).toISOString() }, now).readAt, first);
  for (const readThrough of ['invalid', new Date(now + 60000).toISOString(), '1960-01-01']) assert.throws(() => markNotificationsRead(state, { readThrough }, now));
});

test('one coach cancellation releases its lesson and closes a confirmed no-payment case together', () => {
  const { docs, command } = fixture();
  docs.coaching.push({ id: 'lesson', coachId: 'coach', student: 'Member', phone: '', title: 'Lesson', totalHours: 1, amount: 190, payment: 'pending', createdAt: new Date().toISOString(), lessons: [{ id: 'time', start: new Date(Date.now() + 86400000).toISOString(), hours: 1, status: 'scheduled' }] });
  cancelReservation(docs, 'coaching', 'lesson', { ...command, expectedReceiptId: null }, owner, true);
  assert.equal(docs.coaching[0].lessons[0].status, 'cancelled'); assert.equal(docs.coaching[0].refund?.status, 'not_required');
});

test('finance can reopen a previously closed no-money review without reviving the seat or inventing income', () => {
  const { docs, row, command, id } = fixture();
  cancelReservation(docs, 'game', id, command, owner, true);
  manageRefund(docs, 'game', id, { action: 'reopen_review', reason: 'ได้รับข้อมูลเงินเข้าเพิ่มเติมจากผู้เล่น' }, owner);
  assert.equal(row.refund?.status, 'review_required'); assert.ok(row.refund?.reviewReopenedAt); assert.equal(activeBooking(row), false); assert.equal(summarize(financeRows([], [], docs.marketplace)).summary.income, 0);
  assert.throws(() => manageRefund(docs, 'game', id, { action: 'reopen_review', reason: 'กดซ้ำโดยยังไม่ปิด' }, owner));
});
