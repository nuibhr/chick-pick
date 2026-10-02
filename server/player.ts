import { Router, raw, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { activeBooking, type Booking, type MarketplaceData, type ReceiptSubmission, type Session } from '../src/marketplaceTypes';
import { thaiDate } from './finance';
import { maxReceiptBytes, validReceiptImage } from './receiptFiles';
import { readSlipOcr } from './slipOcr';
import { linePicture, ownProfile, participantPreview, profileSettings, updateProfile, type LineIdentity } from './playerProfiles';
import { sameOriginWrites } from './requestSecurity';
import { initialMarketplaceData } from './marketplace';
import { marketplaceStore, type MarketplaceStore } from './marketplaceStore';

type Verify = (rawToken: string, channelId: string) => Promise<LineIdentity>;
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const reject = (status: number, message: string): never => { throw new HttpError(status, message); };
const route = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };

export async function verifyLineIdToken(rawToken: string, channelId: string): Promise<LineIdentity> {
  const body = new URLSearchParams({ id_token: rawToken, client_id: channelId });
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('LINE identity verification failed');
  const data = await response.json() as { sub?: unknown; name?: unknown; aud?: unknown; exp?: unknown; iss?: unknown; picture?: unknown };
  if (data.iss !== 'https://access.line.me' || data.aud !== channelId || typeof data.sub !== 'string' || !data.sub || typeof data.exp !== 'number' || data.exp * 1000 <= Date.now()) throw new Error('Invalid LINE identity');
  return { sub: data.sub, name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 80) : 'ผู้เล่น LINE', picture: linePicture(data.picture) };
}

export function publicSession(s: Session, bookings: Booking[], profiles: MarketplaceData['profiles'] = []) {
  const joined = bookings.filter(b => b.sessionId === s.id && activeBooking(b)).length;
  const status = s.status === 'completed' || !Number.isFinite(Date.parse(s.startsAt)) || Date.parse(s.startsAt) <= Date.now() ? 'completed' : joined >= s.capacity ? 'full' : 'open';
  const date = Number.isFinite(Date.parse(s.startsAt)) ? thaiDate(new Date(s.startsAt)) : '';
  return { id: s.id, title: s.title, venue: s.venue, area: s.area, date: !date ? 'วันยังไม่ระบุ' : date === thaiDate() ? 'วันนี้' : date === thaiDate(new Date(Date.now() + 86400000)) ? 'พรุ่งนี้' : new Date(s.startsAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }), time: s.time, price: s.price, joined, capacity: s.capacity, dupr: s.dupr, vibe: s.vibe, host: s.host, courtCount: s.courtCount, tags: s.tags, startsAt: s.startsAt, status, ...participantPreview({ sessions: [s], bookings, profiles }, s.id, status !== 'completed') };
}

