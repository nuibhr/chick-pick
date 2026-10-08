import type { Booking, MemberProfile, Session } from '../src/marketplaceTypes';
import { activeBooking, bookingHoldExpired } from '../src/marketplaceTypes';
import { stripePublicView } from '../src/paymentTypes';
import { stripeReadiness } from './stripePayments';
import type { StripeEnv } from './stripePayments';
import { slipokConfigured, type SlipOkEnv } from './slipok';
import { lessonView } from './coachingDomain';
import { TidbDocuments } from './tidbDocuments';
import { ownProfile, profileSettings, updateProfile } from '../server/playerProfiles';
import { pilotRequest, type ReceiptKV } from './pilot';
import { publicTransferAccount } from '../src/paymentChannels';
import { privateAssetPath, secureResponse } from './securityHeaders';

type Env = StripeEnv & SlipOkEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  TIDB_DATABASE_URL?: string;
  RECEIPTS?: ReceiptKV;
  LINE_CHANNEL_ID?: string;
  VITE_LIFF_ID?: string;
  ADMIN_SESSION_SECRET?: string;
  ADMIN_PAIRING_TOKEN?: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

const bangkokDay = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

function safeLinePicture(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'line-scdn.net' || url.hostname.endsWith('.line-scdn.net')) ? url.href : null;
  } catch { return null; }
}

type LineIdentity = { sub: string; name: string; picture: string | null };
class ProfileCooldown extends Error {}

export async function verifyLineIdToken(rawToken: string, channelId: string, requestFetch: typeof fetch = fetch): Promise<LineIdentity> {
  const response = await requestFetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: rawToken, client_id: channelId }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('LINE identity verification failed');
  const claims = await response.json() as Record<string, unknown>;
  if (claims.iss !== 'https://access.line.me' || claims.aud !== channelId ||
    typeof claims.sub !== 'string' || !claims.sub || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    throw new Error('Invalid LINE identity');
  }
  return {
    sub: claims.sub,
    name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 80) : 'ผู้เล่น LINE',
    picture: safeLinePicture(claims.picture),
  };
}

async function playerIdentity(request: Request, channelId: string | undefined): Promise<LineIdentity | Response> {
  if (!channelId) return json({ message: 'ยังไม่เชื่อม LINE Mini App' }, 503);
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S{20,4096})$/)?.[1];
  if (!token) return json({ message: 'กรุณาเข้าสู่ระบบผ่าน LINE' }, 401);
  try { return await verifyLineIdToken(token, channelId); }
  catch { return json({ message: 'ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาเปิดแอปใหม่' }, 401); }
}

