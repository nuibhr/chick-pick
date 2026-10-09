import type { ReceiptSubmission } from '../src/marketplaceTypes';
import { TidbDocuments, type Audit } from './tidbDocuments';
import { adminCookie, authenticateAdmin, clearAdminCookie, digest, limitAuth, organizerKey, type Organizer } from './pilotAuth';
import { admit, book, cancel, fail, PilotError, receiptEligibility, review, submitReceipt, transferAccount, unavailableOcr, type Actor } from './pilotDomain';
import { configure, createEntry, csv, report, revenueReport, settle, updateEntry } from './financeDomain';
import { authorize, changeMember, claim, emptyTeam, invite, publicTeam, teamKey, type Team, type Member } from './adminTeam';
import { bookLesson, cancelLesson, changeCoachSlot, coachAdmin, coachCatalog, completeLesson, createCoachSlot, lessonReceiptEligibility, lessonView, reviewLessonReceipt, saveCoach, submitLessonReceipt } from './coachingDomain';
import { saveVenue } from './venues';
import { recordVerifiedTransfer } from './receiptVerification';
import { bookingReadiness } from './bookingReadiness';
import { memberRoles, permissions } from '../src/adminRoles';
import type { Venue } from '../src/venueTypes';
import { paymentRow, syncPayment, stripeReadiness, stripeWebhook, type StripeEnv } from './stripePayments';
import { checkSlipOkConnection, slipokConfigured, type SlipOkEnv } from './slipok';
import { checkStoredReceipt } from './slipokReceipts';
import { configuredChannels, parsePaymentChannels, transferOptions, paymentChannelId, validPaymentChannelId, type TransferSettings } from '../src/paymentChannels';
import { createQrTicket, readQrTicket, paymentQrPayload, paymentQrPng, paymentQrPage } from './paymentQr';
import { paymentQrPhone } from '../src/paymentChannels';
import { stripeLocksPayment } from '../src/paymentTypes';
import { expiredHoldMessage, paymentHoldExpired } from '../src/bookingHold';
import { catalogManagement, deleteCatalogEntry, pauseSession, saveSession, type CatalogKind } from './catalogManagement';

export type ReceiptKV = { put(key: string, value: ArrayBuffer): Promise<void>; get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>; delete(key: string): Promise<void> };
export type PilotEnv = StripeEnv & SlipOkEnv & { TIDB_DATABASE_URL?: string; LINE_CHANNEL_ID?: string; VITE_LIFF_ID?: string; ADMIN_SESSION_SECRET?: string; ADMIN_PAIRING_TOKEN?: string; RECEIPTS?: ReceiptKV };
type Verify = (token: string, channel: string) => Promise<Actor>;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
async function bytes(request: Request, maximum: number) {
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > maximum) { await reader.cancel(); fail(413, 'ไฟล์หรือข้อมูลยาวเกินกำหนด'); } chunks.push(chunk.value); }
  const value = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { value.set(chunk, offset); offset += chunk.length; } return value;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) fail(415, 'ส่งข้อมูลเป็น JSON');
  try { const v = JSON.parse(new TextDecoder().decode(await bytes(request, 8192))); if (!v || typeof v !== 'object' || Array.isArray(v)) fail(400, 'ข้อมูลไม่ถูกต้อง'); return v; }
  catch (e) { if (e instanceof PilotError) throw e; return fail(400, 'JSON ไม่ถูกต้อง'); }
}
async function identity(request: Request, env: PilotEnv, verify: Verify) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S{20,4096})$/)?.[1];
  if (!env.LINE_CHANNEL_ID) fail(503, 'ยังไม่เชื่อม LINE');
  if (!token) fail(401, 'เข้าสู่ระบบ LINE ก่อน');
  try { return await verify(token, env.LINE_CHANNEL_ID); } catch { return fail(401, 'ยืนยัน LINE ไม่สำเร็จ กรุณาเปิดแอปใหม่'); }
}
function validImage(v: Uint8Array, type: string) {
  if (type === 'image/jpeg') return v.length > 3 && v[0] === 255 && v[1] === 216 && v[2] === 255;
  if (type === 'image/png') return v.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i) => v[i] === b);
  if (type === 'image/webp') return v.length >= 12 && new TextDecoder().decode(v.slice(0,4)) === 'RIFF' && new TextDecoder().decode(v.slice(8,12)) === 'WEBP';
  return false;
}
const audit = (actor: Actor, action: string, entityId: string, admin = false): Audit => ({ actorId: actor.sub, action, entityId, actorType: admin ? 'admin' : 'line', entityType: action.startsWith('receipt.') ? 'receipt' : action.startsWith('session.') ? 'session' : action.startsWith('booking.') || action.startsWith('admission.') ? 'booking' : 'settings' });