export function playerRouter(source: string | MarketplaceStore = path.resolve('data/marketplace.json'), channelId = process.env.LINE_CHANNEL_ID || '', verify: Verify = verifyLineIdToken, enabled?: boolean) {
  const router = Router();
  const store = typeof source === 'string' ? marketplaceStore(source, initialMarketplaceData) : source;
  const writesEnabled = enabled ?? (process.env.NODE_ENV !== 'production' || (process.env.APP_LIVE_MODE === 'true' && store.kind === 'tidb'));
  const identity: RequestHandler = async (req, res, next) => {
    const token = req.get('Authorization')?.match(/^Bearer (\S{20,4096})$/)?.[1];
    if (!channelId) return res.status(503).json({ message: 'ยังไม่เชื่อม LINE Mini App' });
    if (!token) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบผ่าน LINE' });
    try { res.locals.line = await verify(token, channelId); } catch { return res.status(401).json({ message: 'ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาเปิดแอปใหม่' }); }
    next();
  };
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(sameOriginWrites);
  router.use((req, res, next) => { if (!writesEnabled && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return res.status(503).json({ message: 'ยังไม่เปิดรับรายการจริง โปรดติดต่อผู้จัด' }); next(); });
  router.get('/config', (_req, res) => res.json({ liffId: process.env.VITE_LIFF_ID || null, connected: Boolean(channelId && process.env.VITE_LIFF_ID), profileEditingEnabled: Boolean(writesEnabled && channelId && process.env.VITE_LIFF_ID), bookingEnabled: Boolean(writesEnabled && store.kind === 'tidb' && channelId && process.env.VITE_LIFF_ID) }));
  router.get('/sessions', route(async (_req, res) => { const data = await store.read(); return res.json({ sessions: data.sessions.map(s => publicSession(s, data.bookings, data.profiles)) }); }));
  router.get('/me', identity, route(async (_req, res) => { const person = res.locals.line as LineIdentity; return res.json({ name: person.name, profile: ownProfile(await store.read(), person) }); }));
  router.post('/me/profile', identity, route(async (req, res) => {
    const settings = profileSettings(req.body);
    if (!settings) return res.status(400).json({ message: 'เลือกการแสดงโปรไฟล์ ระดับ 2.0–5.0 หรือยังไม่ระบุ และแนะนำตัวไม่เกิน 160 ตัวอักษร' });
    const person = res.locals.line as LineIdentity;
    const profile = await store.update(data => updateProfile(data, person, settings));
    await store.audit({ actorType: 'line', actorId: person.sub, action: 'profile.updated', entityType: 'player', entityId: `line:${person.sub}` });
    return res.json({ profile });
  }));
  router.get('/bookings', identity, route(async (_req, res) => {
    const id = (res.locals.line as LineIdentity).sub; const data = await store.read();
    return res.json({ bookings: data.bookings.filter(b => b.playerId === `line:${id}`).map(b => ({ id: b.id, sessionId: b.sessionId, amount: b.amount, title: b.title, transferAccount: b.transferAccount || null, createdAt: b.createdAt, paidAt: b.paidAt || null, admissionStatus: b.admissionStatus || 'pending', cancelledAt: b.cancelledAt || null, receipt: b.receipts?.at(-1) ? { id: b.receipts.at(-1)!.id, status: b.receipts.at(-1)!.status, ocr: b.receipts.at(-1)!.ocr, rejectReason: b.receipts.at(-1)!.rejectReason || null } : null })) });
  }));
  router.post('/bookings', identity, route(async (req, res) => {
    const sessionId = req.body?.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length > 120) return res.status(400).json({ message: 'รหัสก๊วนไม่ถูกต้อง' });
    if (await store.isSessionClosed(sessionId)) return res.status(409).json({ message: 'ก๊วนนี้ปิดยอดแบ่งรายได้แล้ว' });
    const person = res.locals.line as LineIdentity; const playerId = `line:${person.sub}`; const transferAccount = await store.readTransferAccount();
    const result = await store.update(data => {
      const session = data.sessions.find(s => s.id === sessionId);
      if (!session) reject(404, 'ไม่พบก๊วนนี้');
      const existing = data.bookings.find(b => b.sessionId === sessionId && b.playerId === playerId && activeBooking(b));
      if (existing) return { booking: existing, repeated: true };
      if (session.status === 'completed' || !Number.isFinite(Date.parse(session.startsAt)) || Date.parse(session.startsAt) <= Date.now() || data.bookings.filter(b => b.sessionId === sessionId && activeBooking(b)).length >= session.capacity) reject(409, 'ก๊วนนี้ปิดรับหรือเต็มแล้ว');
      const booking: Booking = { id: randomUUID(), sessionId, playerId, playerName: person.name, amount: Math.round(session.price * 100), title: session.title, createdAt: new Date().toISOString(), admissionStatus: 'pending', transferAccount: transferAccount || undefined };
      data.bookings.push(booking); return { booking, repeated: false };
    });
    if (!result.repeated) await store.audit({ actorType: 'line', actorId: person.sub, action: 'booking.created', entityType: 'booking', entityId: result.booking.id, details: { sessionId } });
    return res.status(result.repeated ? 200 : 201).json({ booking: { id: result.booking.id, sessionId }, repeated: result.repeated, message: result.repeated ? undefined : 'ส่งคำขอร่วมก๊วนแล้ว · ผู้จัดจะเลือกผู้ลงสนามหลังตรวจเงิน' });
  }));
  router.post('/bookings/:id/receipt', identity, raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: maxReceiptBytes }), route(async (req, res) => {
    const contentType = (req.get('Content-Type') || '').split(';')[0].toLowerCase();
    if (!Buffer.isBuffer(req.body) || !validReceiptImage(req.body, contentType)) return res.status(415).json({ message: 'รับเฉพาะภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB' });
    const person = res.locals.line as LineIdentity; const image = req.body as Buffer; const sha256 = createHash('sha256').update(image).digest('hex');
    const id = randomUUID(); const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';
    const receipt: ReceiptSubmission = { id, fileName: `${id}.${extension}`, mimeType: contentType, size: image.length, sha256, submittedAt: new Date().toISOString(), status: 'pending', ocr: { status: 'unavailable', amount: null, transferredAt: null, reference: null, sender: null, receiver: null, rawText: null, confidence: null } };
    await store.putReceiptImage(id, image, contentType, sha256);
    try {
      await store.update(data => {
        const booking = data.bookings.find(b => b.id === req.params.id && b.playerId === `line:${person.sub}`);
        if (!booking) reject(404, 'ไม่พบการจองของคุณ');
        if (booking.cancelledAt || booking.paidAt) reject(409, 'รายการนี้ปิดรับสลิปแล้ว');
        if (booking.receipts?.at(-1)?.status === 'pending') reject(409, 'ส่งสลิปแล้ว กรุณารอแอดมินตรวจสอบ');
        if (data.bookings.some(b => b.id !== booking.id && b.receipts?.some(r => r.sha256 === sha256 && r.status !== 'rejected'))) reject(409, 'ภาพสลิปนี้ถูกส่งกับการจองอื่นแล้ว กรุณาตรวจสอบรายการ');
        booking.receipts = [...(booking.receipts || []), receipt];
      });
    } catch (error) { await store.removeReceiptImage(receipt); throw error; }
    const ocr = await readSlipOcr(image, contentType);
    await store.update(data => { const saved = data.bookings.find(b => b.id === req.params.id)?.receipts?.find(r => r.id === id); if (saved) saved.ocr = ocr; });
    await store.audit({ actorType: 'line', actorId: person.sub, action: 'receipt.submitted', entityType: 'receipt', entityId: id, details: { bookingId: req.params.id, sha256 } });
    return res.status(201).json({ receipt: { id, status: 'pending', ocr }, message: 'ส่งสลิปแล้ว กรุณาดูสถานะการตรวจในรายการจอง' });
  }));
  router.post('/bookings/:id/cancel', identity, route(async (req, res) => {
    const person = res.locals.line as LineIdentity;
    const result = await store.update(data => {
      const booking = data.bookings.find(b => b.id === req.params.id && b.playerId === `line:${person.sub}`);
      if (!booking) reject(404, 'ไม่พบการจองของคุณ');
      if (booking.cancelledAt) return { cancelled: true, repeated: true };
      if (booking.admissionStatus === 'approved') reject(409, 'ผู้จัดรับเข้าสนามแล้ว กรุณาติดต่อผู้จัดหากต้องการยกเลิก');
      if (booking.receipts?.at(-1)?.status === 'pending') reject(409, 'สลิปกำลังรอตรวจ กรุณาติดต่อผู้จัดก่อนยกเลิก');
      const session = data.sessions.find(s => s.id === booking.sessionId);
      if (!session || session.status === 'completed' || !Number.isFinite(Date.parse(session.startsAt)) || Date.parse(session.startsAt) <= Date.now()) reject(409, 'ก๊วนเริ่มแล้ว กรุณาติดต่อผู้จัด');
      if (booking.paidAt) reject(409, 'รายการนี้ยืนยันรับเงินแล้ว กรุณาติดต่อผู้จัดเพื่อดำเนินการคืนเงิน');
      booking.cancelledAt = new Date().toISOString(); booking.cancelledBy = 'player'; return { cancelled: true, repeated: false };
    });
    if (!result.repeated) await store.audit({ actorType: 'line', actorId: person.sub, action: 'booking.cancelled', entityType: 'booking', entityId: req.params.id });
    return res.json(result);
  }));
  router.use((error: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'ภาพสลิปต้องมีขนาดไม่เกิน 5 MB' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'รูปแบบคำขอไม่ถูกต้อง' });
    console.error(error); return res.status(500).json({ message: 'บันทึกข้อมูลไม่สำเร็จ กรุณาตรวจสถานะรายการก่อนลองใหม่' });
  });
  return router;
}
