import type { StripePayment } from './paymentTypes';

export const OPEN_PLAY_HOLD_MS = 5 * 60 * 1000;
export const expiredHoldMessage = 'หมดเวลาถือที่นั่งแล้ว กรุณาจองใหม่หากยังมีที่ว่าง หากโอนแล้วให้ติดต่อผู้จัดพร้อมสลิป และอย่าโอนซ้ำ';

type Hold = {
  holdExpiresAt?: string | null; holdExpired?: boolean;
  cancelledAt?: string | null; paidAt?: string | null; payment?: string; admissionStatus?: string;
  receipts?: { status: string }[]; receipt?: { status: string } | null;
  stripe?: Pick<StripePayment, 'status'> | null;
};

// Uploaded evidence keeps the seat until an administrator resolves it. Old
// bookings without a deadline and historical Stripe payments keep their seats.
export function paymentHoldExpired(row: Hold, now = Date.now()): boolean {
  if (row.cancelledAt || row.paidAt || row.payment === 'paid' || row.admissionStatus === 'approved'
    || (row.receipts?.at(-1) || row.receipt)?.status === 'pending'
    || row.stripe && !['expired', 'test_paid'].includes(row.stripe.status)) return false;
  return row.holdExpired === true || Boolean(row.holdExpiresAt && Date.parse(row.holdExpiresAt) <= now);
}

export function holdTimeLeft(deadline: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
