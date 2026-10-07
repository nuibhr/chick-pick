import Stripe from 'stripe';
import type { Booking } from '../src/marketplaceTypes';
import type { Enrollment } from '../src/coachingTypes';
import type { FinanceDocuments } from './financeDomain';
import { lessonHoldExpired } from '../src/coachingTypes';
import { fail, type Actor } from './pilotDomain';
import type { TidbDocuments } from './tidbDocuments';

export type StripeEnv = { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; PUBLIC_APP_URL?: string };
export type PaymentKind = 'game' | 'coaching';
type PaymentRow = Booking | Enrollment;
export function stripeReadiness(env: StripeEnv) {
  let origin = ''; try { const u = new URL(env.PUBLIC_APP_URL || ''); if (u.protocol === 'https:' && !u.username && !u.password) origin = u.origin; } catch {}
  const mode: 'live' | 'test' | null = /^sk_live_/.test(env.STRIPE_SECRET_KEY || '') ? 'live' : /^sk_test_/.test(env.STRIPE_SECRET_KEY || '') ? 'test' : null;
  return { configured: Boolean(mode && env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') && origin), mode, origin };
}
export const stripeClient = (env: StripeEnv) => new Stripe(env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 1, timeout: 12000 });
export function paymentRow(docs: FinanceDocuments, kind: PaymentKind, id: string): PaymentRow {
  const row = kind === 'game' ? docs.marketplace.bookings.find(b => b.id === id) : docs.coaching.find(e => e.id === id);
  if (!row) fail(404, 'ไม่พบการจอง'); return row;
}
const expected = (row: PaymentRow, kind: PaymentKind) => kind === 'game' ? row.amount : Math.round(row.amount * 100);
const unitKey = (row: PaymentRow, kind: PaymentKind) => kind === 'game' ? 'game:' + (row as Booking).sessionId : 'coaching:' + row.id;
export function prepareCheckout(docs: FinanceDocuments, actor: Actor, kind: PaymentKind, id: string, mode: 'test' | 'live') {
  const row = paymentRow(docs, kind, id);
  if (row.playerId !== 'line:' + actor.sub) fail(404, 'ไม่พบการจองของคุณ');
  if (row.cancelledAt || row.paidAt || row.receipts?.at(-1)?.status === 'pending' || docs['revenue-settlements'].some(s => s.key === unitKey(row, kind))) fail(409, 'รายการนี้ปิดรับชำระหรือมีสลิปรอตรวจ');
  if (row.stripe && row.stripe.status !== 'expired') {
    if (row.stripe.mode !== mode) fail(409, 'รายการนี้ใช้ Stripe คนละโหมด ติดต่อผู้จัด');
    if (row.stripe.status === 'paid' || row.stripe.status === 'test_paid' || row.stripe.status === 'requires_review') fail(409, 'ได้รับผลชำระแล้ว กรุณาตรวจสถานะการจอง');
    return { row: structuredClone(row), payment: structuredClone(row.stripe) };
  }
  const start = kind === 'game' ? docs.marketplace.sessions.find(s => s.id === (row as Booking).sessionId)?.startsAt : (row as Enrollment).lessons[0]?.start;
  if (!start || Date.parse(start) < Date.now() + 35 * 60000 || kind === 'coaching' && lessonHoldExpired(row as Enrollment)) fail(409, 'ต้องเหลือเวลาก่อนเริ่มอย่างน้อย 35 นาที และการจองยังไม่หมดอายุ');
  const amount = expected(row, kind);
  if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 10000000) fail(409, 'ยอดชำระ PromptPay ต้องอยู่ระหว่าง 10 ถึง 100,000 บาท');
  row.stripe = { attemptId: crypto.randomUUID(), status: 'creating', mode, amount, createdAt: new Date().toISOString() };
  return { row: structuredClone(row), payment: structuredClone(row.stripe) };
}
export function attachCheckout(docs: FinanceDocuments, kind: PaymentKind, id: string, attemptId: string, session: Stripe.Checkout.Session) {
  const row = paymentRow(docs, kind, id), p = row.stripe;
  if (!p || p.attemptId !== attemptId || row.cancelledAt) fail(409, 'การจองเปลี่ยนระหว่างสร้าง QR ติดต่อผู้จัด');
  if (!session.url || !session.url.startsWith('https://checkout.stripe.com/') || session.amount_total !== p.amount || session.currency !== 'thb' || session.metadata?.attemptId !== attemptId || session.livemode !== (p.mode === 'live')) fail(503, 'Stripe ส่งข้อมูลชำระที่ไม่ตรงกับการจอง');
  p.sessionId = session.id; p.url = session.url; p.expiresAt = new Date(session.expires_at * 1000).toISOString();
  if (p.status === 'creating') p.status = 'pending';
}
// Called only with a session retrieved server-side after signed webhook or owner-scoped sync.
export function applyStripeSession(docs: FinanceDocuments, session: Stripe.Checkout.Session, mode: 'test' | 'live', eventId: string) {
  const meta = session.metadata;
  if (meta?.app !== 'chick-pick' || !['game', 'coaching'].includes(meta.kind)) return { ignored: true };
  const kind = meta.kind as PaymentKind, row = paymentRow(docs, kind, meta.bookingId), p = row.stripe;
  if (!p || p.attemptId !== meta.attemptId || p.sessionId && p.sessionId !== session.id || p.mode !== mode || session.livemode !== (mode === 'live') || session.client_reference_id !== row.id || session.amount_total !== p.amount || p.amount !== expected(row, kind) || session.currency !== 'thb') fail(409, 'ข้อมูล Stripe ไม่ตรงกับยอดหรือรายการจอง');
  if (p.status === 'paid' || p.status === 'test_paid' || p.status === 'requires_review') return { repeated: true };
  p.sessionId = session.id;
  if (session.status === 'expired' && session.payment_status !== 'paid') { p.status = 'expired'; return { expired: true }; }
  if (session.payment_status !== 'paid') return { pending: true };
  const intent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const charge = intent && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  if (!intent || intent.status !== 'succeeded' || intent.amount_received !== p.amount || intent.currency !== 'thb' || !charge || charge.payment_method_details?.type !== 'promptpay') fail(409, 'ยังยืนยันยอด PromptPay ไม่ได้');
  const used = [...docs.marketplace.bookings, ...docs.coaching].some(other => other.id !== row.id && other.stripe?.paymentIntentId === intent.id);
  if (used) fail(409, 'ธุรกรรม Stripe นี้ผูกกับรายการอื่นแล้ว');
  if (mode === 'test') { p.status = 'test_paid'; p.paymentIntentId = intent.id; p.eventId = eventId; return { testPaid: true }; }
  const balance = charge.balance_transaction && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
  if (!balance || balance.currency !== 'thb' || !Number.isSafeInteger(balance.fee) || balance.fee < 0 || balance.fee > p.amount) fail(503, 'รอค่าธรรมเนียมจริงจาก Stripe กรุณาตรวจสถานะอีกครั้ง');
  p.paymentIntentId = intent.id; p.eventId = eventId; p.receivedAt = new Date(charge.created * 1000).toISOString(); p.fee = balance.fee;
  const key = unitKey(row, kind);
  const lessonConflict = kind === 'coaching' && docs.coaching.some(other => other.id !== row.id && !other.cancelledAt && !lessonHoldExpired(other) && other.coachId === (row as Enrollment).coachId && other.lessons.some(l => (row as Enrollment).lessons.some(m => l.status !== 'cancelled' && m.status !== 'cancelled' && Date.parse(l.start) < Date.parse(m.start) + m.hours * 3600000 && Date.parse(m.start) < Date.parse(l.start) + l.hours * 3600000)));
  if (row.cancelledAt || row.paidAt || docs['revenue-settlements'].some(s => s.key === key) || lessonConflict) {
    p.status = 'requires_review'; p.issue = 'Stripe รับเงินแล้ว แต่รายการถูกยกเลิก รับเงินทางอื่น ปิดยอด หรือเวลาชนกัน ต้องให้เจ้าของตรวจและคืนเงินผ่าน Stripe'; return { requiresReview: true };
  }
  p.status = 'paid'; row.paidAt = p.receivedAt; row.paymentMethod = 'transfer';
  if (kind === 'coaching') (row as Enrollment).payment = 'paid';
  // Fees reduce platform revenue before commissions; record each intent exactly once.
  if (balance.fee > 0 && !docs.finance.some(r => r.id === 'stripe_fee_' + intent.id)) docs.finance.push({ id: 'stripe_fee_' + intent.id, type: 'expense', category: 'other_expense', amount: balance.fee, description: 'ค่าธรรมเนียม Stripe PromptPay', counterparty: 'Stripe', date: new Date(charge.created * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }), settledOn: new Date(charge.created * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }), method: 'transfer', status: 'settled', source: 'manual', provider: 'stripe', reference: intent.id, createdAt: p.receivedAt, allocationKey: key, history: [{ at: p.receivedAt, action: 'Stripe ยืนยันค่าธรรมเนียมจริง' }] });
  return { paid: true };
}
const expandPayment = ['payment_intent.latest_charge.balance_transaction'];
export async function checkoutPayment(db: TidbDocuments, env: StripeEnv, actor: Actor, kind: PaymentKind, id: string) {
  const readiness = stripeReadiness(env); if (!readiness.configured || !readiness.mode) fail(503, 'ยังไม่ตั้งค่า Stripe และ webhook');
  const prepared = await db.updateFinance((docs, ctx) => { if (!ctx.enabled || ctx.paymentProvider !== 'stripe') fail(503, 'ผู้จัดยังไม่เปิดชำระด้วย Stripe'); return prepareCheckout(docs, actor, kind, id, readiness.mode!); }, { actorId: actor.sub, actorType: 'line', action: 'stripe.checkout.requested', entityId: id });
  const client = stripeClient(env), p = prepared.payment;
  if (p.sessionId) {
    const session = await client.checkout.sessions.retrieve(p.sessionId, { expand: expandPayment });
    await db.updateFinance(docs => applyStripeSession(docs, session, readiness.mode!, 'sync:' + session.id), { actorId: actor.sub, actorType: 'line', action: 'stripe.synced', entityId: id });
    if (session.status !== 'open' || session.payment_status === 'paid') return { refresh: true };
    return { url: session.url, mode: p.mode };
  }
  // Idempotency survives a lost network reply or a crash before local attachment.
  const session = await client.checkout.sessions.create({ mode: 'payment', payment_method_types: ['promptpay'], client_reference_id: id, metadata: { app: 'chick-pick', kind, bookingId: id, attemptId: p.attemptId }, line_items: [{ quantity: 1, price_data: { currency: 'thb', unit_amount: p.amount, product_data: { name: prepared.row.title } } }], success_url: readiness.origin + '/miniapp?organizer=0&view=tickets&payment=returned', cancel_url: readiness.origin + '/miniapp?organizer=0&view=tickets', expires_at: Math.floor(Date.parse(p.createdAt) / 1000) + 31 * 60 }, { idempotencyKey: 'chick-pick:' + p.attemptId });
  await db.updateFinance(docs => attachCheckout(docs, kind, id, p.attemptId, session), { actorId: actor.sub, actorType: 'line', action: 'stripe.checkout.created', entityId: id });
  return { url: session.url, mode: p.mode };
}
export async function syncPayment(db: TidbDocuments, env: StripeEnv, actor: Actor, kind: PaymentKind, id: string) {
  const ready = stripeReadiness(env); if (!ready.configured || !ready.mode) fail(503, 'Stripe ยังไม่พร้อม');
  const row = paymentRow(await db.readFinance(), kind, id);
  if (row.playerId !== 'line:' + actor.sub) fail(404, 'ไม่พบการจองของคุณ');
  if (!row.stripe?.sessionId) fail(409, 'ยังไม่มี QR สำหรับรายการนี้');
  const session = await stripeClient(env).checkout.sessions.retrieve(row.stripe.sessionId, { expand: expandPayment });
  return db.updateFinance(docs => applyStripeSession(docs, session, ready.mode!, 'sync:' + session.id), { actorId: actor.sub, actorType: 'line', action: 'stripe.synced', entityId: id });
}
export async function stripeWebhook(db: TidbDocuments, env: StripeEnv, raw: string, signature: string) {
  const ready = stripeReadiness(env); if (!ready.configured || !ready.mode) fail(503, 'Stripe webhook ยังไม่พร้อม');
  const client = stripeClient(env); let event: Stripe.Event;
  try { event = await client.webhooks.constructEventAsync(raw, signature, env.STRIPE_WEBHOOK_SECRET!, 300, Stripe.createSubtleCryptoProvider()); }
  catch { return fail(400, 'ลายเซ็น Stripe ไม่ถูกต้อง'); }
  if (event.livemode !== (ready.mode === 'live')) fail(400, 'Stripe event คนละโหมด');
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'].includes(event.type)) return { ignored: true };
  const payload = event.data.object as Stripe.Checkout.Session;
  if (payload.metadata?.app !== 'chick-pick') return { ignored: true };
  const session = await client.checkout.sessions.retrieve(payload.id, { expand: expandPayment });
  return db.updateFinance(docs => applyStripeSession(docs, session, ready.mode!, event.id), { actorId: 'stripe', actorType: 'admin', action: 'stripe.webhook.' + event.type, entityId: event.id });
}
