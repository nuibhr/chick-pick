import type { FinanceDocuments } from './financeDomain';
import { activeBooking } from '../src/marketplaceTypes';
import { lessonHoldExpired } from '../src/coachingTypes';
import { fail, type Actor } from './pilotDomain';
import { recordVerifiedTransfer } from './receiptVerification';
import { assertRefundReferenceAvailable, manageRefund } from './refunds';
import { venueOpen } from './catalogManagement';

// Called only under the same TiDB transaction/marketplace lock used by new reservations.
export function resolveLatePayment(docs: FinanceDocuments, kind: 'game' | 'coaching', id: string, v: Record<string, unknown>, actor: Actor) {
  const row = kind === 'game' ? docs.marketplace.bookings.find(b => b.id === id) : docs.coaching.find(e => e.id === id);
  const late = row?.latePayment, receipt = row?.receipts?.at(-1);
  if (!row || !late || !receipt || receipt.id !== v.receiptId || late.receiptId !== receipt.id) return fail(404, 'ไม่พบสลิปย้อนหลังที่ต้องตรวจ');
  if (!['accept', 'refund'].includes(String(v.action))) fail(400, 'เลือกตรวจที่ว่างและรับกลับ หรือส่งเข้าคิวคืนเงิน');
  const finalStatus = v.action === 'accept' ? 'accepted' : 'refund_required';
  if (late.status === finalStatus) return { repeated: true, status: late.status };
  if (late.status !== 'review_required' || row.cancelledAt || row.paidAt || receipt.status !== 'pending') fail(409, 'รายการนี้ถูกจัดการแล้ว กรุณาโหลดใหม่');
  if (v.fundsChecked !== true) fail(400, 'ตรวจภาพสลิปและเงินเข้าบัญชีจริงก่อน');
  const unit = 'sessionId' in row ? 'game:' + row.sessionId : 'coaching:' + id;
  if (v.action === 'accept') {
    if (docs['revenue-settlements'].some(s => s.key === unit)) fail(409, 'ปิดยอดแล้ว รับกลับไม่ได้ ให้ตรวจเงินเพื่อคืนเงิน');
    if ('sessionId' in row) {
      const game = docs.marketplace.sessions.find(s => s.id === row.sessionId);
      if (!game || !Number.isInteger(game.capacity) || game.capacity < 1 || game.status === 'completed' || game.bookingPaused || !Number.isFinite(Date.parse(game.startsAt)) || Date.parse(game.startsAt) <= Date.now() || !venueOpen(docs, game.venue)) fail(409, 'ก๊วนหรือสนามปิดรับหรือเริ่มแล้ว ให้ตรวจเพื่อคืนเงิน');
      const active = docs.marketplace.bookings.filter(b => b.id !== id && b.sessionId === row.sessionId && activeBooking(b));
      if (active.length >= game.capacity) fail(409, 'ก๊วนเต็มแล้ว สลิปย้อนหลังไม่แย่งที่นั่ง กรุณาส่งเข้าคิวคืนเงิน');
      if (active.some(b => b.playerId === row.playerId)) fail(409, 'ผู้เล่นมีการจองใหม่ในก๊วนเดียวกันแล้ว จัดการรายการซ้ำก่อน');
    } else {
      if (!row.lessons.length || !docs['coach-profiles']?.some(c => c.id === row.coachId && c.active !== false) || !venueOpen(docs, row.venue || '')) fail(409, 'โค้ชหรือสนามปิดรับแล้ว ให้ตรวจเพื่อคืนเงิน');
      for (const lesson of row.lessons) {
        const slot = docs['coach-slots']?.find(s => s.id === lesson.slotId && s.coachId === row.coachId);
        if (lesson.status !== 'scheduled' || !slot || slot.status !== 'open' || Date.parse(lesson.start) <= Date.now() || slot.start !== lesson.start || slot.hours !== lesson.hours) fail(409, 'เวลาเรียนเปลี่ยนหรือปิดรับแล้ว ให้ตรวจเพื่อคืนเงิน');
        const start = Date.parse(lesson.start), end = start + lesson.hours * 3600000;
        if (docs.coaching.some(e => e.id !== id && !e.cancelledAt && !lessonHoldExpired(e) && (e.coachId === row.coachId || e.playerId === row.playerId) && e.lessons.some(l => l.status !== 'cancelled' && Date.parse(l.start) < end && Date.parse(l.start) + l.hours * 3600000 > start))) fail(409, 'เวลาโค้ชหรือผู้เรียนมีการจองใหม่แล้ว สลิปย้อนหลังไม่แทรกคิว');
      }
    }
  }
  // No special bypass for a failed SlipOK result. Verify against the original booking time/account.
  recordVerifiedTransfer(receipt, 'sessionId' in row ? row.amount : Math.round(row.amount * 100), v, [...docs.marketplace.bookings, ...docs.coaching].flatMap(r => r.receipts || []));
  assertRefundReferenceAvailable(docs, receipt.verifiedTransferReference);
  const now = new Date().toISOString();
  if (v.action === 'refund') {
    manageRefund(docs, kind, id, { action: 'cancel', reason: 'ส่งสลิปหลังหมดเวลาถือที่นั่ง ผู้จัดตรวจเงินและส่งเข้าคิวคืนเงิน', confirmCancellation: true }, actor);
    manageRefund(docs, kind, id, { action: 'confirm_received', fundsChecked: true, receivedAmount: receipt.verifiedAmount, transferReference: receipt.verifiedTransferReference, receiptId: receipt.id }, actor);
  } else {
    row.paidAt = now; row.paymentMethod = 'transfer';
    if ('sessionId' in row) row.admissionStatus = 'pending';
    else row.payment = 'paid';
  }
  receipt.status = 'approved'; receipt.reviewedAt = now;
  Object.assign(late, { status: finalStatus, resolvedAt: now, resolvedBy: actor.sub });
  return { repeated: false, status: finalStatus };
}
