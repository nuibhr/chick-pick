import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FinanceDocuments } from './financeDomain';
import { revenueReport, settle } from './financeDomain';
import { submitReceipt, unavailableOcr } from './pilotDomain';
import { resolveLatePayment } from './latePayments';
import { manageRefund } from './refunds';
import { activeBooking, type Booking, type ReceiptSubmission } from '../src/marketplaceTypes';
import { paymentHoldExpired } from '../src/bookingHold';
import { publicLatePayment } from '../src/latePayment';
import { defaultRevenueConfig } from '../src/revenueMath';
import { financeRows, summarize } from '../src/financeModel';
import BookingHoldNotice from '../src/BookingHoldNotice';
import LateReceiptUpload from '../src/LateReceiptUpload';
import { submitLessonReceipt, lessonView } from './coachingDomain';
import { lessonHoldExpired } from '../src/coachingTypes';

const actor = { sub: 'member', name: 'Member' }, admin = { sub: 'owner', name: 'Owner' };
const fixture = () => {
  const now = Date.now(), createdAt = new Date(now - 600000).toISOString();
  const row: Booking = { id: 'late', sessionId: 'game', playerId: 'line:member', playerName: 'Member', title: 'Game', amount: 19000, createdAt, holdExpiresAt: new Date(now - 300000).toISOString(), transferAccount: { bankName: 'Fixture', accountName: 'Fixture', accountNumber: '0000000000' } };
  const d: FinanceDocuments = { marketplace: { sessions: [{ id: 'game', venue: 'Court', title: 'Game', price: 190, capacity: 4, courtCount: 1, startsAt: new Date(now + 86400000).toISOString(), status: 'open', area: '', date: '', time: '', joined: 0, dupr: '', vibe: '', host: '', hostRating: 0, venueCost: 0, tags: [] }], bookings: [row] }, coaching: [], finance: [], 'court-venues': [{ id: 'court', name: 'Court', active: true, area: 'Area', address: '' }], 'revenue-config': [{ ...defaultRevenueConfig, confirmed: true }], 'revenue-settlements': [] };
  const receipt: ReceiptSubmission = { id: 'receipt', fileName: 'proof.png', mimeType: 'image/png', size: 8, sha256: 'original-proof', submittedAt: new Date(now).toISOString(), status: 'pending', ocr: unavailableOcr(), verification: { provider: 'slipok', status: 'verified', reference: 'SOURCE123456', amountSatang: 19000, checkedAt: new Date(now).toISOString(), message: 'Verified' } };
  return { d, row, receipt };
};
const command = { action: 'accept', fundsChecked: true, receiptId: 'receipt' };

test('late evidence stays on original booking, never holds a seat or offers a new transfer', () => {
  const { d, row, receipt } = fixture(); submitReceipt(d.marketplace, actor, row.id, receipt);
  assert.equal(row.latePayment?.status, 'review_required'); assert.equal(activeBooking(row), false);
  assert.equal(paymentHoldExpired({ ...row, paidAt: new Date().toISOString() }), true);
  const rendered = renderToStaticMarkup(createElement(BookingHoldNotice, { booking: { ...row, receipt }, now: Date.now() }));
  assert.match(rendered, /ยังไม่ยืนยันที่นั่ง/); assert.doesNotMatch(rendered, /เก็บที่นั่งไว้/);
  assert.equal(renderToStaticMarkup(createElement(LateReceiptUpload, { booking: { ...row, receipt }, now: Date.now(), busy: false, upload: () => {} })), '');
  assert.equal(Object.hasOwn(publicLatePayment({ ...row.latePayment!, resolvedBy: 'private-staff-id' })!, 'resolvedBy'), false);
});
test('only verified money plus actual capacity restore a seat; accept retry does not record income twice', () => {
  const { d, row, receipt } = fixture(); submitReceipt(d.marketplace, actor, row.id, receipt);
  resolveLatePayment(d, 'game', row.id, command, admin);
  assert.equal(activeBooking(row), true); assert.equal(row.admissionStatus, 'pending');
  assert.equal(resolveLatePayment(d, 'game', row.id, command, admin).repeated, true);
  assert.equal(summarize(financeRows([], [], d.marketplace)).summary.income, 19000);
  assert.throws(() => resolveLatePayment(d, 'game', row.id, { ...command, action: 'refund' }, admin));
});
test('full, started, hidden, paused or duplicate-player games never accept late evidence', () => {
  for (const scenario of ['full', 'started', 'hidden', 'paused', 'duplicate']) {
    const { d, row, receipt } = fixture(); submitReceipt(d.marketplace, actor, row.id, receipt);
    if (scenario === 'full') for (let i = 0; i < 4; i++) d.marketplace.bookings.push({ ...row, id: 'other' + i, playerId: 'other' + i, latePayment: undefined, receipts: undefined, paidAt: new Date().toISOString() });
    if (scenario === 'duplicate') d.marketplace.bookings.push({ ...row, id: 'new', latePayment: undefined, receipts: undefined, paidAt: new Date().toISOString() });
    if (scenario === 'started') d.marketplace.sessions[0].startsAt = new Date(Date.now() - 1).toISOString();
    if (scenario === 'hidden') d['court-venues']![0].active = false;
    if (scenario === 'paused') d.marketplace.sessions[0].bookingPaused = true;
    assert.throws(() => resolveLatePayment(d, 'game', row.id, command, admin), scenario);
    assert.equal(row.paidAt, undefined); assert.equal(activeBooking(row), false);
  }
});
test('failed SlipOK, wrong amount and reused transfer cannot be accepted or automatically queued as verified money', () => {
  for (const scenario of ['failed', 'amount', 'duplicate']) {
    const { d, row, receipt } = fixture(); submitReceipt(d.marketplace, actor, row.id, receipt);
    if (scenario === 'failed') receipt.verification!.status = 'rejected';
    if (scenario === 'amount') receipt.verification!.amountSatang = 999;
    if (scenario === 'duplicate') d.marketplace.bookings.push({ ...row, id: 'other', playerId: 'other', latePayment: undefined, receipts: [{ ...receipt, id: 'other-receipt', status: 'approved', verifiedTransferReference: receipt.verification!.reference }] });
    for (const action of ['accept', 'refund']) assert.throws(() => resolveLatePayment(d, 'game', row.id, { ...command, action }, admin));
    assert.equal(row.cancelledAt, undefined);
  }
});
test('verified late payment enters refund queue without paid admission; no bank transfer is claimed', () => {
  const { d, row, receipt } = fixture(); submitReceipt(d.marketplace, actor, row.id, receipt);
  const cmd = { ...command, action: 'refund' }; resolveLatePayment(d, 'game', row.id, cmd, admin);
  assert.equal(row.refund?.status, 'pending'); assert.equal(row.paidAt, undefined); assert.equal(row.refund?.completedAt, undefined);
  assert.equal(activeBooking(row), false); assert.equal(resolveLatePayment(d, 'game', row.id, cmd, admin).repeated, true);
  const totals = summarize(financeRows([], [], d.marketplace)).summary;
  assert.equal(totals.income, 19000); assert.equal(totals.pendingExpense, 19000);
});
test('late money after settlement is an independent adjustment; closed commission and fingerprint remain unchanged', async () => {
  const { d, row, receipt } = fixture();
  d.marketplace.bookings.push({ ...row, id: 'paid', playerId: 'other', paidAt: new Date().toISOString(), receipts: undefined });
  let report = await revenueReport(d), unit = report.units[0];
  await settle(d, { key: unit.key, fingerprint: unit.fingerprint, configVersion: report.config.version });
  const before = structuredClone(d['revenue-settlements']); submitReceipt(d.marketplace, actor, row.id, receipt);
  assert.throws(() => resolveLatePayment(d, 'game', row.id, command, admin));
  resolveLatePayment(d, 'game', row.id, { ...command, action: 'refund' }, admin);
  assert.equal(row.refund?.postSettlement, true); assert.deepEqual(d['revenue-settlements'], before);
  report = await revenueReport(d); assert.equal(report.units[0].changed, false); assert.equal(report.units[0].gross, 19000);
  manageRefund(d, 'game', row.id, { action: 'complete', refundTransferred: true, refundReference: 'OUTGOING123456' }, admin);
  const summary = summarize(financeRows([], [], d.marketplace)).summary;
  assert.equal(summary.income, 38000); assert.equal(summary.expense, 19000); assert.equal(summary.net, 19000);
});

