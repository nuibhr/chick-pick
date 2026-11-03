import type { Coach, CoachSlot, Enrollment } from '../src/coachingTypes';
import { lessonHoldExpired } from '../src/coachingTypes';
import type { ReceiptSubmission } from '../src/marketplaceTypes';
import type { FinanceDocuments } from './financeDomain';
import { fail, type Actor } from './pilotDomain';
import { recordVerifiedTransfer } from './receiptVerification';
import { stripeLocksPayment, stripePublicView } from '../src/paymentTypes';
import { publicTransferAccount } from '../src/paymentChannels';
import { catalogManagement, venueOpen } from './catalogManagement';
import { assertRefundReferenceAvailable } from './refunds';
import { publicRefund } from '../src/refundTypes';
import { publicLatePayment } from '../src/latePayment';

const active = (e: Enrollment) => !e.cancelledAt && !lessonHoldExpired(e) && e.lessons.some(l => l.status !== 'cancelled');
const reserved = (docs: FinanceDocuments, slot: CoachSlot) => docs.coaching.some(e => e.coachId === slot.coachId && active(e) && e.lessons.some(l => l.status !== 'cancelled' && Date.parse(l.start) < Date.parse(slot.start) + slot.hours * 3600000 && Date.parse(l.start) + l.hours * 3600000 > Date.parse(slot.start)));
const closed = (docs: FinanceDocuments, id: string) => docs['revenue-settlements'].some(s => s.key === 'coaching:' + id);
const text = (v: unknown, max: number, required = true) => {
  if (typeof v !== 'string' || v.length > max || required && !v.trim()) fail(400, 'ข้อมูลโค้ชไม่ครบหรือยาวเกินกำหนด');
  return (v as string).trim();
};
const profiles = (docs: FinanceDocuments) => docs['coach-profiles'] ||= [];
const slots = (docs: FinanceDocuments) => docs['coach-slots'] ||= [];

