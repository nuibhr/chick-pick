import { memberRoles, permissions, type RoleSelection, type StaffRole } from '../src/adminRoles';
import type { Actor } from './pilotDomain';
import { fail } from './pilotDomain';
import { digest } from './pilotAuth';
export const teamKey = 'worker-admin-team';
export type Member = { id: string; sub: string; name: string; role: StaffRole; roles?: StaffRole[]; version: string; active: boolean; joinedAt: string };
type Invitation = { id: string; hash: string; role: StaffRole; roles?: StaffRole[]; expiresAt: string; createdAt: string; usedAt?: string; cancelledAt?: string };
export type Team = { members: Member[]; invitations: Invitation[] };
export const emptyTeam = (): Team => ({ members: [], invitations: [] });
export function publicTeam(team: Team) {
  return { members: team.members.map(({ sub, version, ...v }) => ({ ...v, roles: memberRoles(v) })), invitations: team.invitations.map(({ hash, ...v }) => ({ ...v, roles: memberRoles(v) })) };
}
export async function invite(team: Team, value: Record<string, unknown>) {
  const roles = memberRoles(value);
  if (!roles.length) return fail(400, 'เลือกสิทธิ์ทีมงานอย่างน้อยหนึ่งรายการ ไม่อนุญาตสร้างเจ้าของอีกคน');
  team.invitations = team.invitations.filter(i => Date.parse(i.expiresAt) > Date.now() && !i.usedAt && !i.cancelledAt);
  if (team.invitations.length >= 10) fail(409, 'มีคำเชิญรอใช้งานครบ 10 รายการ ยกเลิกคำเชิญเดิมก่อน');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = [...crypto.getRandomValues(new Uint8Array(12))].map(n => alphabet[n & 31]).join('');
  const row: Invitation = { id: crypto.randomUUID(), hash: await digest(code), role: roles[0], roles, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
  team.invitations.push(row);
  return { code, invitation: { id: row.id, role: row.role, roles, expiresAt: row.expiresAt } };
}
export async function claim(team: Team, actor: Actor, code: unknown) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9]{12}$/.test(code.trim())) return fail(403, 'ต้องได้รับรหัสเชิญ 12 ตัวจากเจ้าของ');
  const hash = await digest(code.trim().toUpperCase());
  const invitation = team.invitations.find(i => i.hash === hash && !i.usedAt && !i.cancelledAt && Date.parse(i.expiresAt) > Date.now());
  if (!invitation || !memberRoles(invitation).length) fail(403, 'คำเชิญไม่ถูกต้อง หมดอายุ หรือใช้แล้ว');
  let member = team.members.find(m => m.sub === actor.sub);
  if (member?.active) fail(409, 'บัญชีนี้เป็นทีมงานแล้ว ให้เข้าสู่ระบบโดยไม่ใส่รหัส');
  if (!member && team.members.length >= 100) fail(409, 'ทีมงานเต็มแล้ว');
  const roles = memberRoles(invitation);
  const values = { sub: actor.sub, name: actor.name, role: roles[0], roles, version: crypto.randomUUID(), active: true, joinedAt: new Date().toISOString() };
  if (member) Object.assign(member, values); else { member = { id: crypto.randomUUID(), ...values }; team.members.push(member); }
  invitation.usedAt = new Date().toISOString(); return member;
}
export function changeMember(team: Team, value: Record<string, unknown>) {
  if (value.action === 'cancel-invite') {
    const row = team.invitations.find(i => i.id === value.id && !i.usedAt && !i.cancelledAt);
    if (!row) fail(404, 'ไม่พบคำเชิญที่ยังใช้ได้'); row.cancelledAt = new Date().toISOString(); return { success: true };
  }
  const member = team.members.find(m => m.id === value.id);
  if (!member) fail(404, 'ไม่พบทีมงาน');
  if (value.action === 'revoke') member.active = false;
  else if (value.action === 'role' && member.active && memberRoles(value).length) { member.roles = memberRoles(value); member.role = member.roles[0]; }
  else fail(400, 'เปลี่ยนเฉพาะระดับทีมงานที่ยังเปิดใช้งาน');
  member.version = crypto.randomUUID(); return { success: true };
}
export function authorize(role: RoleSelection, path: string, method: string) {
  const p = permissions(role);
  const allowed = path === '/api/marketplace/setup' && method === 'GET'
    || path === '/api/finance/admin-team' && p.configure
    || path.startsWith('/api/marketplace/setup/') && p.configure
    || /^\/api\/finance\/(report|revenue|export)$/.test(path) && method === 'GET' && p.financeRead
    || path === '/api/finance/revenue/config' && method === 'POST' && p.configure
    || (path === '/api/finance/revenue/settle' || /^\/api\/finance\/entries(?:\/[^/]+)?$/.test(path)) && method === 'POST' && p.financeWrite
    || /^\/api\/marketplace\/?$/.test(path) && method === 'GET' && p.receipts
    || path === '/api/marketplace/sessions' && method === 'POST' && p.operations
    || /^\/api\/(marketplace\/(sessions|venues)|coaching\/(coaches|slots))\/[^/]+\/delete$/.test(path) && method === 'POST' && p.operations
    || /^\/api\/marketplace\/sessions\/[^/]+\/(edit|pause)$/.test(path) && method === 'POST' && p.operations
    || /^\/api\/marketplace\/venues(?:\/[^/]+)?$/.test(path) && p.operations
    || /^\/api\/marketplace\/bookings\/[^/]+\/receipts\/[^/]+(?:\/(review|verify))?$/.test(path) && p.receipts
    || /^\/api\/marketplace\/bookings\/[^/]+\/admission$/.test(path) && method === 'POST' && p.operations
    || /^\/api\/marketplace\/bookings\/[^/]+\/cancel$/.test(path) && method === 'POST' && p.operations
    || /^\/api\/(marketplace\/bookings|coaching\/enrollments)\/[^/]+\/refund$/.test(path) && method === 'POST' && p.financeWrite
    || /^\/api\/(marketplace\/bookings|coaching\/enrollments)\/[^/]+\/payment-recovery$/.test(path) && method === 'POST' && p.receipts
    || path === '/api/coaching' && method === 'GET' && p.receipts
    || /^\/api\/coaching\/(coaches|slots)(?:\/[^/]+)?$/.test(path) && method === 'POST' && p.operations
    || /^\/api\/coaching\/enrollments\/[^/]+\/(cancel|complete)$/.test(path) && method === 'POST' && p.operations
    || /^\/api\/coaching\/enrollments\/[^/]+\/receipts\/[^/]+$/.test(path) && method === 'GET' && p.receipts
    || /^\/api\/coaching\/enrollments\/[^/]+\/receipts\/[^/]+\/(review|verify)$/.test(path) && method === 'POST' && p.receipts;
  if (!allowed) fail(403, 'ระดับแอดมินของคุณไม่มีสิทธิ์ใช้เมนูหรือคำสั่งนี้');
}