test('coach late upload does not claim a slot; recovery refuses a competing coach or student reservation', () => {
  for (const competitor of ['none', 'same-coach', 'same-student']) {
    const { d, row, receipt } = fixture(), start = new Date(Date.now() + 86400000).toISOString();
    d['coach-profiles'] = [{ id: 'coach', name: 'Coach', initials: 'C', specialty: '', bio: '', venue: 'Court', hourlyRate: 190, active: true, bookingFee: 20, courses: [] }];
    d['coach-slots'] = [{ id: 'slot', coachId: 'coach', start, hours: 1, price: 190, status: 'open' }];
    d.coaching.push({ id: 'enrollment', coachId: 'coach', student: 'Member', playerId: row.playerId, phone: '', title: 'Lesson', amount: 190, totalHours: 1, venue: 'Court', payment: 'pending', createdAt: row.createdAt, holdExpiresAt: row.holdExpiresAt, transferAccount: row.transferAccount, lessons: [{ id: 'lesson', slotId: 'slot', start, hours: 1, status: 'scheduled' }] });
    const lesson = d.coaching[0]; submitLessonReceipt(d, actor, lesson.id, receipt);
    assert.equal(lessonHoldExpired(lesson), true); assert.equal(lessonView(lesson).cancelledAt, null); assert.equal(lessonView(lesson).holdExpired, true);
    if (competitor !== 'none') d.coaching.push({ ...lesson, id: 'other', coachId: competitor === 'same-coach' ? 'coach' : 'another-coach', playerId: competitor === 'same-student' ? row.playerId : 'line:other', latePayment: undefined, receipts: undefined, payment: 'paid', paidAt: new Date().toISOString() });
    if (competitor === 'none') { resolveLatePayment(d, 'coaching', lesson.id, command, admin); assert.equal(lesson.payment, 'paid'); assert.equal(lessonHoldExpired(lesson), false); }
    else { assert.throws(() => resolveLatePayment(d, 'coaching', lesson.id, command, admin)); assert.equal(lesson.paidAt, undefined); }
  }
});

test('expired player can submit evidence but cannot upload after cancellation or use another player booking', () => {
  const { d, row, receipt } = fixture();
  assert.throws(() => submitReceipt(d.marketplace, { sub: 'stranger', name: 'Stranger' }, row.id, receipt));
  row.cancelledAt = new Date().toISOString(); assert.throws(() => submitReceipt(d.marketplace, actor, row.id, receipt));
  assert.equal(row.receipts, undefined);
  const html = renderToStaticMarkup(createElement(LateReceiptUpload, { booking: { ...row, cancelledAt: undefined }, now: Date.now(), busy: false, upload: () => {} }));
  assert.match(html, /ส่งสลิปย้อนหลัง/); assert.match(html, /ไม่รับประกันที่นั่ง/); assert.doesNotMatch(html, /QR/);
});
