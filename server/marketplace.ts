import { Router, type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { activeBooking, type MarketplaceData, type Session } from '../src/marketplaceTypes';
import { thaiDate } from './finance';
import { parseTransferAccount } from './transferSettings';
import { marketplaceStore, type MarketplaceStore } from './marketplaceStore';

const dateAt = (days: number, time: string) => thaiDate(new Date(Date.now() + days * 86400000)) + 'T' + time + ':00+07:00';
export function initialMarketplaceData(): MarketplaceData {
  return { bookings: [], sessions: [
    { id: 'night-chicken', title: 'เย็นสบาย มีเพื่อนตี', venue: 'Smash Yard Pickleball', area: 'เมืองขอนแก่น', date: 'วันนี้', time: '18:00–20:00', price: 190, joined: 0, capacity: 12, dupr: '2.5–3.5', vibe: 'ชิลล์ เน้นเล่นทั่วถึง', host: 'Nui', hostRating: 0, courtCount: 2, venueCost: 800, tags: ['มาคนเดียวได้'], startsAt: dateAt(1, '18:00'), status: 'open' },
    { id: 'beginner', title: 'ก๊วนแรก ไม่ต้องเกร็ง', venue: 'Chicken Court Club', area: 'กังสดาล', date: 'พรุ่งนี้', time: '09:00–11:00', price: 170, joined: 0, capacity: 12, dupr: 'มือใหม่–3.0', vibe: 'มือใหม่สบาย ๆ', host: 'Bank', hostRating: 0, courtCount: 2, venueCost: 700, tags: ['มือใหม่'], startsAt: dateAt(2, '09:00'), status: 'open' },
    { id: 'competitive', title: 'ตีเข้ม เติมเกมให้สุด', venue: 'North Court Arena', area: 'บึงแก่นนคร', date: 'สุดสัปดาห์', time: '18:00–20:00', price: 220, joined: 0, capacity: 16, dupr: '3.2–4.2', vibe: 'จริงจัง แต่เป็นมิตร', host: 'Ploy', hostRating: 0, courtCount: 3, venueCost: 1200, tags: ['เกมเข้ม'], startsAt: dateAt(3, '18:00'), status: 'open' },
  ] };
}

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const route = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };
const reject = (status: number, message: string): never => { throw new HttpError(status, message); };
const view = (data: MarketplaceData) => ({ ...data, sessions: data.sessions.map(s => {
  const date = thaiDate(new Date(s.startsAt));
  const label = date === thaiDate() ? 'วันนี้' : date === thaiDate(new Date(Date.now() + 86400000)) ? 'พรุ่งนี้' : new Date(s.startsAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
  const joined = data.bookings.filter(b => b.sessionId === s.id && activeBooking(b)).length;
  return { ...s, date: label, joined, status: Date.parse(s.startsAt) <= Date.now() ? 'completed' : joined >= s.capacity ? 'full' : 'open' };
}) });

export function marketplaceRouter(source: string | MarketplaceStore = path.resolve('data/marketplace.json'), enabled?: boolean) {
  const router = Router();
  const store = typeof source === 'string' ? marketplaceStore(source, initialMarketplaceData) : source;
  const writesEnabled = enabled ?? (process.env.NODE_ENV !== 'production' || (process.env.APP_LIVE_MODE === 'true' && store.kind === 'tidb'));

  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!writesEnabled) return res.status(503).json({ message: 'การจองจริงยังปิดอยู่ ต้องเชื่อม TiDB, LINE และเปิด APP_LIVE_MODE ก่อน' });
    if (req.method !== 'GET' && (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)))) return res.status(403).json({ message: 'ไม่อนุญาตคำขอข้ามเว็บไซต์' });
    next();
  });
  router.get('/', route(async (_req, res) => res.json({ ...view(await store.read()), demo: store.kind !== 'tidb' })));
  router.get('/setup', route(async (_req, res) => res.json({
    mode: store.kind === 'tidb' && writesEnabled ? 'live' : 'preview', storage: store.kind,
    line: { channelConfigured: Boolean(process.env.LINE_CHANNEL_ID), liffConfigured: Boolean(process.env.VITE_LIFF_ID) },
    ocrConfigured: Boolean(process.env.HF_OCR_ENDPOINT_URL && process.env.HF_OCR_TOKEN),
    transferAccount: await store.readTransferAccount(),
  })));
  router.post('/setup/transfer-account', route(async (req, res) => {
    const account = parseTransferAccount(req.body);
    if (!account) return res.status(400).json({ message: 'ระบุธนาคาร ชื่อบัญชี และเลขบัญชี 10–15 หลัก' });
    await store.saveTransferAccount(account);
    await store.audit({ actorType: 'admin', action: 'transfer_account.updated', entityType: 'settings', entityId: 'transfer-account' });
    return res.json({ transferAccount: account, message: store.kind === 'tidb' ? 'บันทึกบัญชีรับโอนแล้ว' : 'บันทึกบัญชีสำหรับการจองใหม่ในโหมดทดลองแล้ว ยังไม่เปิดรับเงินจริง' });
  }));
  router.post('/sessions', route(async (req, res) => {
    const d = req.body;
    const validText = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
    if (![d.title, d.venue, d.area, d.host, d.dupr, d.time].every(validText) || !Number.isFinite(d.price) || d.price <= 0 || d.price > 100000 || Math.abs(d.price * 100 - Math.round(d.price * 100)) > 1e-7 || !Number.isInteger(d.capacity) || d.capacity < 4 || d.capacity > 100 || !Number.isInteger(d.courtCount) || d.courtCount < 1 || d.courtCount > 20 || !Number.isFinite(d.venueCost) || d.venueCost < 0 || d.venueCost > 1000000 || typeof d.startsAt !== 'string' || !Number.isFinite(Date.parse(d.startsAt)) || Date.parse(d.startsAt) <= Date.now()) return res.status(400).json({ message: 'ตรวจชื่อ สนาม วันเวลาในอนาคต ราคา จำนวนคน 4–100 และจำนวนคอร์ต 1–20' });
    const session: Session = { id: randomUUID(), title: d.title.trim(), venue: d.venue.trim(), area: d.area.trim(), host: d.host.trim(), time: d.time, date: thaiDate(new Date(d.startsAt)), startsAt: new Date(d.startsAt).toISOString(), price: d.price, capacity: d.capacity, courtCount: d.courtCount, venueCost: d.venueCost, dupr: d.dupr, vibe: 'ผสมผสาน', hostRating: 0, tags: ['เปิดใหม่'], joined: 0, status: 'open' };
    await store.update(data => { data.sessions.unshift(session); });
    await store.audit({ actorType: 'admin', action: 'session.created', entityType: 'session', entityId: session.id });
    return res.status(201).json(session);
  }));
  router.post('/bookings', route(async (req, res) => {
    const transferAccount = await store.readTransferAccount();
    if (await store.isSessionClosed(req.body.sessionId)) return res.status(409).json({ message: 'ก๊วนนี้ปิดยอดแบ่งรายได้แล้ว' });
    const result = await store.update(data => {
      const session = data.sessions.find(s => s.id === req.body.sessionId);
      if (!session) reject(404, 'ไม่พบก๊วนนี้');
      const existing = data.bookings.find(b => b.sessionId === session.id && b.playerId === 'demo_player' && activeBooking(b));
      if (existing) return { repeated: true, booking: existing, data };
      if (Date.parse(session.startsAt) <= Date.now() || session.status === 'completed') reject(409, 'ก๊วนนี้ปิดรับแล้ว');
      if (data.bookings.filter(b => b.sessionId === session.id && activeBooking(b)).length >= session.capacity) reject(409, 'ก๊วนเต็มแล้ว กรุณาเลือกก๊วนอื่น');
      const booking = { id: randomUUID(), sessionId: session.id, playerId: 'demo_player', playerName: 'Nui', amount: Math.round(session.price * 100), title: session.title, createdAt: new Date().toISOString(), admissionStatus: 'pending' as const, transferAccount: transferAccount || undefined };
      data.bookings.push(booking); return { repeated: false, booking, data };
    });
    if (!result.repeated) await store.audit({ actorType: 'admin', action: 'booking.created', entityType: 'booking', entityId: result.booking.id });
    return res.status(result.repeated ? 200 : 201).json({ success: true, booking: result.booking, ...view(result.data), repeated: result.repeated });
  }));
  router.post('/bookings/:id/payment', route(async (req, res) => {
    if (req.body?.method !== 'cash') return res.status(400).json({ message: 'ยอดโอนต้องส่งสลิปและให้แอดมินตรวจผ่านรายการสลิปก่อน' });
    const result = await store.update(data => {
      const booking = data.bookings.find(b => b.id === req.params.id);
      if (!booking) reject(404, 'ไม่พบการจองนี้');
      if (booking.cancelledAt) reject(409, 'รายการนี้ยกเลิกแล้ว ไม่สามารถยืนยันรับเงินได้');
      if (booking.paidAt) return { booking, repeated: true };
      if (booking.receipts?.at(-1)?.status === 'pending') reject(409, 'มีสลิปรอตรวจ กรุณาตรวจสลิปก่อน');
      booking.paidAt = new Date().toISOString(); booking.paymentMethod = 'cash'; return { booking, repeated: false };
    });
    if (!result.repeated) await store.audit({ actorType: 'admin', action: 'payment.cash_confirmed', entityType: 'booking', entityId: result.booking.id, details: { amount: result.booking.amount } });
    return res.json(result);
  }));
  router.post('/bookings/:id/cancel', route(async (req, res) => {
    const result = await store.update(data => {
      const booking = data.bookings.find(b => b.id === req.params.id);
      if (!booking) reject(404, 'ไม่พบการจองนี้');
      if (booking.cancelledAt) return { booking, repeated: true };
      if (booking.paidAt) reject(409, 'รายการนี้ยืนยันรับเงินแล้ว ต้องตรวจสอบและบันทึกการคืนเงินก่อน');
      if (booking.receipts?.at(-1)?.status === 'pending') reject(409, 'มีสลิปรอตรวจ กรุณาปฏิเสธสลิปก่อนยกเลิก');
      booking.cancelledAt = new Date().toISOString(); booking.cancelledBy = 'organizer'; return { booking, repeated: false };
    });
    if (!result.repeated) await store.audit({ actorType: 'admin', action: 'booking.cancelled', entityType: 'booking', entityId: result.booking.id });
    return res.json(result);
  }));
  router.post('/bookings/:id/admission', route(async (req, res) => {
    const action = req.body?.action;
    if (action !== 'approve' && action !== 'hold') return res.status(400).json({ message: 'เลือกอนุมัติให้ลงสนามหรือพักรายชื่อ' });
    const result = await store.update(data => {
      const booking = data.bookings.find(b => b.id === req.params.id);
      if (!booking) reject(404, 'ไม่พบการจองนี้');
      if (booking.cancelledAt) reject(409, 'รายการนี้ยกเลิกแล้ว');
      if (!booking.paidAt) reject(409, 'ต้องตรวจและยืนยันการรับเงินก่อนเลือกคนลงสนาม');
      const status = action === 'approve' ? 'approved' : 'pending';
      if (booking.admissionStatus === status) return { booking, repeated: true };
      booking.admissionStatus = status; booking.admissionUpdatedAt = new Date().toISOString(); return { booking, repeated: false };
    });
    if (!result.repeated) await store.audit({ actorType: 'admin', action: `admission.${action}`, entityType: 'booking', entityId: result.booking.id });
    return res.json(result);
  }));
  router.get('/bookings/:id/receipts/:receiptId', route(async (req, res) => {
    const booking = (await store.read()).bookings.find(b => b.id === req.params.id);
    const receipt = booking?.receipts?.find(r => r.id === req.params.receiptId);
    if (!receipt) return res.status(404).json({ message: 'ไม่พบสลิปนี้' });
    const image = await store.getReceiptImage(receipt);
    if (!image) return res.status(404).json({ message: 'ไฟล์สลิปไม่พร้อมใช้งาน' });
    res.setHeader('Content-Type', receipt.mimeType); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return res.send(image);
  }));
  router.post('/bookings/:id/receipts/:receiptId/review', route(async (req, res) => {
    const action = req.body?.action; const reason = req.body?.reason;
    if (action !== 'approve' && action !== 'reject') return res.status(400).json({ message: 'เลือกอนุมัติหรือปฏิเสธสลิป' });
    if (action === 'reject' && (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 200)) return res.status(400).json({ message: 'ระบุเหตุผลปฏิเสธอย่างน้อย 3 ตัวอักษร' });
    const result = await store.update(data => {
      const booking = data.bookings.find(b => b.id === req.params.id); const receipt = booking?.receipts?.find(r => r.id === req.params.receiptId);
      if (!booking || !receipt) reject(404, 'ไม่พบสลิปนี้');
      if (booking.cancelledAt || booking.paidAt || receipt.status !== 'pending' || booking.receipts?.at(-1)?.id !== receipt.id) reject(409, 'รายการนี้ไม่อยู่ระหว่างรอตรวจสลิป');
      receipt.status = action === 'approve' ? 'approved' : 'rejected'; receipt.reviewedAt = new Date().toISOString();
      if (action === 'approve') { booking.paidAt = receipt.reviewedAt; booking.paymentMethod = 'transfer'; } else receipt.rejectReason = reason.trim();
      return { booking, receipt };
    });
    await store.audit({ actorType: 'admin', action: `receipt.${action}`, entityType: 'receipt', entityId: result.receipt.id, details: { bookingId: result.booking.id, amount: result.booking.amount } });
    return res.json({ receipt: result.receipt, paidAt: result.booking.paidAt || null });
  }));
  router.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
    console.error(error); return res.status(500).json({ message: 'บันทึกไม่สำเร็จ ระบบยังไม่ยืนยันรายการ กรุณาลองใหม่' });
  });
  return router;
}
