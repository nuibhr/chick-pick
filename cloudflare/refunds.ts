import type { FinanceDocuments } from './financeDomain';
import { fail, type Actor } from './pilotDomain';
import { stripeLocksPayment } from '../src/paymentTypes';

const reference = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 120 || !/^[A-Za-z0-9\s-]+$/.test(value)) return fail(400, 'ระบุเลขอ้างอิงธนาคาร 6–80 ตัวอักษรหรือตัวเลข');
  const normalized = value.replace(/[\s-]/g, '').toUpperCase();
  if (normalized.length < 6 || normalized.length > 80) fail(400, 'เลขอ้างอิงต้องมี 6–80 ตัวอักษรหรือตัวเลข');
  return normalized;
};
const reason = (value: unknown) => {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > 200) return fail(400, 'ระบุเหตุผล 3–200 ตัวอักษร');
  return value.trim();
};
export function assertRefundReferenceAvailable(docs: FinanceDocuments, value: unknown) {
  const normalized = reference(value);
  if ([...docs.marketplace.bookings, ...docs.coaching].some(row => row.refund?.transferReference === normalized)) fail(409, 'รายการโอนนี้ถูกกันไว้เพื่อคืนเงินแล้ว ใช้ชำระการจองอื่นไม่ได้');
}
export function manageRefund(docs: FinanceDocuments, kind: 'game' | 'coaching', id: string, v: Record<string, unknown>, actor: Actor) {
  const row = kind === 'game' ? docs.marketplace.bookings.find(b => b.id === id) : docs.coaching.find(e => e.id === id);
  if (!row) return fail(404, 'ไม่พบการจอง');
  const unit = kind === 'game' && 'sessionId' in row ? 'game:' + row.sessionId : 'coaching:' + id;
  const postSettlement = docs['revenue-settlements'].some(s => s.key === unit);
  // A late, previously unrecognised transfer is a separate money-in/money-out adjustment.
  // Never rewrite the already closed sale or previously approved payment.
  if (postSettlement && (!row.latePayment || row.paidAt)) fail(409, 'ปิดยอดแล้ว ติดต่อเจ้าของเพื่อกระทบยอดก่อนยกเลิกหรือคืนเงิน');
  const now = new Date().toISOString(), all = [...docs.marketplace.bookings, ...docs.coaching];
  if (v.action === 'cancel') {
    if (row.refund) return { repeated: true, refund: row.refund };
    if (v.confirmCancellation !== true) fail(400, 'ยืนยันการยกเลิกและคืนที่ว่างก่อน');
    const cancellationReason = reason(v.reason);
    // Legacy Stripe payments need reconciliation with Stripe, not a second manual refund.
    if (stripeLocksPayment(row.stripe) || row.stripe?.status === 'paid') fail(409, 'รายการ Stripe ต้องตรวจสถานะและคืนเงินผ่านระบบเดิมก่อน');
    const paid = Boolean(row.paidAt || 'payment' in row && row.payment === 'paid');
    row.refund = { status: paid ? 'pending' : 'review_required', reason: cancellationReason, requestedAt: now, requestedBy: actor.sub, ...(postSettlement ? { postSettlement: true } : {}),
      ...(paid ? { receivedAmount: kind === 'game' ? row.amount : Math.round(row.amount * 100), receivedAt: row.paidAt || now, receivedBy: actor.sub, transferReference: row.receipts?.find(r => r.status === 'approved')?.verifiedTransferReference } : {}) };
    row.cancelledAt ||= now;
    if ('sessionId' in row) { row.admissionStatus = 'pending'; row.cancelledBy = 'organizer'; }
    if ('lessons' in row) row.lessons.forEach(l => { if (l.status === 'scheduled') l.status = 'cancelled'; });
    return { repeated: false, refund: row.refund };
  }
  const refund = row.refund;
  if (!row.cancelledAt || !refund) fail(409, 'ยกเลิกการจองพร้อมบันทึกเหตุผลก่อน');
  if (v.action === 'reopen_review') {
    if (refund.status !== 'not_required' || refund.receivedAt || refund.completedAt) fail(409, 'เปิดตรวจใหม่ได้เฉพาะรายการที่ปิดว่าไม่มีเงินเข้า');
    refund.resolutionReason = reason(v.reason); refund.status = 'review_required'; refund.reviewReopenedAt = now;
  } else if (v.action === 'confirm_received') {
    if (refund.status !== 'review_required' || v.fundsChecked !== true) fail(409, 'ต้องอยู่ระหว่างตรวจและยืนยันเงินเข้าธนาคารจริง');
    const receipt = row.receipts?.find(r => r.id === v.receiptId), check = receipt?.verification;
    if (row.receipts?.length && !receipt) fail(400, 'เลือกสลิปต้นทางที่ตรวจเงินเข้าจริง');
    const verified = check?.status === 'verified';
    const amount = verified ? check.amountSatang : v.receivedAmount;
    if (!Number.isSafeInteger(amount) || Number(amount) <= 0 || Number(amount) > 10000000000) fail(400, 'ระบุยอดเงินจริงเป็นสตางค์');
    const ref = reference(verified ? check.reference : v.transferReference);
    if (verified && (v.receivedAmount !== undefined && v.receivedAmount !== amount || v.transferReference !== undefined && reference(v.transferReference) !== ref)) fail(409, 'ยอดและเลขอ้างอิงต้องตรงกับผลสลิปที่ตรวจผ่าน');
    if (all.some(other => other !== row && (other.refund?.transferReference === ref || other.receipts?.some(r => r.verifiedTransferReference === ref || r.verification?.status === 'verified' && reference(r.verification.reference) === ref || (other.paidAt || other.refund?.receivedAt) && receipt?.sha256 && r.sha256 === receipt.sha256)))) fail(409, 'เงินหรือภาพสลิปนี้ถูกใช้รับเงินหรือคืนเงินกับรายการอื่นแล้ว');
    Object.assign(refund, { status: 'pending', receivedAmount: amount, transferReference: ref, ...(receipt ? { receiptId: receipt.id } : {}), receivedAt: now, receivedBy: actor.sub });
  } else if (v.action === 'no_funds') {
    if (refund.status !== 'review_required' || v.fundsChecked !== true) fail(409, 'ต้องตรวจธนาคารก่อน และไม่มีเงินที่ยืนยันรับไว้แล้ว');
    if (row.paidAt || row.receipts?.some(r => r.verifiedTransferReference || r.status === 'approved' || r.verification?.status === 'verified')) fail(409, 'มีผลตรวจยืนยันรายการโอนแล้ว ต้องตรวจเรื่องคืนเงิน ไม่ปิดเป็นไม่มีเงินเข้า');
    refund.resolutionReason = reason(v.reason); refund.status = 'not_required';
    refund.receivedBy = actor.sub;
  } else if (v.action === 'complete') {
    const ref = reference(v.refundReference);
    if (refund.status === 'completed') { if (refund.refundReference !== ref) fail(409, 'คืนเงินรายการนี้แล้ว เลขอ้างอิงต่างจากที่บันทึก'); return { repeated: true, refund }; }
    if (refund.status !== 'pending' || !refund.receivedAmount || !refund.receivedAt || v.refundTransferred !== true) fail(409, 'ยืนยันเงินเข้าและโอนคืนจริงก่อนบันทึกว่าคืนเงินแล้ว');
    if (ref === refund.transferReference || all.some(other => other !== row && other.refund?.refundReference === ref)) fail(409, 'เลขโอนคืนซ้ำหรือเป็นเลขรับเงินเดิม');
    Object.assign(refund, { status: 'completed', refundReference: ref, completedAt: now, completedBy: actor.sub });
  } else fail(400, 'คำสั่งคืนเงินไม่ถูกต้อง');
  return { repeated: false, refund };
}
