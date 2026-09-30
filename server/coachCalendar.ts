import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Coach, CoachSlot, Enrollment } from '../src/coachingTypes';

type StoredSlot = Omit<CoachSlot, 'status'> & { status: 'open' | 'blocked' };
const read = (file: string): StoredSlot[] => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const save = (file: string, slots: StoredSlot[]) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file + '.tmp', JSON.stringify(slots, null, 2));
  renameSync(file + '.tmp', file);
};
export function calendarSlots(file: string, enrollments: Enrollment[]): CoachSlot[] {
  return read(file).map(slot => ({ ...slot, status: slot.status === 'blocked' ? 'blocked' :
    enrollments.some(e => e.coachId === slot.coachId && e.lessons.some(l => l.status === 'scheduled' && (l.slotId === slot.id || l.start === slot.start))) ? 'booked' : 'open' }));
}
export function coachCalendarRouter(file: string, coaches: Coach[], enrollments: () => Enrollment[]) {
  const router = Router();
  router.get('/', (_req, res) => res.json({ slots: calendarSlots(file, enrollments()) }));
  router.post('/', (req, res) => {
    const { coachId, start, hours, price, status } = req.body || {};
    const time = typeof start === 'string' ? Date.parse(start) : NaN;
    if (!coaches.some(c => c.id === coachId) || !Number.isFinite(time) || time < Date.now() + 1800000 ||
      time > Date.now() + 180 * 86400000 || time % 1800000 !== 0 ||
      typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0.5 || hours > 4 || hours % 0.5 !== 0 ||
      typeof price !== 'number' || price !== coaches.find(c => c.id === coachId)!.hourlyRate * hours ||
      !['open', 'blocked'].includes(status)) return res.status(400).json({ message: 'ตรวจโค้ช วันเวลาใน 180 วัน (ทุก 30 นาที) ระยะเวลา 0.5–4 ชั่วโมง และราคาตามโปรไฟล์โค้ช' });
    const slots = read(file);
    if (slots.some(slot => slot.coachId === coachId && time < Date.parse(slot.start) + slot.hours * 3600000 && time + hours * 3600000 > Date.parse(slot.start)))
      return res.status(409).json({ message: 'ช่วงเวลานี้ทับกับตารางของโค้ชแล้ว' });
    const slot: StoredSlot = { id: randomUUID(), coachId, start: new Date(time).toISOString(), hours, price, status };
    slots.push(slot); save(file, slots); res.status(201).json(slot);
  });
  router.post('/:id', (req, res) => {
    if (!['open', 'blocked'].includes(req.body?.status)) return res.status(400).json({ message: 'เลือกเปิดรับหรือหยุดสอน' });
    const slots = read(file); const slot = slots.find(s => s.id === req.params.id);
    if (!slot) return res.status(404).json({ message: 'ไม่พบช่วงเวลานี้' });
    if (Date.parse(slot.start) <= Date.now()) return res.status(409).json({ message: 'แก้ช่วงเวลาที่ผ่านไปแล้วไม่ได้' });
    if (calendarSlots(file, enrollments()).find(s => s.id === slot.id)?.status === 'booked') return res.status(409).json({ message: 'มีผู้เรียนนัดแล้ว กรุณาจัดการนัดก่อนเปลี่ยนสถานะ' });
    slot.status = req.body.status; save(file, slots); res.json(slot);
  });
  return router;
}
export function publicCoachCatalogRouter(calendarFile: string, coachingFile: string, coaches: Coach[]) {
  const router = Router();
  router.get('/', (_req, res) => {
    const stored = existsSync(coachingFile) ? JSON.parse(readFileSync(coachingFile, 'utf8')) : [];
    const enrollments: Enrollment[] = Array.isArray(stored) ? stored : Array.isArray(stored.enrollments) ? stored.enrollments : [];
    res.setHeader('Cache-Control', 'no-store');
    res.json({ coaches, slots: calendarSlots(calendarFile, enrollments).filter(slot => Date.parse(slot.start) > Date.now()), bookingEnabled: false, demo: true });
  });
  return router;
}
