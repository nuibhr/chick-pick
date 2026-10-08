import { bookingHoldExpired } from '../src/marketplaceTypes';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { categories, type FinanceRow, type FinanceReport } from '../src/financeTypes';
import type { Enrollment } from '../src/coachingTypes';
import { platformDistribution } from '../src/revenueMath';
import { defaultRevenueConfig, revenueUnits } from './revenue';
import type { RevenueConfig, RevenueUnit } from '../src/revenueTypes';
import type { MarketplaceData } from '../src/marketplaceTypes';
import { TidbAdminAuthStore } from './adminAuthStore';
import { tidbPool, type MarketplaceStore } from './marketplaceStore';

export const thaiDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const validDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
function read<T>(file: string, fallback: T): T { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback; }
function save(file: string, value: unknown) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); renameSync(file + '.tmp', file); }
const incomeCategories = ['coaching', 'game', 'other_income'];

export { summarize } from '../src/financeModel';
import { summarize } from '../src/financeModel';

export function createFinance(directory = path.resolve('data'), enabled = process.env.NODE_ENV !== 'production', documents?: MarketplaceStore) {
  const router = Router();
  const ledgerFile = path.join(directory, 'finance.json'), authFile = path.join(directory, 'admin.json');
  const revenueFile = path.join(directory, 'revenue-config.json'), settlementFile = path.join(directory, 'revenue-settlements.json');
  const sessions = new Map<string, number>();
  const durableAuth = process.env.TIDB_DATABASE_URL ? new TidbAdminAuthStore(tidbPool()) : null;
  const attempts = new Map<string, { count: number; until: number }>();
  const run = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };
  const readDoc = async <T>(key: string, file: string, fallback: T) => documents ? documents.readDocument(key, fallback) : read<T>(file, fallback);
  const updateDoc = async <T, R>(key: string, file: string, fallback: T, mutate: (value: T) => R | Promise<R>) => {
    if (documents) return documents.updateDocument(key, fallback, mutate);
    const value = read<T>(file, fallback); const result = await mutate(value); save(file, value); return result;
  };
  const cookie = (req: any) => String(req.headers.cookie || '').split(';').map((s: string) => s.trim()).find((s: string) => s.startsWith('cb_admin='))?.slice(9);
  const authenticated = async (req: any) => {
    const key = cookie(req); if (!key) return false;
    if (durableAuth) return durableAuth.validSession(key);
    const expiry = sessions.get(key); if (expiry && expiry <= Date.now()) sessions.delete(key);
    return Boolean(expiry && expiry > Date.now());
  };
  const requireAdmin: RequestHandler = (req, res, next) => { void authenticated(req).then(ok => ok ? next() : res.status(401).json({ message: 'กรุณาเข้าสู่ระบบแอดมิน' })).catch(next); };
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); return enabled ? next() : res.status(503).json({ message: 'ระบบการเงินนี้เปิดเฉพาะโหมดทดสอบในเครื่อง ยังไม่เปิดใช้งานจริง' }); });
  router.use((req, res, next) => {
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && ![ `http://${req.headers.host}`, `https://${req.headers.host}` ].includes(origin))) return res.status(403).json({ message: 'ไม่อนุญาตคำขอข้ามเว็บไซต์' });
    }
    next();
  });
  router.get('/auth', (req, res, next) => { void (async () => res.json({ setupRequired: durableAuth ? !(await durableAuth.credential()) : !existsSync(authFile), authenticated: await authenticated(req) }))().catch(next); });
  router.post('/auth', (req, res, next) => { void (async () => {
    const ip = req.ip || 'local'; const previous = attempts.get(ip); const attempt = previous && previous.until > Date.now() ? previous : { count: 0, until: Date.now() + 900000 };
    if (attempt.count >= 8) return res.status(429).json({ message: 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที' });
    attempt.count++; attempts.set(ip, attempt);
    const { password, setup } = req.body || {};
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ message: 'ใช้รหัสผ่าน 12–128 ตัวอักษร' });
    let stored = durableAuth ? await durableAuth.credential() : read<{ salt: string; hash: string } | null>(authFile, null);
    if (!stored) {
      if (setup !== true) return res.status(409).json({ message: 'ต้องตั้งรหัสผ่านแอดมินครั้งแรก' });
      if (durableAuth) {
        const setupToken = process.env.ADMIN_SETUP_TOKEN || '';
        if (!setupToken || setupToken.length !== password.length || !timingSafeEqual(Buffer.from(password), Buffer.from(setupToken))) return res.status(403).json({ message: 'รหัสตั้งค่าผู้จัดไม่ตรงกับ ADMIN_SETUP_TOKEN' });
        const salt = randomBytes(16).toString('hex'); stored = { salt, hash: scryptSync(password, salt, 64).toString('hex') };
        if (!(await durableAuth.createCredential(stored.salt, stored.hash))) return res.status(409).json({ message: 'มีบัญชีแอดมินแล้ว กรุณาเข้าสู่ระบบ' });
      } else {
        const localAddress = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
        const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(req.hostname);
        if (!localAddress || !localHost) return res.status(403).json({ message: 'ตั้งผู้จัดครั้งแรกจาก localhost บนเครื่องเซิร์ฟเวอร์เท่านั้น' });
        const salt = randomBytes(16).toString('hex'); stored = { salt, hash: scryptSync(password, salt, 64).toString('hex') }; save(authFile, stored);
      }
    } else {
      if (setup) return res.status(409).json({ message: 'มีบัญชีแอดมินแล้ว กรุณาเข้าสู่ระบบ' });
      if (!timingSafeEqual(Buffer.from(stored.hash, 'hex'), scryptSync(password, stored.salt, 64))) return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }
    attempts.delete(ip); const token = randomBytes(32).toString('hex'); const expiresAt = Date.now() + 8 * 3600000;
    if (durableAuth) await durableAuth.createSession(token, new Date(expiresAt)); else sessions.set(token, expiresAt);
    res.cookie('cb_admin', token, { httpOnly: true, sameSite: 'strict', path: '/api', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600000 });
    res.json({ authenticated: true });
  })().catch(next); });
  router.post('/logout', (req, res, next) => { void (async () => { const key = cookie(req) || ''; if (durableAuth) await durableAuth.deleteSession(key); else sessions.delete(key); res.clearCookie('cb_admin', { path: '/api' }); res.json({ success: true }); })().catch(next); });
  router.use(requireAdmin);
  const getRows = async (): Promise<FinanceRow[]> => {
    const manual = await readDoc<FinanceRow[]>('finance', ledgerFile, []);
    const enrollments = await readDoc<Enrollment[]>('coaching', path.join(directory, 'coaching.json'), []);
    const coaching: FinanceRow[] = enrollments.map(e => ({ id: 'coach_' + e.id, type: 'income', category: 'coaching', amount: Math.round(e.amount * 100), description: e.title, counterparty: e.student, date: thaiDate(new Date(e.createdAt)), settledOn: e.paidAt ? thaiDate(new Date(e.paidAt)) : undefined, method: e.paymentMethod === 'cash' ? 'cash' : 'transfer', status: e.payment === 'paid' ? 'settled' : 'pending', source: 'coaching', reference: e.id, createdAt: e.createdAt, history: [{ at: e.createdAt, action: 'สมัครเรียน' }, ...(e.paidAt ? [{ at: e.paidAt, action: 'โค้ชยืนยันรับเงิน (ทดลอง)' }] : [])] }));
    const marketplace = documents ? await documents.read() : read<MarketplaceData>(path.join(directory, 'marketplace.json'), { sessions: [], bookings: [] });
    const games: FinanceRow[] = marketplace.bookings.filter(b => !manual.some(r => r.source === 'game' && r.reference === `${b.sessionId}:${b.playerId}`)).map(b => ({ id: 'booking_' + b.id, type: 'income', category: 'game', amount: b.amount, description: b.title, counterparty: b.playerName, date: thaiDate(new Date(b.createdAt)), settledOn: b.paidAt ? thaiDate(new Date(b.paidAt)) : undefined, method: b.paymentMethod || 'transfer', status: b.cancelledAt || bookingHoldExpired(b) ? 'void' : b.paidAt ? 'settled' : 'pending', source: 'game', reference: `${b.sessionId}:${b.playerId}`, createdAt: b.createdAt, history: [{ at: b.createdAt, action: 'บันทึกการจอง (ยังไม่รับเงินจริง)' }, ...(b.paidAt ? [{ at: b.paidAt, action: 'ผู้จัดยืนยันรับเงิน' }] : []), ...(b.cancelledAt ? [{ at: b.cancelledAt, action: b.cancelledBy === 'player' ? 'ผู้เล่นยกเลิกการจอง' : 'ผู้จัดยกเลิกการจอง' }] : [])] }));
    return [...manual, ...coaching, ...games];
  };
  const filter = async (query: any) => {
    if ((query.from && !validDate(query.from)) || (query.to && !validDate(query.to)) || (query.from && query.to && query.from > query.to)) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    const q = String(query.q || '').trim().toLowerCase();
    return (await getRows()).filter(r => { const date = r.settledOn || r.date; return (!query.from || date >= query.from) && (!query.to || date <= query.to) && (!query.type || r.type === query.type) && (!query.status || r.status === query.status) && (!query.category || r.category === query.category) && (!q || `${r.description} ${r.counterparty} ${r.reference} ${r.id}`.toLowerCase().includes(q)); }).sort((a, b) => (b.settledOn || b.date).localeCompare(a.settledOn || a.date) || b.createdAt.localeCompare(a.createdAt));
  };
  const revenueState = async () => {
    const history = await readDoc<RevenueConfig[]>('revenue-config', revenueFile, []), config = history.at(-1) || defaultRevenueConfig;
    const settlements = await readDoc<NonNullable<RevenueUnit['settlement'] & { key: string; rule: RevenueUnit['rule'] } >[]>('revenue-settlements', settlementFile, []);
    const allRows = await getRows();
    const units = revenueUnits(allRows, config).map(unit => {
      const settlement = settlements.find(s => s.key === unit.key);
      if (!settlement) return unit;
      return { ...unit, rule: settlement.rule, settlement, changed: unit.fingerprint !== settlement.fingerprint, gross: settlement.gross, refunds: settlement.refunds, directCosts: settlement.directCosts, processing: settlement.processing, distributable: settlement.distributable, platform: settlement.platform, partner: settlement.partner, remainingPartner: Math.max(0, settlement.partner - unit.paidPartner - unit.pendingPartner), overpaid: Math.max(0, unit.paidPartner + unit.pendingPartner - settlement.partner) };
    });
    const distribution = { developer:0, marketing:0, retained:0, unconfigured:0 };
    for (const u of units) { const split=platformDistribution(u.platform,u.settlement ? u.settlement.platformAllocation : config.platformAllocation); for (const k of Object.keys(distribution)) distribution[k]+=split[k]; }
    return { config, history, units, platformDistribution: distribution, unallocatedExpenses: allRows.filter(r => r.type === 'expense' && r.status !== 'void' && !r.allocationKey).reduce((s, r) => s + r.amount, 0) };
  };
  router.get('/revenue', run(async (_req, res) => {
    const state = await revenueState();
    const totals = { gross: 0, platform: 0, partner: 0, directCosts: 0, refunds: 0, processing: 0, remainingPartner: 0, deficit: 0, overpaid: 0 };
    for (const unit of state.units) for (const k of Object.keys(totals)) totals[k] += unit[k];
    return res.json({ ...state, totals });
  }));
  router.post('/revenue/config', run(async (req, res) => {
    const { game, coaching, expectedVersion, platformAllocation } = req.body;
    if (platformAllocation && (typeof platformAllocation.confirmed !== 'boolean' || ![platformAllocation.developerBps,platformAllocation.marketingBps].every(n=>Number.isInteger(n)&&n>=0&&n<=10000) || platformAllocation.developerBps + platformAllocation.marketingBps > 10000)) return res.status(400).json({message:'ส่วนผู้พัฒนาและการตลาดรวมกันต้องไม่เกิน 100% ของส่วนแพลตฟอร์ม'});
    const valid = (r: any) => r && ['gross', 'margin'].includes(r.basis) && Number.isInteger(r.platformBps) && r.platformBps >= 0 && r.platformBps <= 10000 && Number.isInteger(r.processingBps) && r.processingBps >= 0 && r.processingBps <= 10000;
    if (!valid(game) || !valid(coaching)) return res.status(400).json({ message: 'อัตราต้องอยู่ระหว่าง 0–100% และเลือกฐานคำนวณให้ครบ' });
    const result = await updateDoc<RevenueConfig[], { conflict: boolean; config?: RevenueConfig }>('revenue-config', revenueFile, [], history => {
      const previous = history.at(-1) || defaultRevenueConfig;
      if (expectedVersion !== previous.version) return { conflict: true };
      const config: RevenueConfig = { game, coaching, platformAllocation: platformAllocation || previous.platformAllocation, version: previous.version + 1, confirmed: true, updatedAt: new Date().toISOString() };
      history.push(config); return { conflict: false, config };
    });
    if (result.conflict) return res.status(409).json({ message: 'มีการแก้สูตรจากหน้าต่างอื่น กรุณารีเฟรชก่อน' });
    return res.json(result.config);
  }));
  router.post('/revenue/settle', run(async (req, res) => {
    const state = await revenueState(), unit = state.units.find(u => u.key === req.body.key);
    if (!state.config.confirmed || !unit) return res.status(400).json({ message: 'บันทึกสูตรส่วนแบ่งและเลือกรายการก่อน' });
    if (unit.settlement) return res.status(409).json({ message: 'ยืนยันยอดนี้แล้ว ไม่สร้างใบแบ่งรายได้ซ้ำ' });
    if (unit.deficit || unit.overpaid) return res.status(409).json({ message: 'มีต้นทุนเกินยอดขายหรือจ่ายเกินส่วนแบ่ง ต้องตรวจยอดก่อน' });
    if (req.body.fingerprint !== unit.fingerprint || req.body.configVersion !== state.config.version) return res.status(409).json({ message: 'ยอดหรือสูตรเปลี่ยนไป กรุณารีเฟรชเพื่อตรวจยอดล่าสุด' });
    const snapshot = { id: randomUUID(), key: unit.key, createdAt: new Date().toISOString(), configVersion: state.config.version, fingerprint: unit.fingerprint, rule: unit.rule, platform: unit.platform, partner: unit.partner, gross: unit.gross, refunds: unit.refunds, directCosts: unit.directCosts, processing: unit.processing, distributable: unit.distributable, platformAllocation: state.config.platformAllocation };
    const inserted = await updateDoc<any[], boolean>('revenue-settlements', settlementFile, [], settlements => {
      if (settlements.some(item => item.key === unit.key)) return false;
      settlements.push(snapshot); return true;
    });
    if (!inserted) return res.status(409).json({ message: 'ยืนยันยอดนี้แล้ว ไม่สร้างใบแบ่งรายได้ซ้ำ' });
    return res.status(201).json(snapshot);
  }));
  router.get('/report', run(async (req, res) => { try { return res.json(summarize(await filter(req.query))); } catch (e) { return res.status(400).json({ message: (e as Error).message }); } }));
  router.get('/export', run(async (req, res) => {
    try {
      const cell = (v: unknown) => { let s = String(v ?? ''); if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      const lines = [['เลขรายการ', 'วันที่', 'ประเภท', 'หมวดหมู่', 'รายละเอียด', 'ผู้รับ/ผู้จ่าย', 'จำนวนบาท', 'สถานะ', 'ช่องทาง', 'ที่มา', 'อ้างอิง'], ...(await filter(req.query)).map(r => [r.id, r.settledOn || r.date, r.type === 'income' ? 'รายรับ' : 'รายจ่าย', categories[r.category], r.description, r.counterparty, (r.amount / 100).toFixed(2), r.status, r.method, r.source, r.reference])];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="chick-pick-finance.csv"'); res.send('\uFEFF' + lines.map(line => line.map(cell).join(',')).join('\r\n'));
    } catch (e) { res.status(400).json({ message: (e as Error).message }); }
  }));
  router.post('/entries', run(async (req, res) => {
    const { type, category, description, counterparty, amount, date, method, status, reference, requestId, allocationKey } = req.body;
    if (!['income', 'expense'].includes(type) || !Object.hasOwn(categories, category) || incomeCategories.includes(category) !== (type === 'income') || typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || amount > 10000000000 || !validDate(date) || !['cash', 'transfer', 'card'].includes(method) || !['pending', 'settled'].includes(status) || typeof description !== 'string' || !description.trim() || description.length > 200 || typeof counterparty !== 'string' || !counterparty.trim() || counterparty.length > 100 || typeof reference !== 'string' || reference.length > 100 || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) return res.status(400).json({ message: 'ข้อมูลไม่ครบหรือยอดเงิน/หมวดหมู่ไม่ถูกต้อง' });
    if (status === 'settled' && date > thaiDate()) return res.status(400).json({ message: 'รายการรับ/จ่ายแล้วต้องไม่เป็นวันที่ในอนาคต' });
    if (['coach_payout', 'organizer'].includes(category) && !allocationKey) return res.status(400).json({ message: 'รายการจ่ายส่วนแบ่งต้องผูกกับก๊วนหรือคอร์ส' });
    if (allocationKey) {
      const unit = (await revenueState()).units.find(u => u.key === allocationKey);
      if (type !== 'expense' || !unit) return res.status(400).json({ message: 'เลือกรายการก๊วนหรือคอร์สที่ถูกต้องสำหรับค่าใช้จ่าย' });
      if (['coach_payout', 'organizer'].includes(category)) {
        if ((category === 'organizer') !== (unit.kind === 'game')) return res.status(400).json({ message: 'เลือกหมวดผู้จัดสำหรับก๊วน หรือจ่ายโค้ชสำหรับคอร์ส' });
        if (!unit.settlement || unit.changed) return res.status(409).json({ message: 'ต้องยืนยันใบแบ่งรายได้ และยอดต้นทางต้องไม่เปลี่ยนก่อนบันทึกจ่ายส่วนแบ่ง' });
        if (amount > unit.remainingPartner) return res.status(409).json({ message: 'ยอดจ่ายเกินส่วนแบ่งคงเหลือ (รวมรายการรอจ่ายแล้ว)' });
      } else if (unit.settlement) return res.status(409).json({ message: 'ปิดยอดแบ่งรายได้แล้ว ไม่สามารถเพิ่มต้นทุนย้อนเข้ารายการนี้' });
    }
    const row: FinanceRow = { id: 'manual_' + requestId, type, category, description: description.trim(), counterparty: counterparty.trim(), amount, date, method, status, reference: reference.trim(), source: 'manual', createdAt: new Date().toISOString(), settledOn: status === 'settled' ? date : undefined, history: [{ at: new Date().toISOString(), action: 'แอดมินเพิ่มรายการ' }] };
    if (allocationKey) row.allocationKey = allocationKey;
    const stored = await updateDoc<FinanceRow[], { row: FinanceRow; repeated: boolean }>('finance', ledgerFile, [], entries => {
      const existing = entries.find(entry => entry.id === row.id); if (existing) return { row: existing, repeated: true };
      entries.unshift(row); return { row, repeated: false };
    });
    return res.status(stored.repeated ? 200 : 201).json(stored.row);
  }));
  router.post('/entries/:id', run(async (req, res) => {
    const { action, reason, settledOn } = req.body;
    if (!['settle', 'void'].includes(action)) return res.status(400).json({ message: 'คำสั่งไม่ถูกต้อง' });
    const state = await revenueState();
    const result = await updateDoc<FinanceRow[], { status?: number; message?: string; row?: FinanceRow }>('finance', ledgerFile, [], entries => {
      const row = entries.find(entry => entry.id === req.params.id);
      if (!row || row.source !== 'manual') return { status: 409, message: 'รายการอัตโนมัติต้องจัดการจากระบบต้นทาง' };
      const unit = row.allocationKey ? state.units.find(item => item.key === row.allocationKey) : undefined;
      if (action === 'void' && row.allocationKey && !['coach_payout', 'organizer'].includes(row.category) && unit?.settlement) return { status: 409, message: 'ต้นทุนอยู่ในใบแบ่งรายได้ที่ปิดยอดแล้ว ไม่สามารถเปลี่ยนย้อนหลัง' };
      if (action === 'settle') {
        if (row.status === 'settled') return { row };
        if (row.allocationKey && ['coach_payout', 'organizer'].includes(row.category) && unit?.changed) return { status: 409, message: 'ยอดต้นทางเปลี่ยนหลังปิดยอด กรุณาตรวจสอบก่อนจ่าย' };
        if (row.status !== 'pending' || !validDate(settledOn) || settledOn > thaiDate()) return { status: 400, message: 'ระบุวันที่รับ/จ่ายจริง และต้องเป็นรายการที่รอดำเนินการ' };
        row.status = 'settled'; row.settledOn = settledOn;
      } else {
        if (row.status === 'void') return { row };
        if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 200) return { status: 400, message: 'ระบุเหตุผลการยกเลิกอย่างน้อย 3 ตัวอักษร' };
        row.status = 'void';
      }
      row.history.push({ at: new Date().toISOString(), action: action === 'settle' ? 'ยืนยันรับ/จ่ายแล้ว' : 'ยกเลิกรายการ', reason: action === 'void' ? reason.trim() : undefined }); return { row };
    });
    if (result.status) return res.status(result.status).json({ message: result.message });
    return res.json(result.row);
  }));
  router.use((err: Error, _req: any, res: any, _next: any) => { console.error(err); res.status(500).json({ message: 'ไม่สามารถบันทึกข้อมูลบัญชี กรุณาลองใหม่' }); });
  const recordGame = (sessionId: string, playerId: string, playerName: string, title: string, amount: number) => {
    const entries = read<FinanceRow[]>(ledgerFile, []);
    const reference = `${sessionId}:${playerId}`;
    const existing = entries.find(r => r.source === 'game' && r.reference === reference); if (existing) return existing.id;
    const row: FinanceRow = { id: randomUUID(), type: 'income', category: 'game', amount: Math.round(amount * 100), description: title, counterparty: playerName, date: thaiDate(), settledOn: thaiDate(), status: 'settled', method: 'card', source: 'game', reference, createdAt: new Date().toISOString(), history: [{ at: new Date().toISOString(), action: 'ชำระค่าก๊วนจำลอง' }] };
    save(ledgerFile, [row, ...entries]); return row.id;
  };
  return { router, recordGame, requireAdmin };
}
