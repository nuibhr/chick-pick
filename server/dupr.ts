import { Router } from 'express';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { DuprRating, DuprProfile } from '../src/duprTypes';

type Options = { file?: string; baseUrl?: string; clientKey?: string; clientSecret?: string; enabled?: boolean; request?: typeof fetch };
const numericRating = (v: unknown): number | null => {
  if (v == null || v === '' || v === 'NR') return null;
  const n = Number(v); if (!Number.isFinite(n) || n < 2 || n > 8) throw new Error('รูปแบบคะแนนจาก DUPR ไม่ถูกต้อง'); return n;
};
export function parseDuprRating(result: any, expectedId: string): DuprRating {
  if (!result || (result.id ?? result.duprId) !== expectedId || typeof result.fullName !== 'string') throw new Error('ข้อมูลผู้เล่นจาก DUPR ไม่ตรงกับ ID');
  if (!result.ratings && !Object.hasOwn(result, 'singlesRating') && !Object.hasOwn(result, 'doublesRating')) throw new Error('คำตอบจาก DUPR ไม่มีข้อมูลคะแนน');
  const ratings = result.ratings;
  return { id: expectedId, name: result.fullName, singles: numericRating(ratings ? ratings.singles : result.singlesRating), doubles: numericRating(ratings ? ratings.doubles : result.doublesRating), singlesReliable: typeof ratings?.isSinglesReliable === 'boolean' ? ratings.isSinglesReliable : null, doublesReliable: typeof ratings?.isDoublesReliable === 'boolean' ? ratings.isDoublesReliable : null, fetchedAt: new Date().toISOString() };
}
export function duprRouter(options: Options = {}) {
  const file = options.file || path.resolve('data/dupr-profile.json');
  const base = (options.baseUrl ?? process.env.DUPR_API_BASE_URL ?? '').replace(/\/$/, '');
  const key = options.clientKey ?? process.env.DUPR_CLIENT_KEY, secret = options.clientSecret ?? process.env.DUPR_CLIENT_SECRET;
  let validBase = false;
  try { const url = new URL(base); validBase = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && !url.port && /(^|\.)(dupr\.com|mydupr\.com)$/.test(url.hostname); } catch {}
  const configured = Boolean(validBase && key && secret);
  const enabled = options.enabled ?? process.env.NODE_ENV !== 'production';
  const request = options.request || fetch;
  let saved: { id: string | null; rating: DuprRating | null; environment?: string } = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { id: null, rating: null };
  // Never carry sandbox ratings into a differently configured environment.
  if (saved.environment !== base) saved.rating = null;
  let error: string | null = null, nextAttempt = 0, token: string | null = null, expires = 0;
  let flight: Promise<void> | null = null;
  const persist = () => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify({ ...saved, environment: base }, null, 2)); renameSync(file + '.tmp', file); };
  const state = (): DuprProfile => ({ id: saved.id, configured, environment: !configured ? 'unconfigured' : new URL(base).hostname.startsWith('uat.') ? 'uat' : 'production', state: !configured ? 'not_configured' : !saved.id ? 'unlinked' : error ? 'error' : saved.rating ? 'ready' : 'unlinked', rating: configured ? saved.rating : null, message: !configured ? 'รอสิทธิ์ DUPR Partner API · ยังไม่ดึงคะแนนจริง' : error, pollSeconds: 300, nextRefreshAt: nextAttempt ? new Date(nextAttempt).toISOString() : null });
  const fetchJson = async (url: string, init: RequestInit) => {
    let res: Response;
    try { res = await request(url, { ...init, signal: AbortSignal.timeout(10000), redirect: 'error' }); } catch { throw new Error('เชื่อมต่อ DUPR ไม่สำเร็จ กรุณาลองใหม่ภายหลัง'); }
    if (!res.ok) {
      if (res.status === 401) { token = null; expires = 0; }
      if (res.status === 429) { const delay = Number(res.headers.get('retry-after')); nextAttempt = Date.now() + Math.max(300, Number.isFinite(delay) ? delay : 300) * 1000; }
      throw new Error(({ 401: 'DUPR ปฏิเสธสิทธิ์ API กรุณาตรวจการตั้งค่า', 403: 'สิทธิ์ไม่เพียงพอ หรือผู้เล่นยังไม่ได้เชื่อมบัญชียินยอมผ่าน DUPR SSO', 404: 'ไม่พบผู้เล่น DUPR ID นี้', 429: 'DUPR จำกัดจำนวนคำขอ ระบบจะรอแล้วลองใหม่', 417: 'สิทธิ์ API หมดอายุ กรุณาติดต่อ DUPR' } as Record<number, string>)[res.status] || 'DUPR ไม่พร้อมให้บริการในขณะนี้');
    }
    const data = await res.json(); if (data.status !== 'SUCCESS') throw new Error('DUPR ยังไม่สามารถส่งข้อมูลที่ยืนยันแล้วได้'); return data.result;
  };
  const refresh = async () => {
    if (!configured || !saved.id || Date.now() < nextAttempt) return;
    if (flight) return flight;
    const id = saved.id;
    flight = (async () => {
      nextAttempt = Date.now() + 300000;
      try {
        if (!token || Date.now() >= expires) {
          const result = await fetchJson(base + '/auth/v1.0/token', { method: 'POST', headers: { 'x-authorization': Buffer.from(`${key}:${secret}`).toString('base64') } });
          if (typeof result?.token !== 'string' || !result.token) throw new Error('ไม่สามารถรับโทเคนจาก DUPR');
          token = result.token; const expiry = Date.parse(result.expiry); expires = Number.isFinite(expiry) ? Math.min(expiry - 60000, Date.now() + 3300000) : Date.now() + 3300000;
        }
        const result = await fetchJson(base + '/user/v1.0/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + token } });
        const rating = parseDuprRating(result, id);
        if (saved.id === id) { saved.rating = rating; error = null; persist(); }
      } catch (e) { if (saved.id === id) error = (e as Error).message; }
      finally { flight = null; }
    })();
    return flight;
  };
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!enabled) return res.status(503).json({ message: 'ต้องเชื่อมระบบสมาชิกและยืนยันเจ้าของบัญชีก่อนเปิดใช้ DUPR ใน production' });
    if (req.method !== 'GET' && (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)))) return res.status(403).json({ message: 'ไม่อนุญาตคำขอข้ามเว็บไซต์' });
    next();
  });
  router.get('/', async (_req, res) => { await refresh(); res.json(state()); });
  router.post('/link', async (req, res, next) => {
    const id = typeof req.body.id === 'string' ? req.body.id.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{4,6}$/.test(id) || req.body.consent !== true) return res.status(400).json({ message: 'ตรวจ DUPR ID และยืนยันว่าเป็นข้อมูลโปรไฟล์ที่ต้องการแสดง' });
    try {
      if (flight) await flight;
      if (id !== saved.id) { saved = { id, rating: null }; error = null; nextAttempt = 0; persist(); }
      await refresh(); res.json(state());
    } catch (e) { next(e); }
  });
  router.post('/unlink', async (_req, res, next) => { try { saved = { id: null, rating: null }; error = null; persist(); res.json(state()); } catch (e) { next(e); } });
  router.use((_error: Error, _req: any, res: any, _next: any) => res.status(500).json({ message: 'บันทึกการเชื่อม DUPR ไม่สำเร็จ' }));
  return router;
}