export async function pilotRequest(request: Request, env: PilotEnv, verify: Verify): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const playerMutation = path === '/api/player/bookings' && request.method === 'POST' || /^\/api\/player\/bookings\/[^/]+\/(receipt|cancel)$/.test(path);
  const coachPlayer = path === '/api/player/lessons' || /^\/api\/player\/lessons\/[^/]+\/(receipt|cancel)$/.test(path);
  const coachPublic = path === '/api/coach-catalog' || path === '/api/venues';
  const stripePlayer = path === '/api/player/payments/checkout' || path === '/api/player/payments/sync';
  const qrPlayer = ['/api/player/payments/qr', '/api/player/payments/qr/image', '/api/player/payments/qr/view'].includes(path);
  const handled = stripePlayer || path === '/api/stripe/webhook' || path === '/api/player/config' || path.startsWith('/api/finance/') || path.startsWith('/api/marketplace') || path === '/api/coaching' || path.startsWith('/api/coaching/') || coachPublic || coachPlayer || playerMutation;
  if (!handled && !qrPlayer) return null;
  try {
    if (!['GET', 'POST'].includes(request.method)) fail(405, 'วิธีส่งคำขอไม่รองรับ');
    if (request.method === 'POST' && (request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.has('Origin') && request.headers.get('Origin') !== new URL(request.url).origin)) fail(403, 'ไม่อนุญาตคำขอข้ามเว็บไซต์');
    if (!env.TIDB_DATABASE_URL) fail(503, 'ฐานข้อมูลยังไม่พร้อม');
    const db = new TidbDocuments(env.TIDB_DATABASE_URL);
    const stripe = stripeReadiness(env);
    if (qrPlayer) {
      if (!env.ADMIN_SESSION_SECRET) fail(503, 'ระบบ QR ยังไม่พร้อม');
      let claims;
      if (path === '/api/player/payments/qr') {
        if (request.method !== 'POST') fail(405, 'ใช้ POST');
        const actor = await identity(request, env, verify), v = await body(request);
        if (!['game', 'coaching'].includes(String(v.kind)) || typeof v.id !== 'string' || !validPaymentChannelId(v.channel)) fail(400, 'เลือกช่องทางและการจองที่ถูกต้อง');
        const row = paymentRow(await db.readFinance(), v.kind as 'game' | 'coaching', v.id as string);
        if (row.playerId !== 'line:' + actor.sub) fail(404, 'ไม่พบการจองของคุณ');
        claims = { kind: v.kind as 'game' | 'coaching', id: v.id as string, channel: v.channel as string };
      } else {
        if (request.method !== 'GET') fail(405, 'ใช้ GET');
        claims = await readQrTicket(env.ADMIN_SESSION_SECRET, new URL(request.url).searchParams.get('ticket') || '');
        if (!claims) fail(410, 'ลิงก์ QR หมดอายุหรือไม่ถูกต้อง กลับไปเปิด QR จากรายการจองใน LINE');
      }
      const row = paymentRow(await db.readFinance(), claims.kind, claims.id);
      if (row.cancelledAt || row.paidAt || row.receipts?.at(-1)?.status === 'pending' || stripeLocksPayment(row.stripe)) fail(409, 'รายการนี้ไม่เปิด QR สำหรับการโอนซ้ำ');
      if (paymentHoldExpired(row)) fail(410, expiredHoldMessage);
      const account = transferOptions(row.transferAccount).find(c => paymentChannelId(c) === claims.channel);
      if (!account) fail(404, 'ช่องทางนี้ไม่ได้อยู่ในการจอง');
      const amount = claims.kind === 'game' ? row.amount : Math.round(row.amount * 100);
      let payload: string; try { payload = paymentQrPayload(account, amount); } catch { return fail(409, 'ยังไม่ได้เพิ่ม QR รับเงินของธนาคารสำหรับการจองนี้ ใช้เลขบัญชีที่แสดง'); }
      if (path === '/api/player/payments/qr') {
        const ticket = await createQrTicket(env.ADMIN_SESSION_SECRET, claims, Date.now(), row.holdExpiresAt);
        return json({ url: new URL('/api/player/payments/qr/view?ticket=' + ticket, request.url).href });
      }
      const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
      if (path.endsWith('/view')) return new Response(paymentQrPage(new URL(request.url).searchParams.get('ticket')!, account.accountName, amount, !paymentQrPhone(account), row.holdExpiresAt), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" } });
      return new Response(await paymentQrPng(payload), { headers: { ...headers, 'Content-Type': 'image/png', 'Content-Disposition': (new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline') + '; filename="chick-pick-payment-qr.png"' } });
    }
    if (path === '/api/stripe/webhook') {
      if (request.method !== 'POST') fail(405, 'ใช้ POST');
      return json(await stripeWebhook(db, env, new TextDecoder().decode(await bytes(request, 512 * 1024)), request.headers.get('Stripe-Signature') || ''));
    }
    if (stripePlayer) {
      if (request.method !== 'POST') fail(405, 'ใช้ POST');
      const actor = await identity(request, env, verify), v = await body(request);
      if (!['game', 'coaching'].includes(String(v.kind)) || typeof v.id !== 'string' || v.id.length > 120) fail(400, 'เลือกการจองที่ถูกต้อง');
      if (path.endsWith('/checkout')) {
        const row = paymentRow(await db.readFinance(), v.kind as 'game' | 'coaching', v.id as string);
        if (row.playerId !== 'line:' + actor.sub) fail(404, 'ไม่พบการจองของคุณ');
        fail(410, 'ปิดการชำระใหม่ผ่าน Stripe แล้ว กรุณาโอนและแนบสลิปตามรายการจอง');
      }
      return json(await syncPayment(db, env, actor, v.kind as 'game' | 'coaching', v.id as string));
    }
    if (coachPublic) {
      if (request.method !== 'GET') fail(405, 'ใช้ GET');
      if (path === '/api/venues') return json({ venues: (await db.readDocument<Venue[]>('court-venues', [])).filter(v => v.active) });
      const [docs, settings, account, owner] = await Promise.all([db.readFinance(), db.readDocument<{ bookingEnabled?: boolean; paymentProvider?: 'manual' | 'stripe' }>('worker-pilot', {}), db.readTransferAccount(), db.readDocument<Partial<Organizer>>(organizerKey, {})]);
      return json(coachCatalog(docs, Boolean(settings.bookingEnabled && owner.sub && env.ADMIN_SESSION_SECRET && account && env.RECEIPTS)));
    }
    if (path === '/api/player/config') {
      const [settings, account, owner] = await Promise.all([db.readDocument<{ bookingEnabled?: boolean; paymentProvider?: 'manual' | 'stripe' }>('worker-pilot', {}), db.readTransferAccount(), db.readDocument<Partial<Organizer>>(organizerKey, {})]);
      return json({ liffId: env.VITE_LIFF_ID || null, connected: Boolean(env.LINE_CHANNEL_ID && env.VITE_LIFF_ID), profileEditingEnabled: Boolean(env.LINE_CHANNEL_ID && env.VITE_LIFF_ID), bookingEnabled: Boolean(settings.bookingEnabled && owner.sub && env.ADMIN_SESSION_SECRET && account && env.RECEIPTS), pilot: true, paymentProvider: 'manual', slipVerification: slipokConfigured(env) ? 'slipok' : 'manual', slipokConfigured: slipokConfigured(env), stripeRetired: true, stripeConfigured: stripe.configured, stripeMode: stripe.mode });
    }
    if (path === '/api/finance/auth') {
      const owner = await db.readDocument<Partial<Organizer>>(organizerKey, {});
      if (request.method === 'GET') {
        let admin = null; try { admin = await authenticateAdmin(request, env.ADMIN_SESSION_SECRET, db); } catch { /* Public readiness contains no identity. */ }
        return json({ authenticated: Boolean(admin), ...(admin ? { role: admin.role, roles: admin.roles, name: admin.name } : {}), setupRequired: false, authMethod: 'line', pairingRequired: !owner.sub, liffId: env.VITE_LIFF_ID || null, configured: Boolean(env.ADMIN_SESSION_SECRET && env.LINE_CHANNEL_ID && env.VITE_LIFF_ID && (owner.sub || env.ADMIN_PAIRING_TOKEN)) });
      }
      if (!env.ADMIN_SESSION_SECRET || !env.LINE_CHANNEL_ID) fail(503, 'ระบบแอดมิน LINE ยังไม่พร้อม');
      await limitAuth(db, request.headers.get('CF-Connecting-IP') || 'unknown');
      const v = await body(request);
      if (typeof v.idToken !== 'string' || v.idToken.length < 20 || v.idToken.length > 4096) fail(401, 'เข้าสู่ LINE ก่อน');
      let actor: Actor; try { actor = await verify(String(v.idToken), env.LINE_CHANNEL_ID); } catch { return fail(401, 'ยืนยันบัญชี LINE ไม่สำเร็จ'); }
      let member: Member | undefined;
      if (!owner.sub) {
        if (!env.ADMIN_PAIRING_TOKEN || typeof v.pairingToken !== 'string' || !/^[A-Za-z0-9]{12}$/.test(v.pairingToken.trim()) || await digest(v.pairingToken.trim().toUpperCase()) !== await digest(env.ADMIN_PAIRING_TOKEN)) fail(403, 'รหัสผูกเจ้าของ 12 ตัวไม่ถูกต้อง');
        await db.updateDocument<Partial<Organizer>, void>(organizerKey, {}, saved => {
          if (saved.sub) fail(409, 'มีเจ้าของแล้ว กรุณาล็อกอินใหม่');
          Object.assign(saved, { sub: actor.sub, name: actor.name, linkedAt: new Date().toISOString() });
        }, audit(actor, 'organizer.linked', organizerKey, true));
      } else if (owner.sub !== actor.sub) {
        const team = await db.readDocument<Team>(teamKey, emptyTeam());
        member = team.members.find(m => m.sub === actor.sub && m.active);
        if (!member) member = await db.updateDocument<Team, Member>(teamKey, emptyTeam(), value => claim(value, actor, v.pairingToken), audit(actor, 'admin.invitation.claimed', teamKey, true));
      }
      return json({ authenticated: true, role: member?.role || 'owner', roles: member ? memberRoles(member) : ['owner'] }, 200, { 'Set-Cookie': await adminCookie(env.ADMIN_SESSION_SECRET, { ...actor, linkedAt: '', version: member?.version }) });
    }
    if (path === '/api/finance/logout') { if (request.method !== 'POST') fail(405, 'ใช้ POST'); return json({ success: true }, 200, { 'Set-Cookie': clearAdminCookie() }); }
    if (coachPlayer) {
      const actor = await identity(request, env, verify);
      if (path === '/api/player/lessons') {
        if (request.method === 'GET') return json({ lessons: (await db.readFinance()).coaching.filter(e => e.playerId === 'line:' + actor.sub).map(e => lessonView(e)) });
        const v = await body(request), [settings, account, owner] = await Promise.all([db.readDocument<{ bookingEnabled?: boolean; paymentProvider?: 'manual' | 'stripe' }>('worker-pilot', {}), db.readTransferAccount(), db.readDocument<Partial<Organizer>>(organizerKey, {})]);
        if (!owner.sub || !env.ADMIN_SESSION_SECRET || !env.RECEIPTS) fail(503, 'ผู้จัดยังไม่พร้อมรับจอง');
        const result = await db.updateFinance((docs, context) => bookLesson(docs, actor, v.slotId, context.enabled, context.account || undefined, false), audit(actor, 'coaching.booked', String(v.slotId)));
        return json({ ...result, message: 'จองเวลาแล้ว แนบสลิปและรอผู้จัดตรวจเงิน' }, result.repeated ? 200 : 201);
      }
      if (request.method !== 'POST') fail(405, 'ใช้ POST');
      const match = path.match(/^\/api\/player\/lessons\/([^/]+)\/(receipt|cancel)$/)!, id = decodeURIComponent(match[1]);
      if (match[2] === 'cancel') return json(await db.updateFinance(docs => cancelLesson(docs, actor, id), audit(actor, 'coaching.cancelled', id)));
      if (!env.RECEIPTS) fail(503, 'ที่เก็บสลิปยังไม่พร้อม');
      lessonReceiptEligibility(await db.readFinance(), actor, id);
      const type = request.headers.get('Content-Type')?.split(';')[0].toLowerCase() || '', image = await bytes(request, 5 * 1024 * 1024);
      if (!validImage(image, type)) fail(415, 'รับภาพ JPG PNG WebP ไม่เกิน 5 MB');
      await limitAuth(db, actor.sub, true);
      const receiptId = crypto.randomUUID(), hash = await digest(image);
      const receipt: ReceiptSubmission = { id: receiptId, fileName: receiptId, mimeType: type as ReceiptSubmission['mimeType'], size: image.length, sha256: hash, submittedAt: new Date().toISOString(), status: 'pending', ocr: unavailableOcr(), ...(slipokConfigured(env) ? { verification: { provider: 'slipok' as const, status: 'unavailable' as const, checkedAt: new Date().toISOString(), message: 'รอเริ่มตรวจ SlipOK' } } : {}) };
      await env.RECEIPTS.put('receipt:' + receiptId, new Uint8Array(image).buffer);
      try { await db.updateFinance(docs => submitLessonReceipt(docs, actor, id, receipt), audit(actor, 'coaching.receipt.submitted', receiptId)); }
      catch (e) { if (e instanceof PilotError) await env.RECEIPTS.delete('receipt:' + receiptId); throw e; }
      const verification = slipokConfigured(env) ? await checkStoredReceipt(db, env, 'coaching', id, receiptId, audit(actor, 'slipok.checked', receiptId)) : undefined;
      return json({ receipt: { id: receiptId, status: 'pending', verification } }, 201);
    }
    if (playerMutation) {
      if (request.method !== 'POST') fail(405, 'ใช้ POST');
      const actor = await identity(request, env, verify);
      if (path === '/api/player/bookings') {
        const v = await body(request); if (typeof v.sessionId !== 'string' || v.sessionId.length > 120) fail(400, 'รหัสก๊วนไม่ถูกต้อง');
        const owner = await db.readDocument<Partial<Organizer>>(organizerKey, {});
        const settings = await db.readDocument<{ paymentProvider?: 'manual' | 'stripe' }>('worker-pilot', {});
        if (!owner.sub || !env.ADMIN_SESSION_SECRET || !env.RECEIPTS) fail(503, 'ผู้จัดยังไม่พร้อมรับจอง');
        const result = await db.updateMarketplace((data, ctx) => book(data, { ...ctx, paymentProvider: 'manual' }, actor, v.sessionId as string), audit(actor, 'booking.requested', String(v.sessionId)), true);
        return json({ booking: { id: result.id }, repeated: result.repeated, message: 'ถือที่นั่งให้ 5 นาที · โอนและส่งสลิปให้ถึงระบบก่อนหมดเวลา' }, result.repeated ? 200 : 201);
      }
      const match = path.match(/^\/api\/player\/bookings\/([^/]+)\/(receipt|cancel)$/)!; const id = decodeURIComponent(match[1]);
      if (match[2] === 'cancel') return json(await db.updateMarketplace(data => cancel(data, actor, id), audit(actor, 'booking.cancelled', id), true));
      if (!env.RECEIPTS) fail(503, 'ที่เก็บสลิปยังไม่พร้อม');
      receiptEligibility(await db.readMarketplace(), actor, id); // Authorize before accepting image bytes or writing KV.
      const type = request.headers.get('Content-Type')?.split(';')[0].toLowerCase() || '';
      const image = await bytes(request, 5 * 1024 * 1024);
      if (!validImage(image, type)) fail(415, 'รับเฉพาะภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB');
      await limitAuth(db, actor.sub, true);
      const receiptId = crypto.randomUUID(), hash = await digest(image);
      const receipt: ReceiptSubmission = { id: receiptId, fileName: `${receiptId}.${type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'}`, mimeType: type as ReceiptSubmission['mimeType'], size: image.length, sha256: hash, submittedAt: new Date().toISOString(), status: 'pending', ocr: unavailableOcr(), ...(slipokConfigured(env) ? { verification: { provider: 'slipok' as const, status: 'unavailable' as const, checkedAt: new Date().toISOString(), message: 'รอเริ่มตรวจ SlipOK' } } : {}) };
      await env.RECEIPTS.put(`receipt:${receiptId}`, new Uint8Array(image).buffer);
      try { await db.updateFinance(docs => { const b = receiptEligibility(docs.marketplace, actor, id); if (docs['revenue-settlements'].some(s => s.key === `game:${b.sessionId}`)) fail(409, 'ก๊วนปิดยอดแล้ว'); if (docs.coaching.some(e => e.receipts?.some(r => r.sha256 === receipt.sha256 && r.status !== 'rejected'))) fail(409, 'ภาพสลิปนี้ใช้กับการเรียนแล้ว'); submitReceipt(docs.marketplace, actor, id, receipt); }, audit(actor, 'receipt.submitted', receiptId)); }
      catch (e) {
        // Business rejection happened before commit. A network error may have happened after commit;
        // retain the image in that case so a paid booking never loses its evidence.
        if (e instanceof PilotError) await env.RECEIPTS.delete(`receipt:${receiptId}`);
        throw e;
      }
      const verification = slipokConfigured(env) ? await checkStoredReceipt(db, env, 'game', id, receiptId, audit(actor, 'slipok.checked', receiptId)) : undefined;
      return json({ receipt: { id: receiptId, status: 'pending', ocr: receipt.ocr, verification }, message: 'ส่งสลิปแล้ว รอแอดมินอนุมัติเงินและเลือกเข้าสนาม' }, 201);
    }
    const owner = await authenticateAdmin(request, env.ADMIN_SESSION_SECRET, db);
    authorize(owner.roles, path, request.method);
    const verifyReceipt = path.match(/^\/api\/(marketplace\/bookings|coaching\/enrollments)\/([^/]+)\/receipts\/([^/]+)\/verify$/);
    if (verifyReceipt) {
      if (request.method !== 'POST') fail(405, 'ใช้ POST');
      await limitAuth(db, 'slipok:' + owner.sub, true);
      return json(await checkStoredReceipt(db, env, verifyReceipt[1] === 'marketplace/bookings' ? 'game' : 'coaching', decodeURIComponent(verifyReceipt[2]), decodeURIComponent(verifyReceipt[3]), audit(owner, 'slipok.checked', verifyReceipt[3], true)));
    }
    if (path === '/api/marketplace/setup/slipok') {
      if (request.method !== 'GET') fail(405, 'ใช้ GET');
      return json(await checkSlipOkConnection(env));
    }
    const deletion = path.match(/^\/api\/(marketplace\/(venues|sessions)|coaching\/(coaches|slots))\/([^/]+)\/delete$/);
    if (deletion && request.method === 'POST') {
      await body(request);
      const kind = ({ venues: 'venue', sessions: 'game', coaches: 'coach', slots: 'slot' } as const)[(deletion[2] || deletion[3]) as 'venues' | 'sessions' | 'coaches' | 'slots'];
      return json(await db.updateFinance(d => deleteCatalogEntry(d, kind as CatalogKind, deletion[4]), { ...audit(owner, `${kind}.deleted`, deletion[4], true), entityType: kind }));
    }
    if (path === '/api/marketplace/venues' && request.method === 'GET') {
      const docs = await db.readFinance();
      return json({ venues: (docs['court-venues'] || []).map(v => ({ ...v, management: catalogManagement(docs, 'venue', v.id) })) });
    }
    if (/^\/api\/marketplace\/venues(?:\/[^/]+)?$/.test(path) && request.method === 'POST') {
      const v = await body(request), id = path.split('/')[4];
      return json(await db.updateFinance(d => {
        const existing = d['court-venues']?.find(row => row.id === id);
        if (existing && typeof v.name === 'string' && v.name.trim() !== existing.name && !catalogManagement(d, 'venue', existing.id).canDelete) fail(409, 'สนามนี้ถูกใช้งานแล้ว เก็บชื่อเดิมเพื่อรักษาการเชื่อมกับก๊วน โค้ช และประวัติ แก้ที่อยู่หรือซ่อนได้');
        return saveVenue(d['court-venues'] ||= [], v, id);
      }, audit(owner, 'venue.updated', id || 'new', true)), id ? 200 : 201);
    }
    if (path === '/api/coaching' && request.method === 'GET') return json(coachAdmin(await db.readFinance()));
    if (path.startsWith('/api/coaching/')) {
      const receiptPath = path.match(/^\/api\/coaching\/enrollments\/([^/]+)\/receipts\/([^/]+)(?:\/(review))?$/);
      if (receiptPath) {
        const [, id, receiptId, reviewAction] = receiptPath;
        if (request.method === 'POST' && reviewAction) { const v = await body(request); return json(await db.updateFinance(d => reviewLessonReceipt(d, id, receiptId, v), audit(owner, 'coaching.receipt.reviewed', receiptId, true))); }
        if (request.method !== 'GET' || reviewAction) fail(405, 'วิธีส่งไม่รองรับ');
        const docs = await db.readFinance(), receipt = docs.coaching.find(e => e.id === id)?.receipts?.find(r => r.id === receiptId);
        if (!receipt) fail(404, 'ไม่พบสลิป');
        const image = await env.RECEIPTS?.get('receipt:' + receiptId, 'arrayBuffer');
        if (!image) fail(503, 'ภาพยังไม่พร้อม กรุณาลองใหม่');
        return new Response(image, { headers: { 'Content-Type': receipt.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
      }
      if (request.method !== 'POST') fail(405, 'ใช้ POST');
      const v = await body(request), event = audit(owner, 'coaching.updated', String(v.id || path), true);
      if (path === '/api/coaching/coaches') return json(await db.updateFinance(d => saveCoach(d, v, undefined, owner.role === 'owner'), event), 201);
      if (path === '/api/coaching/slots') return json(await db.updateFinance(d => createCoachSlot(d, v), event), 201);
      const coach = path.match(/^\/api\/coaching\/coaches\/([^/]+)$/);
      if (coach) return json(await db.updateFinance(d => saveCoach(d, v, coach[1], owner.role === 'owner'), event));
      const slot = path.match(/^\/api\/coaching\/slots\/([^/]+)$/);
      if (slot) return json(await db.updateFinance(d => changeCoachSlot(d, slot[1], v), event));
      const enrollment = path.match(/^\/api\/coaching\/enrollments\/([^/]+)\/(cancel|complete)$/);
      if (enrollment) return json(await db.updateFinance(d => enrollment[2] === 'cancel' ? cancelLesson(d, owner, enrollment[1], true) : completeLesson(d, enrollment[1]), event));
      fail(404, 'ไม่พบเมนูโค้ช');
    }
    if (path === '/api/finance/admin-team') {
      if (request.method === 'GET') return json(publicTeam(await db.readDocument<Team>(teamKey, emptyTeam())));
      const v = await body(request);
      return json(await db.updateDocument<Team, unknown>(teamKey, emptyTeam(), value => v.action === 'invite' ? invite(value, v) : changeMember(value, v), audit(owner, `admin.team.${String(v.action)}`, String(v.id || teamKey), true)), v.action === 'invite' ? 201 : 200);
    }
    if (path.startsWith('/api/finance/')) {
      if (request.method === 'GET') {
        const docs = await db.readFinance();
        if (path === '/api/finance/revenue') return json(await revenueReport(docs));
        if (path === '/api/finance/report') return json(report(docs, new URL(request.url).searchParams));
        if (path === '/api/finance/export') return new Response(csv(report(docs, new URL(request.url).searchParams).rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="chick-pick-finance.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
        fail(404, 'ไม่พบเมนูการเงิน');
      }
      const v = await body(request), event = { actorId: owner.sub, actorType: 'admin' as const, entityType: 'finance', entityId: String(v.key || v.requestId || path) };
      if (path === '/api/finance/revenue/config') return json(await db.updateFinance(d => configure(d, v), { ...event, action: 'revenue.configured' }));
      if (path === '/api/finance/revenue/settle') return json(await db.updateFinance(d => settle(d, v), { ...event, action: 'revenue.closed' }), 201);
      if (path === '/api/finance/entries') { const r = await db.updateFinance(d => createEntry(d, v), { ...event, action: 'finance.created' }); return json(r.row, r.repeated ? 200 : 201); }
      const entry = path.match(/^\/api\/finance\/entries\/([^/]+)$/);
      if (entry) return json(await db.updateFinance(d => updateEntry(d, decodeURIComponent(entry[1]), v), { ...event, entityId: decodeURIComponent(entry[1]), action: `finance.${v.action}` }));
      fail(404, 'ไม่พบเมนูการเงิน');
    }
    if (path === '/api/marketplace' || path === '/api/marketplace/') {
      if (request.method !== 'GET') fail(405, 'ใช้ GET');
      const docs = await db.readFinance(); return json({ ...docs.marketplace, sessions: docs.marketplace.sessions.map(s => ({ ...s, management: catalogManagement(docs, 'game', s.id) })), demo: false, pilot: true });
    }
    if (path === '/api/marketplace/setup') {
      if (request.method !== 'GET') fail(405, 'ใช้ GET');
      const [account, venues, docs, pilot, transferSettings] = await Promise.all([db.readTransferAccount(), db.readDocument<Venue[]>('court-venues', []), db.readFinance(), db.readDocument<{ bookingEnabled: boolean; paymentProvider?: 'manual' | 'stripe' }>('worker-pilot', { bookingEnabled: false }), db.readDocument<TransferSettings | null>('transfer-account', null)]);
      return json({ transferAccount: permissions(owner.roles).receipts ? account : null, transferChannels: permissions(owner.roles).configure ? configuredChannels(transferSettings) : undefined, pilot: { ...pilot, paymentProvider: 'manual' }, ownerName: owner.name, role: owner.role, roles: owner.roles, ocrConfigured: false, slipokConfigured: slipokConfigured(env), slipokBranchId: env.SLIPOK_BRANCH_ID || null, stripeRetired: true, stripeConfigured: stripe.configured, stripeMode: stripe.mode, readiness: bookingReadiness(docs, venues, account, Boolean(env.RECEIPTS)) });
    }
    if (path === '/api/marketplace/setup/payment' && request.method === 'POST') {
      const v = await body(request);
      if (v.paymentProvider === 'stripe') fail(410, 'ยกเลิกการเปิด Stripe ใหม่แล้ว ใช้โอนและตรวจสลิปผ่าน SlipOK');
      if (v.paymentProvider !== 'manual') fail(400, 'เลือกโอนและแนบสลิป');
      await db.updateDocument<{ bookingEnabled: boolean; paymentProvider?: 'manual' | 'stripe' }, void>('worker-pilot', { bookingEnabled: false }, saved => { saved.paymentProvider = v.paymentProvider as 'manual' | 'stripe'; saved.bookingEnabled = false; }, audit(owner, 'payment.provider.updated', 'worker-pilot', true));
      return json({ paymentProvider: v.paymentProvider, bookingEnabled: false });
    }
    if (path === '/api/marketplace/setup/transfer-account' && request.method === 'POST') {
      const account = transferAccount(await body(request)); if (!account) fail(400, 'ระบุธนาคาร ชื่อบัญชี และเลขบัญชี 10–15 หลัก');
      await db.updateDocument('transfer-account', {} as Record<string, unknown>, saved => { if (saved.channels !== undefined) fail(409, 'ใช้หน้าช่องทางรับเงินเพื่อแก้บัญชีที่เปิด–ปิดได้'); Object.assign(saved, account); }, audit(owner, 'transfer_account.updated', 'transfer-account', true)); return json({ transferAccount: account });
    }
    if (path === '/api/marketplace/setup/transfer-channels' && request.method === 'POST') {
      const channels = parsePaymentChannels((await body(request)).channels);
      if (!channels) fail(400, 'ระบุชื่อผู้รับและเลขบัญชีให้ถูกต้อง พร้อมเพย์ใช้เบอร์มือถือไทย 10 หลัก บัญชีที่ผูกต้องระบุธนาคารและเลขบัญชีคู่กัน');
      await db.updateDocument<TransferSettings, void>('transfer-account', {}, saved => { saved.channels = channels; }, audit(owner, 'transfer_channels.updated', 'transfer-account', true));
      return json({ transferChannels: channels });
    }
    if (path === '/api/marketplace/setup/pilot' && request.method === 'POST') {
      const v = await body(request), settings = await db.readDocument<{ paymentProvider?: 'manual' | 'stripe' }>('worker-pilot', {}); if (typeof v.bookingEnabled !== 'boolean') fail(400, 'เลือกเปิดหรือปิดรับจอง');
      if (v.bookingEnabled && (!env.RECEIPTS || !(await db.readTransferAccount()))) fail(409, 'ตั้งบัญชีรับโอนและที่เก็บสลิปก่อน');
      if (v.bookingEnabled) {
        const [account, venues, docs] = await Promise.all([db.readTransferAccount(), db.readDocument<Venue[]>('court-venues', []), db.readFinance()]);
        if (!bookingReadiness(docs, venues, account, Boolean(env.RECEIPTS)).readyToOpen) fail(409, 'เพิ่มสนามที่เปิดแสดง และสร้างก๊วนหรือช่วงเวลาโค้ชในอนาคตที่สนามนั้นก่อนเปิดรับ');
      }
      await db.updateDocument('worker-pilot', { bookingEnabled: false }, saved => { saved.bookingEnabled = v.bookingEnabled as boolean; }, audit(owner, 'pilot.updated', 'worker-pilot', true)); return json({ bookingEnabled: v.bookingEnabled });
    }
    if (path === '/api/marketplace/sessions' && request.method === 'POST') {
      const v = await body(request);
      return json(await db.updateFinance(d => saveSession(d, v), audit(owner, 'session.created', 'new', true)), 201);
    }
    const sessionAction = path.match(/^\/api\/marketplace\/sessions\/([^/]+)\/(edit|pause)$/);
    if (sessionAction && request.method === 'POST') {
      const v = await body(request), [, id, action] = sessionAction;
      return json(await db.updateFinance(d => action === 'edit' ? saveSession(d, v, id) : pauseSession(d, id, v.paused), audit(owner, `session.${action}`, id, true)));
    }
    const receiptRoute = path.match(/^\/api\/marketplace\/bookings\/([^/]+)\/receipts\/([^/]+)(\/review)?$/);
    if (receiptRoute) {
      const [, bookingId, receiptId, reviewing] = receiptRoute;
      if (reviewing && request.method === 'POST') {
        const v = await body(request); return json(await db.updateFinance((docs, ctx) => {
          const result = review(docs.marketplace, ctx, bookingId, receiptId, v.action, v.reason, v.fundsChecked);
          if (v.action === 'approve') {
            const booking = docs.marketplace.bookings.find(b => b.id === bookingId)!;
            const receipt = booking.receipts!.find(r => r.id === receiptId)!;
            recordVerifiedTransfer(receipt, booking.amount, v, [...docs.marketplace.bookings, ...docs.coaching].flatMap(item => item.receipts || []));
          }
          return result;
        }, audit(owner, `receipt.${v.action}`, receiptId, true)));
      }
      if (reviewing || request.method !== 'GET') fail(405, 'วิธีส่งคำขอไม่รองรับ');
      const receipt = (await db.readMarketplace()).bookings.find(b => b.id === bookingId)?.receipts?.find(r => r.id === receiptId);
      if (!receipt) fail(404, 'ไม่พบสลิป');
      if (!env.RECEIPTS) fail(503, 'ที่เก็บสลิปยังไม่พร้อม');
      const image = await env.RECEIPTS.get(`receipt:${receipt.id}`, 'arrayBuffer');
      if (!image) fail(503, 'ภาพสลิปยังไม่พร้อม อาจกำลังจัดเก็บ กรุณาลองใหม่');
      return new Response(image, { headers: { 'Content-Type': receipt.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
    }
    const cancellation = path.match(/^\/api\/marketplace\/bookings\/([^/]+)\/cancel$/);
    if (cancellation && request.method === 'POST') return json(await db.updateMarketplace(data => cancel(data, owner, cancellation[1], true), audit(owner, 'booking.cancelled', cancellation[1], true)));
    const admission = path.match(/^\/api\/marketplace\/bookings\/([^/]+)\/admission$/);
    if (admission && request.method === 'POST') { const v = await body(request); return json(await db.updateMarketplace((data, ctx) => admit(data, ctx, admission[1], v.action), audit(owner, `admission.${v.action}`, admission[1], true), true)); }
    fail(503, 'เมนูนี้ยังไม่เปิดบน Cloudflare');
  } catch (e) {
    if (e instanceof PilotError) return json({ message: e.message }, e.status);
    console.error('Pilot request failed', e instanceof Error ? e.name : 'unknown');
    return json({ message: 'ระบบยังยืนยันรายการไม่ได้ กรุณาตรวจสถานะก่อนลองใหม่' }, 503);
  }
}