export function publicSession(session: Session, bookings: Booking[], profiles: MemberProfile[] = [], venues?: import('../src/venueTypes').Venue[]) {
  const active = bookings.filter(booking => booking.sessionId === session.id && activeBooking(booking));
  const startsAt = Date.parse(session.startsAt);
  const upcoming = session.status !== 'completed' && Number.isFinite(startsAt) && startsAt > Date.now();
  const status = !upcoming ? 'completed' : active.length >= session.capacity ? 'full' : 'open';
  const day = Number.isFinite(startsAt) ? bangkokDay(new Date(startsAt)) : '';
  const admitted = upcoming ? active.filter(booking => booking.admissionStatus === 'approved') : [];
  const participants = admitted.flatMap(booking => {
    const profile = profiles.find(item => item.playerId === booking.playerId && item.discoverable === true);
    return profile ? [{ id: profile.id, name: profile.name, picture: safeLinePicture(profile.picture), skill: profile.skill, bio: profile.bio }] : [];
  });
  return {
    id: session.id, title: session.title, venue: session.venue, area: session.area,
    date: !day ? 'วันยังไม่ระบุ' : day === bangkokDay(new Date()) ? 'วันนี้' :
      day === bangkokDay(new Date(Date.now() + 86400000)) ? 'พรุ่งนี้' :
      new Date(startsAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }),
    time: session.time, price: session.price, joined: active.length, capacity: session.capacity,
    dupr: session.dupr, vibe: session.vibe, host: session.host, courtCount: session.courtCount,
    tags: session.tags, startsAt: session.startsAt, status, participants, bookingPaused: Boolean(session.bookingPaused) || !!venues && !venues.some(v => v.active && (session.venueId ? v.id === session.venueId : v.name === session.venue)),
    privateParticipantCount: admitted.length - participants.length,
  };
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    // A private document was accidentally placed in public/brand; never serve it.
    if (privateAssetPath(pathname)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (pathname === '/api/player/me/profile' && request.method === 'POST') {
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.has('Origin') && request.headers.get('Origin') !== new URL(request.url).origin) return json({ message: 'กรุณาบันทึกจากหน้าแอปโดยตรง' }, 403);
      const identity = await playerIdentity(request, env.LINE_CHANNEL_ID);
      if (identity instanceof Response) return identity;
      if (!env.TIDB_DATABASE_URL) return json({ message: 'ระบบบันทึกโปรไฟล์ยังไม่พร้อม' }, 503);
      if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return json({ message: 'ส่งข้อมูลโปรไฟล์เป็น JSON' }, 415);
      const reader = request.body?.getReader();
      let size = 0, raw = '';
      const decoder = new TextDecoder();
      try {
        if (reader) while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 4096) { await reader.cancel(); return json({ message: 'ข้อมูลโปรไฟล์ยาวเกินไป' }, 413); }
          raw += decoder.decode(chunk.value, { stream: true });
        }
        raw += decoder.decode();
        let value: unknown;
        try { value = JSON.parse(raw); } catch { return json({ message: 'ข้อมูลโปรไฟล์ไม่ถูกต้อง' }, 400); }
        const settings = profileSettings(value);
        if (!settings) return json({ message: 'เลือกระดับ 2.0–5.0 หรือยังไม่ระบุ และแนะนำตัวไม่เกิน 160 ตัวอักษร' }, 400);
        const profile = await new TidbDocuments(env.TIDB_DATABASE_URL).updateMarketplace(data => {
          const saved = data.profiles?.find(item => item.playerId === `line:${identity.sub}`);
          if (saved && Date.now() - Date.parse(saved.updatedAt) < 2000) throw new ProfileCooldown();
          return updateProfile(data, identity, settings);
        }, { actorId: identity.sub, action: 'profile.updated', entityId: `line:${identity.sub}` });
        return json({ profile });
      } catch (error) {
        if (error instanceof ProfileCooldown) return json({ message: 'เพิ่งบันทึกไป กรุณารอสักครู่แล้วลองใหม่' }, 429);
        return json({ message: 'บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่ ข้อมูลที่กรอกยังอยู่' }, 503);
      }
    }
    const pilot = await pilotRequest(request, env, verifyLineIdToken);
    if (pilot) return pilot;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ message: 'ระบบนี้กำลังทดสอบการอ่านข้อมูลจาก TiDB ยังไม่เปิดรับจองหรือสลิป' }, 503);
    }
    if (pathname === '/api/player/sessions' || pathname === '/api/health' ||
      pathname === '/api/player/me' || pathname === '/api/player/bookings') {
      if (!env.TIDB_DATABASE_URL) return json({ status: 'unavailable', mode: 'tidb-pilot-prepared', database: 'not-configured' }, 503);
      let identity: LineIdentity | undefined;
      if (pathname === '/api/player/me' || pathname === '/api/player/bookings') {
        const result = await playerIdentity(request, env.LINE_CHANNEL_ID);
        if (result instanceof Response) return result;
        identity = result;
      }
      try {
        const data = await new TidbDocuments(env.TIDB_DATABASE_URL).readMarketplace();
        if (pathname === '/api/health') return json({
          status: 'ok', mode: 'tidb-pilot-prepared', database: 'tidb',
          lineConfigured: Boolean(env.LINE_CHANNEL_ID && env.VITE_LIFF_ID),
          adminConfigured: Boolean(env.ADMIN_SESSION_SECRET && env.ADMIN_PAIRING_TOKEN),
          ocrConfigured: false, slipokConfigured: slipokConfigured(env), stripeRetired: true, stripeConfigured: stripeReadiness(env).configured, stripeMode: stripeReadiness(env).mode, receiptStorageConfigured: Boolean(env.RECEIPTS),
        });
        if (pathname === '/api/player/me' && identity) {
          return json({ name: identity.name, profile: ownProfile(data, identity) });
        }
        if (pathname === '/api/player/bookings' && identity) {
          const bookings = data.bookings.filter(booking => booking.playerId === `line:${identity.sub}`).map(booking => {
            const receipt = booking.receipts?.at(-1);
            return {
              id: booking.id, sessionId: booking.sessionId, amount: booking.amount, title: booking.title,
              transferAccount: publicTransferAccount(booking.transferAccount), createdAt: booking.createdAt,
              paidAt: booking.paidAt || null, admissionStatus: booking.admissionStatus || 'pending',
              cancelledAt: booking.cancelledAt || null,
              holdExpiresAt: booking.holdExpiresAt || null, holdExpired: bookingHoldExpired(booking),
              stripe: stripePublicView(booking.stripe), receipt: receipt ? { id: receipt.id, status: receipt.status, ocr: receipt.ocr, verification: receipt.verification, rejectReason: receipt.rejectReason || null } : null,
            };
          });
          const coaching = (await new TidbDocuments(env.TIDB_DATABASE_URL).readDocument<import('../src/coachingTypes').Enrollment[]>('coaching', [])).filter(e => e.playerId === `line:${identity.sub}`).map(lessonView);
          return json({ bookings: [...bookings.map(b => ({ ...b, kind: 'game' })), ...coaching], serverNow: Date.now() });
        }
        const venues = await new TidbDocuments(env.TIDB_DATABASE_URL).readDocument<import('../src/venueTypes').Venue[]>('court-venues', []);
        return json({ sessions: data.sessions.map(session => publicSession(session, data.bookings, data.profiles, venues)) });
      } catch (error) {
        console.error('TiDB read failed', error instanceof Error ? error.name : 'unknown');
        return json({ message: 'อ่านข้อมูลก๊วนจาก TiDB ไม่สำเร็จ กรุณาลองใหม่ภายหลัง' }, 503);
      }
    }
    return json({ message: 'API นี้ยังไม่เปิดบน Workers preview' }, 503);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return secureResponse(await handleRequest(request, env));
  },
};
