import type { Booking, MarketplaceData, ReceiptSubmission, Session, TransferAccount } from '../src/marketplaceTypes';
import { activeBooking } from '../src/marketplaceTypes';

export class PilotError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const fail = (status: number, message: string): never => { throw new PilotError(status, message); };
export type PilotContext = { account: TransferAccount | null; enabled: boolean; closed: string[] };
export type Actor = { sub: string; name: string };
export const unavailableOcr = () => ({ status: 'unavailable' as const, amount: null, transferredAt: null, reference: null, sender: null, receiver: null, rawText: null, confidence: null });
const future = (session?: Session) => session && session.status !== 'completed' && Number.isFinite(Date.parse(session.startsAt)) && Date.parse(session.startsAt) > Date.now();

export function book(data: MarketplaceData, context: PilotContext, actor: Actor, sessionId: string) {
  if (!context.enabled || !context.account) fail(503, 'ผู้จัดยังไม่เปิดรับจองหรือตั้งบัญชีรับโอน');
  if (context.closed.includes(`game:${sessionId}`)) fail(409, 'ก๊วนนี้ปิดยอดแล้ว');
  const session = data.sessions.find(s => s.id === sessionId);
  if (!session) fail(404, 'ไม่พบก๊วน');
  const existing = data.bookings.find(b => b.sessionId === sessionId && b.playerId === `line:${actor.sub}` && activeBooking(b));
  if (existing) return { id: existing.id, repeated: true };
  if (!future(session) || data.bookings.filter(b => b.sessionId === sessionId && activeBooking(b)).length >= session.capacity) fail(409, 'ก๊วนนี้ปิดรับหรือเต็มแล้ว');
  if (!Number.isSafeInteger(Math.round(session.price * 100)) || session.price <= 0) fail(409, 'ราคาก๊วนไม่ถูกต้อง ติดต่อผู้จัด');
  const booking: Booking = { id: crypto.randomUUID(), sessionId, playerId: `line:${actor.sub}`, playerName: actor.name, title: session.title, amount: Math.round(session.price * 100), createdAt: new Date().toISOString(), admissionStatus: 'pending', transferAccount: structuredClone(context.account) };
  data.bookings.push(booking);
  return { id: booking.id, repeated: false };
}

