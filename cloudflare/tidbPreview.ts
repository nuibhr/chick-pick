import { connect } from '@tidbcloud/serverless';
import type { Booking, MarketplaceData, MemberProfile, Session } from '../src/marketplaceTypes';
import { coaches } from '../server/coachCatalog';

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  TIDB_DATABASE_URL?: string;
  RECEIPTS?: unknown;
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

export function publicSession(session: Session, bookings: Booking[], profiles: MemberProfile[] = []) {
  const active = bookings.filter(booking => booking.sessionId === session.id && !booking.cancelledAt);
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
    tags: session.tags, startsAt: session.startsAt, status, participants,
    privateParticipantCount: admitted.length - participants.length,
  };
}

async function readMarketplace(connectionUrl: string): Promise<MarketplaceData> {
  const database = connect({ url: connectionUrl });
  const rows = await database.execute('SELECT payload FROM app_documents WHERE document_key = ?', ['marketplace']);
  if (!Array.isArray(rows) || !rows[0]) throw new Error('Marketplace document is missing');
  const payload = (rows[0] as Record<string, unknown>).payload;
  const data = (typeof payload === 'string' ? JSON.parse(payload) : payload) as MarketplaceData;
  if (!Array.isArray(data.sessions) || !Array.isArray(data.bookings)) throw new Error('Marketplace document is invalid');
  return data;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ message: 'ระบบนี้กำลังทดสอบการอ่านข้อมูลจาก TiDB ยังไม่เปิดรับจองหรือสลิป' }, 503);
    }
    if (pathname === '/api/player/config') {
      return json({ liffId: null, connected: false, bookingEnabled: false });
    }
    if (pathname === '/api/coach-catalog') {
      return json({ coaches, slots: [], bookingEnabled: false, demo: true });
    }
    if (pathname === '/api/player/sessions' || pathname === '/api/health') {
      if (!env.TIDB_DATABASE_URL) return json({ status: 'unavailable', mode: 'tidb-readonly-preview', database: 'not-configured' }, 503);
      try {
        const data = await readMarketplace(env.TIDB_DATABASE_URL);
        if (pathname === '/api/health') return json({
          status: 'ok', mode: 'tidb-readonly-preview', database: 'tidb',
          lineConfigured: false, ocrConfigured: false, receiptStorageConfigured: Boolean(env.RECEIPTS),
        });
        return json({ sessions: data.sessions.map(session => publicSession(session, data.bookings, data.profiles)) });
      } catch (error) {
        console.error('TiDB read failed', error instanceof Error ? error.name : 'unknown');
        return json({ message: 'อ่านข้อมูลก๊วนจาก TiDB ไม่สำเร็จ กรุณาลองใหม่ภายหลัง' }, 503);
      }
    }
    return json({ message: 'API นี้ยังไม่เปิดบน Workers preview' }, 503);
  },
};
