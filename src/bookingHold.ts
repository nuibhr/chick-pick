import type { StripePayment } from './paymentTypes';
import { receiptProtectsHold, type ReceiptHoldEvidence } from './receiptHoldPolicy';

export const OPEN_PLAY_HOLD_MS = 5 * 60 * 1000;
export const LATE_RECEIPT_EVIDENCE_MS = 24 * 60 * 60 * 1000;
export const expiredHoldMessage = 'หมดเวลาถือที่นั่งแล้ว หากโอนเงินไปแล้วให้แนบสลิปเดิมภายใน 24 ชั่วโมงเพื่อให้ผู้จัดตรวจสอบ (ไม่คืนสิทธิ์ที่นั่งอัตโนมัติ) อย่าโอนซ้ำ';

type Hold = {
  holdExpiresAt?: string | null; holdExpired?: boolean;
  cancelledAt?: string | null; paidAt?: string | null; payment?: string; admissionStatus?: string;
  receipts?: ReceiptHoldEvidence[]; receipt?: ReceiptHoldEvidence | null;
  stripe?: Pick<StripePayment, 'status'> | null;
};

// Evidence whose money status is unresolved retains its existing protection.
// Definitively invalid/non-payment images do not extend the original deadline.
// Neither this function nor expiry deletes evidence or decides that no money exists.
export function paymentHoldExpired(row: Hold, now = Date.now()): boolean {
  const receipt = row.receipts?.at(-1) || row.receipt;
  if (row.cancelledAt || row.paidAt || row.payment === 'paid' || row.admissionStatus === 'approved'
    || receiptProtectsHold(receipt)
    || row.stripe && !['expired', 'test_paid'].includes(row.stripe.status)) return false;
  return row.holdExpired === true || Boolean(row.holdExpiresAt && Date.parse(row.holdExpiresAt) <= now);
}

// Payment evidence can arrive after the seat was released. This never grants a hold.
export function canSubmitLateReceipt(row: Hold, now = Date.now()): boolean {
  const expiresAt = Date.parse(row.holdExpiresAt || '');
  return Number.isFinite(expiresAt) && now >= expiresAt && now <= expiresAt + LATE_RECEIPT_EVIDENCE_MS
    && paymentHoldExpired(row, now) && !row.cancelledAt && !row.paidAt
    && (row.receipts?.at(-1) || row.receipt)?.status !== 'pending';
}

export function holdTimeLeft(deadline: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