export function ownBooking(data: MarketplaceData, actor: Actor, id: string) {
  const booking = data.bookings.find(b => b.id === id && b.playerId === `line:${actor.sub}`);
  if (!booking) fail(404, 'ไม่พบการจองของคุณ');
  return booking;
}
export function cancel(data: MarketplaceData, actor: Actor, id: string, organizer = false) {
  const booking = organizer ? data.bookings.find(b => b.id === id) : ownBooking(data, actor, id);
  if (!booking) fail(404, 'ไม่พบการจอง');
  if (booking.cancelledAt) return { repeated: true };
  if (booking.paidAt || booking.admissionStatus === 'approved' || booking.receipts?.at(-1)?.status === 'pending') fail(409, 'มีการรับเงินหรือสลิปรอตรวจ กรุณาติดต่อผู้จัด');
  if (!future(data.sessions.find(s => s.id === booking.sessionId))) fail(409, 'ก๊วนเริ่มแล้ว กรุณาติดต่อผู้จัด');
  booking.cancelledAt = new Date().toISOString(); booking.cancelledBy = organizer ? 'organizer' : 'player';
  return { repeated: false };
}
export function receiptEligibility(data: MarketplaceData, actor: Actor, id: string) {
  const booking = ownBooking(data, actor, id);
  if (booking.cancelledAt || booking.paidAt || booking.receipts?.at(-1)?.status === 'pending') fail(409, 'รายการนี้ปิดรับสลิปหรือมีสลิปรอตรวจแล้ว');
  if (!booking.transferAccount) fail(409, 'รายการนี้ไม่มีบัญชีรับโอน ติดต่อผู้จัด');
  if ((booking.receipts || []).filter(r => Date.parse(r.submittedAt) > Date.now() - 86400000).length >= 10) fail(429, 'ส่งสลิปหลายครั้งเกินไปในวันนี้ กรุณาติดต่อผู้จัด');
  return booking;
}
export function submitReceipt(data: MarketplaceData, actor: Actor, id: string, receipt: ReceiptSubmission) {
  const booking = receiptEligibility(data, actor, id);
  if (data.bookings.some(b => b.id !== id && b.receipts?.some(r => r.sha256 === receipt.sha256 && r.status !== 'rejected'))) fail(409, 'ภาพสลิปนี้ถูกใช้กับการจองอื่นแล้ว');
  booking.receipts = [...(booking.receipts || []), receipt];
}
export function review(data: MarketplaceData, context: PilotContext, bookingId: string, receiptId: string, action: unknown, reason: unknown, fundsChecked: unknown) {
  if (action !== 'approve' && action !== 'reject') fail(400, 'เลือกอนุมัติหรือปฏิเสธ');
  if (action === 'approve' && fundsChecked !== true) fail(400, 'ต้องตรวจยอดเงินเข้าบัญชีจริงก่อนอนุมัติ');
  if (action === 'reject' && (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 200)) fail(400, 'ระบุเหตุผล 3–200 ตัวอักษร');
  const booking = data.bookings.find(b => b.id === bookingId), receipt = booking?.receipts?.find(r => r.id === receiptId);
  if (!booking || !receipt) fail(404, 'ไม่พบสลิป');
  if (context.closed.includes(`game:${booking.sessionId}`) || booking.cancelledAt || booking.paidAt || receipt.status !== 'pending' || booking.receipts?.at(-1)?.id !== receiptId) fail(409, 'สลิปนี้ไม่อยู่ระหว่างรอตรวจ');
  receipt.status = action === 'approve' ? 'approved' : 'rejected'; receipt.reviewedAt = new Date().toISOString();
  if (action === 'approve') { booking.paidAt = receipt.reviewedAt; booking.paymentMethod = 'transfer'; }
  else receipt.rejectReason = (reason as string).trim();
  return { paidAt: booking.paidAt || null, status: receipt.status };
}
export function admit(data: MarketplaceData, context: PilotContext, id: string, action: unknown) {
  if (action !== 'approve' && action !== 'hold') fail(400, 'เลือกเข้าสนามหรือพักรายชื่อ');
  const booking = data.bookings.find(b => b.id === id);
  if (!booking) fail(404, 'ไม่พบการจอง');
  if (booking.cancelledAt || !booking.paidAt || context.closed.includes(`game:${booking.sessionId}`)) fail(409, 'ต้องตรวจเงินก่อน และก๊วนต้องยังไม่ปิดยอด');
  if (data.sessions.find(s => s.id === booking.sessionId)?.status === 'completed') fail(409, 'ก๊วนจบแล้ว');
  booking.admissionStatus = action === 'approve' ? 'approved' : 'pending'; booking.admissionUpdatedAt = new Date().toISOString();
  return { status: booking.admissionStatus };
}
export function transferAccount(value: unknown): TransferAccount | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length >= 2 && s.trim().length <= 120 && !/[\r\n\x00-\x1f]/.test(s);
  if (!text(v.bankName) || !text(v.accountName) || typeof v.accountNumber !== 'string') return null;
  const number = v.accountNumber.replace(/[ -]/g, '');
  return /^\d{10,15}$/.test(number) ? { bankName: v.bankName.trim(), accountName: v.accountName.trim(), accountNumber: number } : null;
}
export function newSession(v: Record<string, unknown>): Session {
  const start = Date.parse(String(v.startsAt)), end = v.endsAt === undefined ? undefined : Date.parse(String(v.endsAt));
  if (end !== undefined && (!Number.isFinite(end) || !Number.isFinite(start) || end <= start || end - start > 24 * 3600000)) fail(400, 'เวลาจบต้องหลังเริ่ม และระยะเวลาไม่เกิน 24 ชั่วโมง');
  const text = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 120;
  if (![v.title, v.venue, v.area, v.host, v.time].every(text) || typeof v.price !== 'number' || v.price <= 0 || v.price > 100000 || Math.abs(v.price * 100 - Math.round(v.price * 100)) > 1e-7 || !Number.isInteger(v.capacity) || Number(v.capacity) < 4 || Number(v.capacity) > 100 || !Number.isInteger(v.courtCount) || Number(v.courtCount) < 1 || Number(v.courtCount) > 20 || typeof v.startsAt !== 'string' || !Number.isFinite(Date.parse(v.startsAt)) || Date.parse(v.startsAt) <= Date.now() || (v.style !== 'casual' && v.style !== 'high')) fail(400, 'ตรวจชื่อ สนาม ราคา วันเวลาในอนาคต จำนวนคน 4–100 และคอร์ท 1–20');
  const clock = (stamp: number) => new Date(stamp).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
  return { id: crypto.randomUUID(), title: String(v.title).trim(), venue: String(v.venue).trim(), ...(typeof v.venueId === 'string' ? { venueId: v.venueId } : {}), area: String(v.area).trim(), host: String(v.host).trim(), time: end === undefined ? String(v.time).trim() : clock(start) + '–' + clock(end), price: Number(v.price), capacity: Number(v.capacity), courtCount: Number(v.courtCount), startsAt: new Date(start).toISOString(), ...(end === undefined ? {} : { endsAt: new Date(end).toISOString() }), date: '', dupr: v.style === 'high' ? '3.5+' : '<3.5', vibe: v.style === 'high' ? 'สูง' : 'เบา–กลาง', venueCost: 0, joined: 0, hostRating: 0, tags: [], status: 'open' };
}