export function coachCatalog(docs: FinanceDocuments, bookingEnabled: boolean) {
  const coaches = profiles(docs).filter(c => c.active !== false && venueOpen(docs, c.venue));
  return { coaches: coaches.map(({ bookingFee, ...c }) => ({ ...c, bookingReady: bookingFee !== undefined })), slots: slots(docs).filter(s => coaches.some(c => c.id === s.coachId) && Date.parse(s.start) > Date.now()).map(s => { const fee = coaches.find(c => c.id === s.coachId)?.bookingFee; return { ...s, bookingReady: fee !== undefined && Math.round(fee * 100) <= Math.round(s.price * 100), status: reserved(docs, s) ? 'booked' as const : s.status }; }), bookingEnabled, demo: false };
}
export function coachAdmin(docs: FinanceDocuments) {
  return { coaches: profiles(docs).map(c => ({ ...c, management: catalogManagement(docs, 'coach', c.id) })), slots: slots(docs).map(s => ({ ...s, management: catalogManagement(docs, 'slot', s.id), status: reserved(docs, s) ? 'booked' as const : s.status })), enrollments: docs.coaching.map(e => ({...e, holdExpired: lessonHoldExpired(e)})), demo: false };
}
export function saveCoach(docs: FinanceDocuments, v: Record<string, unknown>, id?: string, canConfigure = true) {
  if (typeof v.hourlyRate !== 'number' || !Number.isFinite(v.hourlyRate) || v.hourlyRate <= 0 || v.hourlyRate > 100000 || Math.abs(v.hourlyRate * 100 - Math.round(v.hourlyRate * 100)) > 0.00001 || typeof v.active !== 'boolean') fail(400, 'ระบุราคาเป็นบาทไม่เกิน 2 ทศนิยมและสถานะโค้ช');
  const rows = profiles(docs), existing = id ? rows.find(c => c.id === id) : null;
  if (v.bookingFee !== undefined && !canConfigure) fail(403, 'เฉพาะเจ้าของตั้งค่าหัวคิวได้');
  if (v.bookingFee !== undefined && (typeof v.bookingFee !== 'number' || !Number.isFinite(v.bookingFee) || v.bookingFee < 0 || v.bookingFee > 100000 || Math.abs(v.bookingFee * 100 - Math.round(v.bookingFee * 100)) > 0.00001)) fail(400, 'ค่าหัวคิวเป็นบาทต่อการจอง ไม่เกิน 2 ทศนิยม');
  if (id && !existing) fail(404, 'ไม่พบโค้ช');
  if (!existing && rows.length >= 100) fail(409, 'รองรับโค้ชสูงสุด 100 คน');
  const name = text(v.name, 80), coach: Coach = { id: existing?.id || crypto.randomUUID(), name, initials: [...name].slice(0, 2).join(''), specialty: text(v.specialty, 120), bio: text(v.bio ?? '', 500, false), venue: text(v.venue, 120), hourlyRate: v.hourlyRate as number, active: v.active as boolean, courses: existing?.courses || [] };
  if (!venueOpen(docs, coach.venue) && (!existing || existing.venue !== coach.venue || coach.active)) fail(400, 'เลือกสนามที่เปิดแสดงจากทะเบียนสนามก่อน');
  coach.bookingFee = v.bookingFee === undefined ? existing?.bookingFee : v.bookingFee as number;
  if (existing) Object.assign(existing, coach); else rows.push(coach);
  return coach;
}
export function createCoachSlot(docs: FinanceDocuments, v: Record<string, unknown>) {
  const coach = profiles(docs).find(c => c.id === v.coachId && c.active !== false), start = typeof v.start === 'string' ? Date.parse(v.start) : NaN;
  const hours = v.hours;
  if (coach && !venueOpen(docs, coach.venue)) fail(409, 'สนามของโค้ชหยุดรับจองแล้ว');
  if (!coach || !Number.isFinite(start) || start < Date.now() + 1800000 || start > Date.now() + 180 * 86400000 || start % 1800000 !== 0 || typeof hours !== 'number' || hours < 0.5 || hours > 4 || hours % 0.5 !== 0 || !['open', 'blocked'].includes(String(v.status))) fail(400, 'เลือกโค้ช วันเวลาใน 180 วัน ทุก 30 นาที และระยะเวลา 0.5–4 ชั่วโมง');
  const rows = slots(docs);
  if (rows.filter(s => Date.parse(s.start) > Date.now()).length >= 2000) fail(409, 'ช่วงเวลาล่วงหน้ามากเกินกำหนด');
  if (rows.some(s => s.coachId === coach.id && start < Date.parse(s.start) + s.hours * 3600000 && start + Number(hours) * 3600000 > Date.parse(s.start))) fail(409, 'ช่วงเวลาทับตารางโค้ช');
  const slot: CoachSlot = { id: crypto.randomUUID(), coachId: coach.id, start: new Date(start).toISOString(), hours: Number(hours), price: Math.round(coach.hourlyRate * 100 * Number(hours)) / 100, status: v.status as 'open' | 'blocked' };
  rows.push(slot); return slot;
}
export function changeCoachSlot(docs: FinanceDocuments, id: string, v: Record<string, unknown>) {
  const slot = slots(docs).find(s => s.id === id);
  if (!slot) fail(404, 'ไม่พบช่วงเวลา');
  if (v.action === 'edit') {
    const policy = catalogManagement(docs, 'slot', id);
    if (!policy.canEdit) fail(409, policy.editReason);
    const copy = { ...docs, 'coach-slots': slots(docs).filter(s => s.id !== id) };
    const replacement = createCoachSlot(copy, { ...v, coachId: slot.coachId });
    Object.assign(slot, replacement, { id }); return slot;
  }
  if (Date.parse(slot.start) <= Date.now() || reserved(docs, slot)) fail(409, 'ช่วงเวลาผ่านแล้วหรือมีผู้จอง ต้องจัดการการจองก่อน');
  if (!['open', 'blocked'].includes(String(v.status))) fail(400, 'เลือกเปิดรับหรือหยุดสอน');
  slot.status = v.status as 'open' | 'blocked'; return slot;
}
export function bookLesson(docs: FinanceDocuments, actor: Actor, slotId: unknown, enabled: boolean, account: Enrollment['transferAccount'], stripeReady = false) {
  if (!enabled || !account && !stripeReady) fail(503, 'ยังไม่เปิดรับจองหรือตั้งช่องทางชำระเงิน');
  const slot = slots(docs).find(s => s.id === slotId), coach = profiles(docs).find(c => c.id === slot?.coachId && c.active !== false);
  if (!slot || !coach) fail(404, 'ไม่พบช่วงเวลาของโค้ช');
  if (!venueOpen(docs, coach.venue)) fail(409, 'สนามของโค้ชหยุดรับจองแล้ว');
  const existing = docs.coaching.find(e => e.playerId === 'line:' + actor.sub && active(e) && e.lessons.some(l => l.slotId === slot.id));
  if (existing) return { id: existing.id, repeated: true };
  if (docs.coaching.some(e => e.playerId === 'line:' + actor.sub && e.latePayment?.status === 'review_required' && e.lessons.some(l => l.slotId === slot.id))) fail(409, 'มีสลิปย้อนหลังของเวลานี้รอตรวจ กรุณาอย่าจองใหม่หรือโอนซ้ำ');
  if (coach.bookingFee === undefined || Math.round(coach.bookingFee * 100) > Math.round(slot.price * 100)) fail(409, 'เจ้าของต้องตั้งค่าหัวคิวที่ไม่เกินค่าเรียนก่อนเปิดจอง');
  if (slot.status !== 'open' || Date.parse(slot.start) < Date.now() + 1800000 || reserved(docs, slot)) fail(409, 'ช่วงเวลานี้ปิดรับหรือมีผู้จองแล้ว');
  if (stripeReady && (Date.parse(slot.start) < Date.now() + 35 * 60000 || slot.price < 10 || slot.price > 100000)) fail(409, 'PromptPay ต้องจองก่อนเริ่มอย่างน้อย 35 นาที และยอด 10–100,000 บาท');
  if (docs.coaching.filter(e => e.playerId === 'line:' + actor.sub && active(e) && e.payment !== 'paid').length >= 3) fail(409, 'มีนัดรอชำระครบ 3 นัดแล้ว ส่งสลิปหรือยกเลิกนัดเดิมก่อน');
  if (docs.coaching.some(e => e.playerId === 'line:' + actor.sub && active(e) && e.lessons.some(l => l.status === 'scheduled' && Date.parse(l.start) < Date.parse(slot.start) + slot.hours * 3600000 && Date.parse(l.start) + l.hours * 3600000 > Date.parse(slot.start)))) fail(409, 'ทับกับเวลาเรียนที่คุณจองไว้');
  const id = crypto.randomUUID();
  docs.coaching.push({ id, coachId: coach.id, student: actor.name, phone: '', playerId: 'line:' + actor.sub, title: 'เรียนกับ ' + coach.name, venue: coach.venue, totalHours: slot.hours, amount: slot.price, bookingFee: coach.bookingFee, payment: 'pending', createdAt: new Date().toISOString(), holdExpiresAt: new Date(Date.now() + 1800000).toISOString(), transferAccount: structuredClone(account), lessons: [{ id: crypto.randomUUID(), slotId: slot.id, start: slot.start, hours: slot.hours, status: 'scheduled' }] });
  return { id, repeated: false };
}
export function ownLesson(docs: FinanceDocuments, actor: Actor, id: string) {
  const e = docs.coaching.find(e => e.id === id && e.playerId === 'line:' + actor.sub);
  if (!e) fail(404, 'ไม่พบการเรียนของคุณ'); return e;
}
export function lessonReceiptEligibility(docs: FinanceDocuments, actor: Actor, id: string) {
  const e = ownLesson(docs, actor, id);
  if (e.cancelledAt || e.payment === 'paid' || stripeLocksPayment(e.stripe) || e.receipts?.at(-1)?.status === 'pending') fail(409, 'รายการนี้ปิดรับสลิป มี QR Stripe หรือมีสลิปรอตรวจ');
  if (!e.transferAccount) fail(409, 'ไม่มีบัญชีรับโอน ติดต่อผู้จัด');
  if ((e.receipts || []).filter(r => Date.parse(r.submittedAt) > Date.now() - 86400000).length >= 10) fail(429, 'ส่งสลิปหลายครั้งเกินไป');
  return e;
}
export function submitLessonReceipt(docs: FinanceDocuments, actor: Actor, id: string, receipt: ReceiptSubmission) {
  const e = lessonReceiptEligibility(docs, actor, id);
  if ([...docs.coaching.filter(other => other.id !== id), ...docs.marketplace.bookings].some(other => other.receipts?.some(r => r.sha256 === receipt.sha256 && r.status !== 'rejected'))) fail(409, 'ภาพสลิปนี้ใช้กับรายการอื่นแล้ว');
  if (lessonHoldExpired(e) || closed(docs, id)) e.latePayment = { status: 'review_required', receiptId: receipt.id, submittedAt: receipt.submittedAt };
  e.receipts = [...(e.receipts || []), receipt];
}
export function reviewLessonReceipt(docs: FinanceDocuments, id: string, receiptId: string, v: Record<string, unknown>) {
  const e = docs.coaching.find(e => e.id === id), r = e?.receipts?.at(-1);
  if (!e || !r || r.id !== receiptId) fail(404, 'ไม่พบสลิป');
  if (e.cancelledAt || e.payment === 'paid' || r.status !== 'pending' || !e.latePayment && (closed(docs, id) || !active(e))) fail(409, 'สลิปนี้ไม่อยู่ระหว่างรอตรวจ');
  if (v.action === 'approve') {
    if (e.latePayment?.status === 'review_required') fail(409, 'สลิปย้อนหลังต้องตรวจเวลาว่างและรับกลับ หรือส่งเข้าคิวคืนเงิน');
    if (v.fundsChecked !== true) fail(400, 'ต้องตรวจยอดเงินเข้าบัญชีจริงก่อนอนุมัติ');
    recordVerifiedTransfer(r, Math.round(e.amount * 100), v, [...docs.marketplace.bookings, ...docs.coaching].flatMap(item => item.receipts || []));
    assertRefundReferenceAvailable(docs, r.verifiedTransferReference);
    r.status = 'approved'; e.paidAt = new Date().toISOString(); e.payment = 'paid'; e.paymentMethod = 'transfer';
  } else if (v.action === 'reject') { r.rejectReason = text(v.reason, 200); if (r.rejectReason.length < 3) fail(400, 'ระบุเหตุผลอย่างน้อย 3 ตัวอักษร'); r.status = 'rejected'; if (!e.latePayment) e.holdExpiresAt = new Date(Date.now() + 1800000).toISOString(); }
  else fail(400, 'เลือกอนุมัติหรือปฏิเสธ');
  r.reviewedAt = new Date().toISOString(); return { status: r.status };
}
export function cancelLesson(docs: FinanceDocuments, actor: Actor, id: string, admin = false) {
  const e = admin ? docs.coaching.find(e => e.id === id) : ownLesson(docs, actor, id);
  if (!e) fail(404, 'ไม่พบการจอง');
  if (e.cancelledAt) return { repeated: true };
  if (closed(docs, id) || e.payment === 'paid' || stripeLocksPayment(e.stripe) || e.receipts?.at(-1)?.status === 'pending') fail(409, 'มีเงิน สลิปรอตรวจ หรือ QR Stripe ที่ยังไม่ปิด ติดต่อผู้จัดก่อนยกเลิก');
  if (e.lessons.some(l => l.status !== 'scheduled' || Date.parse(l.start) <= Date.now())) fail(409, 'เริ่มเรียนแล้ว ยกเลิกไม่ได้');
  e.cancelledAt = new Date().toISOString(); e.lessons.forEach(l => l.status = 'cancelled'); return { repeated: false };
}
export function completeLesson(docs: FinanceDocuments, id: string) {
  const e = docs.coaching.find(e => e.id === id);
  if (!e || !active(e)) fail(404, 'ไม่พบการเรียน');
  if (e.payment !== 'paid' || e.lessons.some(l => Date.parse(l.start) + l.hours * 3600000 > Date.now())) fail(409, 'ตรวจเงินและรอให้พ้นเวลาเรียนก่อนปิดนัด');
  if (closed(docs, id)) fail(409, 'ปิดยอดแล้ว');
  e.lessons.forEach(l => { if (l.status === 'scheduled') l.status = 'completed'; }); return { success: true };
}

export function lessonView(e: Enrollment) {
  const receipt = e.receipts?.at(-1);
  return { kind: 'coaching' as const, id: e.id, sessionId: e.lessons[0]?.slotId || '', title: e.title, startsAt: e.lessons[0]?.start, venue: e.venue || '', hours: e.totalHours, amount: Math.round(e.amount * 100), createdAt: e.createdAt, holdExpiresAt: e.holdExpiresAt || null, paidAt: e.paidAt || null, admissionStatus: e.payment === 'paid' ? 'approved' : 'pending', cancelledAt: e.cancelledAt || null, holdExpired: lessonHoldExpired(e), latePayment: publicLatePayment(e.latePayment), refund: publicRefund(e.refund), transferAccount: publicTransferAccount(e.transferAccount), completed: e.lessons.every(l => l.status === 'completed'), stripe: stripePublicView(e.stripe), receipt: receipt ? { id: receipt.id, status: receipt.status, ocr: receipt.ocr, verification: receipt.verification, rejectReason: receipt.rejectReason || null } : null };
}
