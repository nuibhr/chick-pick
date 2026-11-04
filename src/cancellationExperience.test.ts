import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ExpiredBookingActions from './ExpiredBookingActions';
import PlayerBookingCard from './PlayerBookingCard';
import PlayerNotifications from './PlayerNotifications';
import { playerNotices, currentBookingVisible } from './playerNotificationModel';
import PlayerTransferInstructions from './PlayerTransferInstructions';
import type { PlayerBooking } from './playerBookingTypes';

const now = Date.now();
const fixture = (): PlayerBooking => ({ id: 'booking', sessionId: 'game', title: 'Open Play', amount: 19000, createdAt: new Date(now - 360000).toISOString(), holdExpiresAt: new Date(now - 60000).toISOString(), paidAt: null, cancelledAt: null, admissionStatus: 'pending', transferAccount: null, receipt: null });
test('expired customer sees a truthful unpaid renewal path and paid evidence path instead of being forced to upload something', () => {
  const html = renderToStaticMarkup(createElement(ExpiredBookingActions, { booking: fixture(), now, busy: false, available: true, renew() {}, browse() {}, upload() {} }));
  assert.match(html, /ยังไม่ได้โอน · จองต่อและรับ QR ใหม่/); assert.match(html, /โอนแล้ว · ส่งสลิปย้อนหลัง/);
  assert.doesNotMatch(html, /type="file"/); assert.doesNotMatch(html, /<img/);
});
test('cancelled booking has one terminal state and no contradictory upload, renewal or pay instructions', () => {
  const row = fixture(); row.cancelledAt = new Date(now - 100).toISOString(); row.refund = { status: 'not_required', reason: 'ตรวจแล้ว ไม่มีเงินเข้า' };
  const html = renderToStaticMarkup(createElement(PlayerBookingCard, { booking: row, now, busy: false, token: 'fixture', config: {}, renew() {}, browse() {}, upload() {}, cancel() {}, refresh: async () => {}, openQr: async () => '' }));
  assert.match(html, /ไม่มียอดเงินที่ต้องคืน/); assert.doesNotMatch(html, /type="file"|จองต่อและรับ QR ใหม่|แนบสลิป|<img/);
});
test('notifications distinguish expired, cancelled, received, admitted and refunded states and suppress superseded holds', () => {
  const row = fixture(); assert.equal(playerNotices([row], now)[0].title, 'หมดเวลาถือที่นั่ง');
  row.replacementBookingId = 'new'; assert.equal(playerNotices([row], now).length, 0); delete row.replacementBookingId;
  row.cancelledAt = new Date(now - 50).toISOString(); row.refund = { status: 'pending', reason: 'Cancelled', receivedAmount: 19000 };
  assert.match(playerNotices([row], now)[0].body, /รอผู้จัดโอนคืน/);
  row.refund.status = 'completed'; row.refund.updatedAt = new Date(now - 10).toISOString(); assert.match(playerNotices([row], now)[0].body, /บันทึกโอนคืนแล้ว/);
  const paid = fixture(); paid.paidAt = new Date(now - 100).toISOString(); assert.equal(playerNotices([paid], now)[0].title, 'ยืนยันเงินเข้าแล้ว');
  paid.admissionStatus = 'approved'; paid.admissionUpdatedAt = new Date(now - 10).toISOString(); assert.equal(playerNotices([paid], now)[0].title, 'ยืนยันการเข้าร่วมแล้ว');
});
test('small bell unread count follows server read cursor without exposing payment references', () => {
  const booking = fixture(), render = (readAt: string | null) => renderToStaticMarkup(createElement(PlayerNotifications, { bookings: [booking], now, readAt, signedIn: true, login() {}, markRead: async () => {}, openBooking() {} }));
  assert.match(render(null), /แจ้งเตือน 1 รายการยังไม่อ่าน/); assert.doesNotMatch(render(new Date(now).toISOString()), /รายการยังไม่อ่าน/);
});

test('renewed old holds stay in history but new money evidence on the old booking is never hidden', () => {
  const booking = fixture(); booking.replacementBookingId = 'replacement'; assert.equal(currentBookingVisible(booking), false);
  booking.latePayment = { status: 'review_required', receiptId: 'proof', submittedAt: new Date(now - 10).toISOString() };
  assert.equal(currentBookingVisible(booking), true); assert.equal(playerNotices([booking], now)[0].title, 'รับสลิปย้อนหลังแล้ว');
  const html = renderToStaticMarkup(createElement(ExpiredBookingActions, { booking: { ...booking, latePayment: undefined }, now, busy: false, available: true, renew() {}, browse() {}, upload() {} }));
  assert.match(html, /มีรายการจองต่อแล้ว/); assert.match(html, /โอนแล้ว · ส่งสลิปย้อนหลัง/); assert.doesNotMatch(html, /ยังไม่ได้โอน · จองต่อและรับ QR ใหม่/);
});

test('payment view selects an enabled QR-capable recipient first instead of leaving the user on a bank-only tab', () => {
  const account = { id: 'bank', kind: 'bank' as const, bankName: 'Bank', accountName: 'Bank fixture', accountNumber: '0000000000', alternatives: [{ id: 'promptpay', kind: 'promptpay' as const, bankName: 'พร้อมเพย์', accountName: 'QR fixture', accountNumber: '0812345678' }] };
  const html = renderToStaticMarkup(createElement(PlayerTransferInstructions, { account, amount: 19000, slipok: true, pending: false }));
  assert.match(html, /aria-pressed="true">พร้อมเพย์/); assert.match(html, /QR fixture/);
});
