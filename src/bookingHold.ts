import type { StripePayment } from './paymentTypes';

export const OPEN_PLAY_HOLD_MS = 5 * 60 * 1000;
export const LATE_RECEIPT_EVIDENCE_MS = 24 * 60 * 60 * 1000;
export const expiredHoldMessage = 'หมดเวลาถือที่นั่งแล้ว หากโอนเงินไปแล้วให้แนบสลิปเดิมภายใน 24 ชั่วโมงเพื่อให้ผู้จัดตรวจสอบ (ไม่คืนสิทธิ์ที่นั่งอัตโนมัติ) อย่าโอนซ้ำ';

type Hold = {
  holdExpiresAt?: string | null; holdExpired?: boolean;
  cancelledAt?: string | null; paidAt?: string | null; payment?: string; admissionStatus?: string;
  receipts?: { status: string; submittedAfterHold?: boolean }[]; receipt?: { status: string; submittedAfterHold?: boolean } | null;
  stripe?: Pick<StripePayment, 'status'> | null;
};

// Uploaded evidence keeps the seat until an administrator resolves it. Old
// bookings without a deadline and historical Stripe payments keep their seats.
export function paymentHoldExpired(row: Hold, now = Date.now()): boolean {
  const receipt = row.receipts?.at(-1) || row.receipt;
  if (row.cancelledAt || row.paidAt || row.payment === 'paid' || row.admissionStatus === 'approved'
    || (receipt?.status === 'pending' && !receipt.submittedAfterHold)
    || row.stripe && !['expired', 'test_paid'].includes(row.stripe.status)) return false;
  return row.holdExpired === true || Boolean(row.holdExpiresAt && Date.parse(row.holdExpiresAt) <= now);
}

export function holdTimeLeft(deadline: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
