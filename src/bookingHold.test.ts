import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { holdTimeLeft, paymentHoldExpired } from './bookingHold';
import { paymentTicketLabel } from './paymentPresentation';
import BookingHoldNotice from './BookingHoldNotice';

test('seat hold expires at its exact deadline; paid, admitted, pending slips and legacy payments keep seats', () => {
  const deadline = Date.parse('2026-10-08T12:00:00Z'), row = { holdExpiresAt: new Date(deadline).toISOString() };
  assert.equal(paymentHoldExpired(row, deadline - 1), false);
  assert.equal(paymentHoldExpired(row, deadline), true);
  assert.equal(paymentHoldExpired({}, deadline), false);
  for (const protectedRow of [{ paidAt: 'paid' }, { admissionStatus: 'approved' }, { payment: 'paid' }, { receipt: { status: 'pending' } }, { receipts: [{ status: 'pending' }] }, { stripe: { status: 'requires_review' as const } }, { stripe: { status: 'creating' as const } }]) {
    assert.equal(paymentHoldExpired({ ...row, ...protectedRow }, deadline + 1), false);
  }
  assert.equal(paymentHoldExpired({ ...row, receipt: { status: 'rejected' } }, deadline), true);
  assert.equal(paymentTicketLabel(row, deadline), 'หมดเวลาถือที่นั่ง');
  assert.equal(holdTimeLeft(row.holdExpiresAt, deadline - 300000), '5:00');
  assert.equal(holdTimeLeft(row.holdExpiresAt, deadline - 1), '0:01');
  assert.equal(holdTimeLeft(row.holdExpiresAt, deadline + 1), '0:00');
});

test('player sees countdown, expiry contact guidance or protected slip status', () => {
  const now = Date.now(), booking = { holdExpiresAt: new Date(now + 300000).toISOString() };
  const view = (row: typeof booking & { receipt?: { status: string }; paidAt?: string }) => renderToStaticMarkup(createElement(BookingHoldNotice, { booking: row, now }));
  assert.match(view(booking), /role="timer"[^>]*>5:00/);
  const expired = view({ holdExpiresAt: new Date(now).toISOString() });
  assert.match(expired, /คืนที่นั่งให้ก๊วนแล้ว/); assert.match(expired, /อย่าโอนซ้ำ/); assert.doesNotMatch(expired, /role="timer"/);
  assert.match(view({ ...booking, receipt: { status: 'pending' } }), /เก็บที่นั่งไว้รอตรวจสลิปแล้ว/);
  assert.equal(view({ ...booking, paidAt: 'paid' }), '');
});
