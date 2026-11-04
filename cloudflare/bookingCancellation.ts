import type { FinanceDocuments } from './financeDomain';
import { fail, type Actor } from './pilotDomain';
import { manageRefund } from './refunds';

// One cancellation commits the reservation and its money disposition together.
export function cancelReservation(docs: FinanceDocuments, kind: 'game' | 'coaching', id: string, value: Record<string, unknown>, actor: Actor, finance: boolean) {
  const row = kind === 'game' ? docs.marketplace.bookings.find(b => b.id === id) : docs.coaching.find(e => e.id === id);
  if (!row) return fail(404, 'ไม่พบการจอง');
  if (row.cancelledAt && row.refund) return { repeated: true, cancelledAt: row.cancelledAt, refundStatus: row.refund.status };
  const paid = Boolean(row.paidAt || 'payment' in row && row.payment === 'paid');
  const receipt = row.receipts?.at(-1), disposition = value.disposition || 'unknown';
  if (!['unknown', 'no_payment', 'received'].includes(String(disposition))) fail(400, 'เลือกสถานะเงินให้ถูกต้อง');
  if (value.confirmCancellation !== true) fail(400, 'ยืนยันการยกเลิกการจองก่อน');
  if (value.expectedReceiptId !== (receipt?.id || null) || value.expectedPaidAt !== (row.paidAt || null)) fail(409, 'มีสลิปหรือผลตรวจเงินใหม่ กรุณาโหลดรายการและตรวจอีกครั้ง');
  if (!finance && (paid || disposition !== 'unknown')) fail(403, 'ฝ่ายการเงินหรือเจ้าของเป็นผู้ยืนยันผลเงิน รายการนี้ยังยกเลิกพร้อมส่งตรวจเงินได้เมื่อยังไม่รับชำระ');
  if (disposition === 'no_payment' && (paid || row.receipts?.some(r => r.verifiedTransferReference || r.status === 'approved' || r.verification?.status === 'verified'))) fail(409, 'มีหลักฐานว่ารับเงินหรือตรวจพบรายการโอนแล้ว ต้องตรวจเรื่องคืนเงิน ไม่ปิดเป็นไม่มีเงินเข้า');
  const customReason = typeof value.reason === 'string' ? value.reason.trim() : '';
  const reason = customReason ? customReason.length < 3 ? 'ผู้จัดยกเลิก: ' + customReason : customReason : 'ผู้จัดยกเลิกการจอง';
  manageRefund(docs, kind, id, { action: 'cancel', reason, confirmCancellation: true }, actor);
  if (!paid && disposition === 'no_payment') manageRefund(docs, kind, id, { action: 'no_funds', fundsChecked: value.fundsChecked, reason: 'ผู้จัดตรวจรายการธนาคารแล้ว ไม่พบเงินเข้าที่ต้องคืน' }, actor);
  if (!paid && disposition === 'received') {
    const check = receipt?.verification;
    manageRefund(docs, kind, id, { action: 'confirm_received', fundsChecked: value.fundsChecked, receiptId: receipt?.id, receivedAmount: check?.status === 'verified' ? check.amountSatang : value.receivedAmount, transferReference: check?.status === 'verified' ? check.reference : value.transferReference }, actor);
  }
  return { repeated: false, cancelledAt: row.cancelledAt, refundStatus: row.refund!.status };
}
