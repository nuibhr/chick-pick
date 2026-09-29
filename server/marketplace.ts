import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { activeBooking, type MarketplaceData, type Session } from '../src/marketplaceTypes';
import { thaiDate } from './finance';
import { loadReceiptImage } from './receiptFiles';
import { parseTransferAccount, readTransferAccount, saveTransferAccount } from './transferSettings';
const dateAt = (days: number, time: string) => thaiDate(new Date(Date.now() + days * 86400000)) + 'T' + time + ':00+07:00';
function initial(): MarketplaceData {
  return { bookings: [], sessions: [
    { id: 'night-chicken', title: 'เย็นสบาย มีเพื่อนตี', venue: 'Smash Yard Pickleball', area: 'เมืองขอนแก่น', date: 'วันนี้', time: '18:00–20:00', price: 190, joined: 0, capacity: 12, dupr: '2.5–3.5', vibe: 'ชิลล์ เน้นเล่นทั่วถึง', host: 'Nui', hostRating: 0, courtCount: 2, venueCost: 800, tags: ['มาคนเดียวได้'], startsAt: dateAt(1, '18:00'), status: 'open' },
    { id: 'beginner', title: 'ก๊วนแรก ไม่ต้องเกร็ง', venue: 'Chicken Court Club', area: 'กังสดาล', date: 'พรุ่งนี้', time: '09:00–11:00', price: 170, joined: 0, capacity: 12, dupr: 'มือใหม่–3.0', vibe: 'มือใหม่สบาย ๆ', host: 'Bank', hostRating: 0, courtCount: 2, venueCost: 700, tags: ['มือใหม่'], startsAt: dateAt(2, '09:00'), status: 'open' },
    { id: 'competitive', title: 'ตีเข้ม เติมเกมให้สุด', venue: 'North Court Arena', area: 'บึงแก่นนคร', date: 'สุดสัปดาห์', time: '18:00–20:00', price: 220, joined: 0, capacity: 16, dupr: '3.2–4.2', vibe: 'จริงจัง แต่เป็นมิตร', host: 'Ploy', hostRating: 0, courtCount: 3, venueCost: 1200, tags: ['เกมเข้ม'], startsAt: dateAt(3, '18:00'), status: 'open' },
  ] };
}
export function marketplaceRouter(file = path.resolve('data/marketplace.json'), enabled = process.env.NODE_ENV !== 'production') {
  const router = Router();
  const save = (data: MarketplaceData) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(data, null, 2)); renameSync(file + '.tmp', file); };
  if (!existsSync(file)) save(initial());
  const read = (): MarketplaceData => JSON.parse(readFileSync(file, 'utf8'));
  const stored = read();
  const demo = initial();
  if (!stored.bookings.length && stored.sessions.length === demo.sessions.length && stored.sessions.every((s, i) => s.id === demo.sessions[i].id && s.title === demo.sessions[i].title && Date.parse(s.startsAt) <= Date.now())) {
    stored.sessions.forEach((s, i) => { s.startsAt = demo.sessions[i].startsAt; s.date = demo.sessions[i].date; });
    save(stored);
  }
  router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); if (!enabled) return res.status(503).json({ message: 'การจองยังเป็นโหมดทดลอง ต้องเชื่อมระบบสมาชิกและชำระเงินจริงก่อน' }); if (req.method !== 'GET' && (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && ![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)))) return res.status(403).json({ message: 'ไม่อนุญาตคำขอข้ามเว็บไซต์' }); next(); });
  const view = (data: MarketplaceData) => ({ ...data, sessions: data.sessions.map(s => { const date = thaiDate(new Date(s.startsAt)); const label = date === thaiDate() ? 'วันนี้' : date === thaiDate(new Date(Date.now() + 86400000)) ? 'พรุ่งนี้' : new Date(s.startsAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }); const joined = data.bookings.filter(b => b.sessionId === s.id && activeBooking(b)).length; return { ...s, date: label, joined, status: Date.parse(s.startsAt) <= Date.now() ? 'completed' : joined >= s.capacity ? 'full' : 'open' }; }) });
  router.get('/', (_req, res) => res.json({ ...view(read()), demo: true }));
  router.get('/setup', (_req, res) => res.json({
    mode: 'preview', storage: 'local-json',
    line: { channelConfigured: Boolean(process.env.LINE_CHANNEL_ID), liffConfigured: Boolean(process.env.VITE_LIFF_ID) },
    ocrConfigured: Boolean(process.env.HF_OCR_ENDPOINT_URL && process.env.HF_OCR_TOKEN),
    transferAccount: readTransferAccount(file),
  }));
  router.post('/setup/transfer-account', (req, res) => {
    const account = parseTransferAccount(req.body);
    if (!account) return res.status(400).json({ message: 'ระบุธนาคาร ชื่อบัญชี และเลขบัญชี 10–15 หลัก' });
    saveTransferAccount(file, account);
    res.json({ transferAccount: account, message: 'บันทึกบัญชีสำหรับการจองใหม่ในโหมดทดลองแล้ว ยังไม่เปิดรับเงินจริง' });
  });
  router.post('/sessions', (req, res) => {
    const d = req.body;
    const validText = (v: any) => typeof v === 'string' && v.trim().length > 0 && v.length <= 120;
    if (![d.title, d.venue, d.area, d.host, d.dupr, d.time].every(validText) || !Number.isFinite(d.price) || d.price <= 0 || d.price > 100000 || Math.abs(d.price * 100 - Math.round(d.price * 100)) > 1e-7 || !Number.isInteger(d.capacity) || d.capacity < 4 || d.capacity > 100 || !Number.isInteger(d.courtCount) || d.courtCount < 1 || d.courtCount > 20 || !Number.isFinite(d.venueCost) || d.venueCost < 0 || d.venueCost > 1000000 || typeof d.startsAt !== 'string' || !Number.isFinite(Date.parse(d.startsAt)) || Date.parse(d.startsAt) <= Date.now()) return res.status(400).json({ message: 'ตรวจชื่อ สนาม วันเวลาในอนาคต ราคา จำนวนคน 4–100 และจำนวนคอร์ต 1–20' });
    const data = read(); const session: Session = { id: randomUUID(), title: d.title.trim(), venue: d.venue.trim(), area: d.area.trim(), host: d.host.trim(), time: d.time, date: thaiDate(new Date(d.startsAt)), startsAt: new Date(d.startsAt).toISOString(), price: d.price, capacity: d.capacity, courtCount: d.courtCount, venueCost: d.venueCost, dupr: d.dupr, vibe: 'ผสมผสาน', hostRating: 0, tags: ['เปิดใหม่'], joined: 0, status: 'open' };
    data.sessions.unshift(session); save(data); res.status(201).json(session);
  });
  router.post('/bookings', (req, res) => {
    const data = read(); const session = data.sessions.find(s => s.id === req.body.sessionId);
    if (!session) return res.status(404).json({ message: 'ไม่พบก๊วนนี้' });
    // One local preview identity; browser-supplied player IDs never create extra seats.
    const existing = data.bookings.find(b => b.sessionId === session.id && b.playerId === 'demo_player' && activeBooking(b));
    if (existing) return res.json({ success: true, booking: existing, ...view(data), repeated: true });
    const closedFile = path.join(path.dirname(file), 'revenue-settlements.json');
    if (existsSync(closedFile) && JSON.parse(readFileSync(closedFile, 'utf8')).some((u: any) => u.key === 'game:' + session.id)) return res.status(409).json({ message: 'ก๊วนนี้ปิดยอดแบ่งรายได้แล้ว' });
    if (Date.parse(session.startsAt) <= Date.now() || session.status === 'completed') return res.status(409).json({ message: 'ก๊วนนี้ปิดรับแล้ว' });
    if (data.bookings.filter(b => b.sessionId === session.id && activeBooking(b)).length >= session.capacity) return res.status(409).json({ message: 'ก๊วนเต็มแล้ว กรุณาเลือกก๊วนอื่น' });
    const booking = { id: randomUUID(), sessionId: session.id, playerId: 'demo_player', playerName: 'Nui', amount: Math.round(session.price * 100), title: session.title, createdAt: new Date().toISOString(), transferAccount: readTransferAccount(file) || undefined };
    data.bookings.push(booking); save(data); res.status(201).json({ success: true, booking, ...view(data), repeated: false });
  });
  router.post('/bookings/:id/payment', (req, res) => {
    if (req.body?.method !== 'cash') return res.status(400).json({ message: 'ยอดโอนต้องส่งสลิปและให้แอดมินตรวจผ่านรายการสลิปก่อน' });
    const data = read(); const booking = data.bookings.find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ message: 'ไม่พบการจองนี้' });
    if (booking.cancelledAt) return res.status(409).json({ message: 'รายการนี้ยกเลิกแล้ว ไม่สามารถยืนยันรับเงินได้' });
    if (booking.paidAt) return res.json({ booking, repeated: true });
    if (booking.receipts?.at(-1)?.status === 'pending') return res.status(409).json({ message: 'มีสลิปรอตรวจ กรุณาตรวจสลิปก่อน' });
    const closedFile = path.join(path.dirname(file), 'revenue-settlements.json');
    if (existsSync(closedFile) && JSON.parse(readFileSync(closedFile, 'utf8')).some((u: any) => u.key === 'game:' + booking.sessionId)) return res.status(409).json({ message: 'ก๊วนนี้ปิดยอดแบ่งรายได้แล้ว' });
    booking.paidAt = new Date().toISOString(); booking.paymentMethod = req.body.method; save(data);
    res.json({ booking, repeated: false });
  });
  router.post('/bookings/:id/cancel', (req, res) => {
    const data = read(); const booking = data.bookings.find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ message: 'ไม่พบการจองนี้' });
    if (booking.cancelledAt) return res.json({ booking, repeated: true });
    if (booking.paidAt) return res.status(409).json({ message: 'รายการนี้ยืนยันรับเงินแล้ว ต้องตรวจสอบและบันทึกการคืนเงินก่อน' });
    if (booking.receipts?.at(-1)?.status === 'pending') return res.status(409).json({ message: 'มีสลิปรอตรวจ กรุณาปฏิเสธสลิปก่อนยกเลิก' });
    booking.cancelledAt = new Date().toISOString(); booking.cancelledBy = 'organizer'; save(data);
    res.json({ booking, repeated: false });
  });
  router.get('/bookings/:id/receipts/:receiptId', (req, res) => {
    const booking = read().bookings.find(b => b.id === req.params.id);
    const receipt = booking?.receipts?.find(r => r.id === req.params.receiptId);
    if (!receipt) return res.status(404).json({ message: 'ไม่พบสลิปนี้' });
    const image = loadReceiptImage(file, receipt);
    if (!image) return res.status(404).json({ message: 'ไฟล์สลิปไม่พร้อมใช้งาน' });
    res.setHeader('Content-Type', receipt.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(image);
  });
  router.post('/bookings/:id/receipts/:receiptId/review', (req, res) => {
    const action = req.body?.action;
    const reason = req.body?.reason;
    if (action !== 'approve' && action !== 'reject') return res.status(400).json({ message: 'เลือกอนุมัติหรือปฏิเสธสลิป' });
    if (action === 'reject' && (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 200)) return res.status(400).json({ message: 'ระบุเหตุผลปฏิเสธอย่างน้อย 3 ตัวอักษร' });
    const data = read(); const booking = data.bookings.find(b => b.id === req.params.id);
    const receipt = booking?.receipts?.find(r => r.id === req.params.receiptId);
    if (!booking || !receipt) return res.status(404).json({ message: 'ไม่พบสลิปนี้' });
    if (booking.cancelledAt || booking.paidAt || receipt.status !== 'pending' || booking.receipts?.at(-1)?.id !== receipt.id) return res.status(409).json({ message: 'รายการนี้ไม่อยู่ระหว่างรอตรวจสลิป' });
    const closedFile = path.join(path.dirname(file), 'revenue-settlements.json');
    if (action === 'approve' && existsSync(closedFile) && JSON.parse(readFileSync(closedFile, 'utf8')).some((u: { key: string }) => u.key === 'game:' + booking.sessionId)) return res.status(409).json({ message: 'ก๊วนนี้ปิดยอดแบ่งรายได้แล้ว' });
    receipt.status = action === 'approve' ? 'approved' : 'rejected'; receipt.reviewedAt = new Date().toISOString();
    if (action === 'approve') { booking.paidAt = receipt.reviewedAt; booking.paymentMethod = 'transfer'; }
    else receipt.rejectReason = reason.trim();
    save(data); res.json({ receipt, paidAt: booking.paidAt || null });
  });
  router.use((err: Error, _req: any, res: any, _next: any) => { console.error(err); res.status(500).json({ message: 'บันทึกไม่สำเร็จ ระบบยังไม่ยืนยันการจอง กรุณาลองใหม่' }); });
  return router;
}
