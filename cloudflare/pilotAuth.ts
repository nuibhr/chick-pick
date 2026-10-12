import { TidbDocuments } from './tidbDocuments';
import { fail } from './pilotDomain';
import { emptyTeam, teamKey, type Team } from './adminTeam';
import { memberRoles, type AdminRole } from '../src/adminRoles';

export type Organizer = { sub: string; name: string; linkedAt: string };
export type AdminIdentity = Organizer & { role: AdminRole; roles: AdminRole[]; version?: string };
export const organizerKey = 'worker-organizer';
const revokedSessionsKey = 'worker-revoked-admin-sessions';
type SessionClaims = { sub: string; version?: string; exp: number; nonce: string };
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function digest(value: string | Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value).buffer));
}
export const authCookieName = '__Host-cp_admin';
const cookie = (value: string, seconds: number) => `${authCookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
export const clearAdminCookie = () => cookie('', 0);
async function key(secret: string) { return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function adminCookie(secret: string, owner: Organizer & { version?: string }) {
  const payload = btoa(JSON.stringify({ sub: owner.sub, version: owner.version, exp: Date.now() + 1800000, nonce: crypto.randomUUID() }));
  const signature = hex(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload)));
  return cookie(`${payload}.${signature}`, 1800);
}

async function signedSession(request: Request, secret: string): Promise<{ raw: string; claims: SessionClaims } | null> {
  const raw = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(authCookieName + '='))?.slice(authCookieName.length + 1);
  if (!raw || raw.length > 2048) return null;
  try {
    const [payload, signature, extra] = raw.split('.');
    if (extra !== undefined || !payload || !/^[a-f0-9]{64}$/.test(signature || '')) return null;
    const bytes = Uint8Array.from(signature.match(/../g)!, x => parseInt(x, 16));
    if (!(await crypto.subtle.verify('HMAC', await key(secret), bytes, encoder.encode(payload)))) return null;
    const claims = JSON.parse(atob(payload));
    const now = Date.now();
    if (!claims || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 191
      || typeof claims.nonce !== 'string' || !claims.nonce || claims.nonce.length > 128
      || claims.version !== undefined && typeof claims.version !== 'string'
      || !Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp > now + 1800000) return null;
    return { raw, claims };
  } catch { return null; }
}

export async function revokeAdminSession(request: Request, secret: string, db: TidbDocuments): Promise<void> {
  const session = await signedSession(request, secret);
  // Missing, forged and expired cookies cannot fill the revocation store.
  if (!session) return;
  const fingerprint = await digest(session.raw);
  await db.updateDocument<Record<string, number>, void>(revokedSessionsKey, {}, revoked => {
    const now = Date.now();
    for (const [id, until] of Object.entries(revoked)) if (until <= now) delete revoked[id];
    if (!(fingerprint in revoked) && Object.keys(revoked).length >= 20000) fail(503, 'ยังยืนยันการออกจากระบบไม่ได้ กรุณาลองอีกครั้ง');
    revoked[fingerprint] = session.claims.exp;
  }, { actorId: session.claims.sub, actorType: 'admin', action: 'admin.session.revoked', entityType: 'session', entityId: fingerprint });
}

export async function authenticateAdmin(request: Request, secret: string | undefined, db: TidbDocuments) {
  if (!secret) fail(503, 'ระบบแอดมินยังไม่พร้อม');
  try {
    const session = await signedSession(request, secret);
    if (!session) throw Error('invalid');
    const { claims } = session;
    const revoked = await db.readDocument<Record<string, number>>(revokedSessionsKey, {});
    if (revoked[await digest(session.raw)] > Date.now()) throw Error('revoked');
    const owner = await db.readDocument<Partial<Organizer>>(organizerKey, {});
    if (!owner.sub) throw Error('unpaired');
    if (claims.sub === owner.sub) return { ...owner, role: 'owner', roles: ['owner'] } as AdminIdentity;
    const team = await db.readDocument<Team>(teamKey, emptyTeam());
    const member = team.members.find(m => m.sub === claims.sub && m.active && m.version === claims.version && memberRoles(m).length > 0);
    if (!member) throw Error('revoked');
    return { sub: member.sub, name: member.name, role: memberRoles(member)[0], roles: memberRoles(member), version: member.version, linkedAt: member.joinedAt } as AdminIdentity;
  } catch { return fail(401, 'สิทธิ์ผู้จัดหมดอายุหรือไม่ถูกต้อง กรุณาเข้า LINE ใหม่'); }
}
export async function limitAuth(db: TidbDocuments, ip: string, upload = false) {
  const fingerprint = await digest(ip);
  await db.updateDocument<Record<string, { count: number; until: number }>, void>(upload ? 'worker-upload-limits' : 'worker-auth-limits', {}, values => {
    for (const [k, v] of Object.entries(values)) if (v.until <= Date.now()) delete values[k];
    if (!values[fingerprint] && Object.keys(values).length >= 1000) fail(429, 'ระบบกำลังมีคำขอจำนวนมาก กรุณาลองใหม่ภายหลัง');
    const current = values[fingerprint] || { count: 0, until: Date.now() + (upload ? 86400000 : 900000) };
    if (current.count >= (upload ? 20 : 8)) fail(429, upload ? 'ส่งสลิปเกิน 20 ครั้งใน 24 ชั่วโมง ติดต่อผู้จัด' : 'ลองเข้าใช้หลายครั้งเกินไป รอ 15 นาที');
    current.count++; values[fingerprint] = current;
  });
}
