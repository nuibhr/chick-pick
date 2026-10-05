import { TidbDocuments } from './tidbDocuments';
import { fail } from './pilotDomain';
import { emptyTeam, teamKey, type Team } from './adminTeam';
import { isStaffRole, type AdminRole } from '../src/adminRoles';

export type Organizer = { sub: string; name: string; linkedAt: string };
export type AdminIdentity = Organizer & { role: AdminRole; version?: string };
export const organizerKey = 'worker-organizer';
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
export async function authenticateAdmin(request: Request, secret: string | undefined, db: TidbDocuments) {
  if (!secret) fail(503, 'ระบบแอดมินยังไม่พร้อม');
  const raw = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(authCookieName + '='))?.slice(authCookieName.length + 1);
  if (!raw || raw.length > 2048) fail(401, 'เข้าสู่ระบบ LINE ของผู้จัดก่อน');
  try {
    const [payload, signature, extra] = raw.split('.');
    if (extra || !/^[a-f0-9]{64}$/.test(signature)) throw Error('invalid');
    const bytes = Uint8Array.from(signature.match(/../g)!, x => parseInt(x, 16));
    if (!(await crypto.subtle.verify('HMAC', await key(secret), bytes, encoder.encode(payload)))) throw Error('invalid');
    const claims = JSON.parse(atob(payload));
    const owner = await db.readDocument<Partial<Organizer>>(organizerKey, {});
    if (!owner.sub || !Number.isFinite(claims.exp) || claims.exp <= Date.now() || claims.exp > Date.now() + 1800000) throw Error('expired');
    if (claims.sub === owner.sub) return { ...owner, role: 'owner' } as AdminIdentity;
    const team = await db.readDocument<Team>(teamKey, emptyTeam());
    const member = team.members.find(m => m.sub === claims.sub && m.active && m.version === claims.version && isStaffRole(m.role));
    if (!member) throw Error('revoked');
    return { sub: member.sub, name: member.name, role: member.role, version: member.version, linkedAt: member.joinedAt } as AdminIdentity;
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
