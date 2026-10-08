import type { FinanceDocuments } from './financeDomain';
import type { CatalogManagement } from '../src/catalogManagementTypes';
import { fail, newSession } from './pilotDomain';

export type CatalogKind = 'venue' | 'game' | 'coach' | 'slot';
const ledgerReference = (docs: FinanceDocuments, kind: string, id: string) =>
  docs['revenue-settlements'].some(s => s.key === `${kind}:${id}`)
  || docs.finance.some(r => r.allocationKey === `${kind}:${id}` || r.reference === id || r.reference === `${kind}:${id}` || kind === 'game' && r.source === 'game' && r.reference.startsWith(id + ':'));

export const venueOpen = (docs: FinanceDocuments, name: string, id?: string) =>
  (docs['court-venues'] || []).some(v => v.active && (id ? v.id === id : v.name === name));

export function catalogManagement(docs: FinanceDocuments, kind: CatalogKind, id: string): CatalogManagement {
  let reason = '', editable = true, canPause: boolean | undefined;
  if (kind === 'venue') {
    const venue = docs['court-venues']?.find(v => v.id === id);
    if (!venue) fail(404, 'ไม่พบสนาม');
    if (docs.marketplace.sessions.some(s => s.venueId === id || s.venue === venue.name)
      || docs['coach-profiles']?.some(c => c.venue === venue.name)
      || docs.coaching.some(e => e.venue === venue.name)) reason = 'สนามนี้ผูกกับก๊วน โค้ช หรือประวัติการเรียนแล้ว ใช้ซ่อนสนาม หรือจัดการรายการที่ยังว่างก่อน';
  } else if (kind === 'game') {
    const session = docs.marketplace.sessions.find(s => s.id === id);
    if (!session) fail(404, 'ไม่พบก๊วน');
    if (docs.marketplace.bookings.some(b => b.sessionId === id) || ledgerReference(docs, 'game', id)) reason = 'ก๊วนนี้มีประวัติการจองหรือบัญชีแล้ว ลบไม่ได้ ใช้หยุดรับจองเพื่อเก็บประวัติ';
    canPause = session.status !== 'completed' && Date.parse(session.startsAt) > Date.now();
    editable = !reason && canPause;
  } else if (kind === 'coach') {
    if (!docs['coach-profiles']?.some(c => c.id === id)) fail(404, 'ไม่พบโค้ช');
    if (docs.coaching.some(e => e.coachId === id) || docs['coach-slots']?.some(s => s.coachId === id) || ledgerReference(docs, 'coach', id)) reason = 'โค้ชมีตารางหรือประวัติการจองแล้ว ลบไม่ได้ ใช้ซ่อนโค้ช หรือลบช่วงเวลาที่ไม่เคยมีผู้จองก่อน';
  } else {
    const slot = docs['coach-slots']?.find(s => s.id === id);
    if (!slot) fail(404, 'ไม่พบช่วงเวลา');
    if (docs.coaching.some(e => e.coachId === slot.coachId && e.lessons.some(l => l.slotId === id
      || Date.parse(l.start) < Date.parse(slot.start) + slot.hours * 3600000 && Date.parse(l.start) + l.hours * 3600000 > Date.parse(slot.start)))
      || ledgerReference(docs, 'slot', id)) reason = 'ช่วงเวลานี้มีประวัติการจองแล้ว ลบหรือย้ายเวลาไม่ได้ เก็บประวัติไว้และจัดการนัดเรียน';
    editable = !reason && Date.parse(slot.start) > Date.now();
  }
  return { canDelete: !reason, deleteReason: reason, canEdit: editable, editReason: editable ? '' : reason || 'เวลาผ่านแล้ว แก้ไขไม่ได้', ...(canPause === undefined ? {} : { canPause }) };
}

export function deleteCatalogEntry(docs: FinanceDocuments, kind: CatalogKind, id: string) {
  const policy = catalogManagement(docs, kind, id);
  if (!policy.canDelete) fail(409, policy.deleteReason);
  if (kind === 'venue') docs['court-venues'] = docs['court-venues']!.filter(v => v.id !== id);
  else if (kind === 'game') docs.marketplace.sessions = docs.marketplace.sessions.filter(s => s.id !== id);
  else if (kind === 'coach') docs['coach-profiles'] = docs['coach-profiles']!.filter(c => c.id !== id);
  else docs['coach-slots'] = docs['coach-slots']!.filter(s => s.id !== id);
  return { deleted: true };
}

export function saveSession(docs: FinanceDocuments, value: Record<string, unknown>, id?: string) {
  const existing = id ? docs.marketplace.sessions.find(s => s.id === id) : undefined;
  if (id) { const p = catalogManagement(docs, 'game', id); if (!p.canEdit) fail(409, p.editReason); }
  const venue = docs['court-venues']?.find(v => v.active && (value.venueId ? v.id === value.venueId : v.name === value.venue));
  if (!venue) fail(400, 'เลือกสนามที่เปิดแสดงจากทะเบียนสนามก่อน');
  if (typeof value.endsAt !== 'string') fail(400, 'ระบุเวลาจบก๊วน');
  const session = newSession({ ...value, venueId: venue.id, venue: venue.name, area: venue.area });
  if (existing) { Object.assign(existing, session, { id, bookingPaused: existing.bookingPaused }); return existing; }
  docs.marketplace.sessions.unshift(session); return session;
}

export function pauseSession(docs: FinanceDocuments, id: string, paused: unknown) {
  if (typeof paused !== 'boolean') return fail(400, 'เลือกเปิดหรือหยุดรับจอง');
  if (!catalogManagement(docs, 'game', id).canPause) fail(409, 'ก๊วนผ่านเวลาแล้ว เปลี่ยนการเปิดรับไม่ได้');
  docs.marketplace.sessions.find(s => s.id === id)!.bookingPaused = paused;
  return { bookingPaused: paused };
}
