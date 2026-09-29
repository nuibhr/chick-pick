import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Coach, Enrollment } from '../src/coachingTypes';

export const coaches: Coach[] = [
  { id: 'bank', name: 'โค้ชแบงค์', initials: 'BK', specialty: 'เริ่มต้นอย่างมั่นใจ', bio: 'จับไม้ เสิร์ฟ รับลูก และกติกา เรียนทีละขั้นสำหรับคนที่เพิ่งเริ่มเล่น', venue: 'Chicken Court Club · ขอนแก่น', hourlyRate: 600, courses: [{ id: 'foundation', name: 'พื้นฐานแน่น พร้อมลงก๊วน', hours: 6, price: 3200 }, { id: 'starter', name: 'เริ่มเล่นเป็นใน 3 ชั่วโมง', hours: 3, price: 1700 }] },
  { id: 'ploy', name: 'โค้ชพลอย', initials: 'PL', specialty: 'Dink & คุมเกมหน้าเน็ต', bio: 'พัฒนาการวางลูก ดรอปช็อต และการตัดสินใจในเกมคู่ ด้วยแบบฝึกเฉพาะคุณ', venue: 'North Court Arena · ขอนแก่น', hourlyRate: 800, courses: [{ id: 'control', name: 'คุมหน้าเน็ต เพิ่มความแม่นยำ', hours: 8, price: 5800 }] },
  { id: 'ton', name: 'โค้ชต้น', initials: 'TN', specialty: 'เทคนิคเกมคู่', bio: 'ฝึกตำแหน่งยืน การเคลื่อนที่ และการสื่อสารกับคู่ เพื่อเล่นอย่างเป็นระบบ', venue: 'Smash Yard Pickleball · ขอนแก่น', hourlyRate: 700, courses: [{ id: 'doubles', name: 'ยกระดับเกมคู่', hours: 5, price: 3200 }] },
];

export function coachingRouter(file = path.resolve('data/coaching.json'), demo = process.env.NODE_ENV !== 'production') {
  const router = Router();
  let enrollments: Enrollment[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const commit = (next: Enrollment[]) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file + '.tmp', JSON.stringify(next, null, 2));
    renameSync(file + '.tmp', file);
    enrollments = next;
  };
  // A local preview has no user identity. Never expose student data or mutations in production.
  router.use((_req, res, next) => demo ? next() : res.status(503).json({ message: 'ระบบโค้ชยังไม่เปิดใช้งานจริง ต้องเชื่อมระบบสมาชิก สิทธิ์โค้ช และการชำระเงินก่อน' }));
  router.get('/', (_req, res) => res.json({ coaches, enrollments, demo }));
  router.post('/enrollments', (req, res) => {
    const { coachId, courseId, hours, student, phone } = req.body;
    const coach = coaches.find(c => c.id === coachId);
    const course = coach?.courses.find(c => c.id === courseId);
    if (!coach || (courseId && !course) || typeof student !== 'string' || !student.trim() || student.length > 80 || typeof phone !== 'string' || !/^0\d{8,9}$/.test(phone)) return res.status(400).json({ message: 'กรุณาตรวจสอบโค้ช ชื่อ และเบอร์โทร 9–10 หลัก' });
    if (!course && (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 1 || hours > 4 || hours % 0.5)) return res.status(400).json({ message: 'เลือกเวลา 1–4 ชั่วโมง เพิ่มครั้งละ 30 นาที' });
    const enrollment: Enrollment = { id: randomUUID(), coachId, student: student.trim(), phone, title: course?.name || 'เรียนส่วนตัวรายชั่วโมง', totalHours: course?.hours || hours, amount: course?.price || coach.hourlyRate * hours, payment: 'pending', createdAt: new Date().toISOString(), lessons: [] };
    commit([enrollment, ...enrollments]);
    res.status(201).json(enrollment);
  });
  router.post('/enrollments/:id/payment', (req, res) => {
    const item = enrollments.find(e => e.id === req.params.id);
    if (!item) return res.status(404).json({ message: 'ไม่พบรายการเรียน' });
    if (!['cash', 'transfer'].includes(req.body.method)) return res.status(400).json({ message: 'เลือกวิธีรับเงิน' });
    if (item.payment === 'paid') return res.json(item);
    const updated: Enrollment = { ...item, payment: 'paid', paymentMethod: req.body.method, paidAt: new Date().toISOString() };
    commit(enrollments.map(e => e.id === item.id ? updated : e));
    res.json(updated);
  });
  router.post('/enrollments/:id/lessons', (req, res) => {
    const item = enrollments.find(e => e.id === req.params.id);
    if (!item) return res.status(404).json({ message: 'ไม่พบรายการเรียน' });
    if (item.payment !== 'paid') return res.status(409).json({ message: 'รอยืนยันการรับเงินก่อนนัดเรียน' });
    const { start, hours } = req.body;
    const time = Date.parse(start);
    if (typeof start !== 'string' || !Number.isFinite(time) || time <= Date.now() || typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0.5 || hours > 4 || hours % 0.5) return res.status(400).json({ message: 'เลือกวันเวลาในอนาคต และระยะเวลา 0.5–4 ชั่วโมง' });
    const reserved = item.lessons.filter(l => l.status !== 'cancelled').reduce((s, l) => s + l.hours, 0);
    if (reserved + hours > item.totalHours) return res.status(409).json({ message: 'ชั่วโมงคงเหลือไม่เพียงพอ' });
    const conflict = enrollments.filter(e => e.coachId === item.coachId).some(e => e.lessons.some(l => l.status !== 'cancelled' && time < Date.parse(l.start) + l.hours * 3600000 && time + hours * 3600000 > Date.parse(l.start)));
    if (conflict) return res.status(409).json({ message: 'โค้ชมีนัดในช่วงนี้แล้ว กรุณาเลือกเวลาอื่น' });
    const updated = { ...item, lessons: [...item.lessons, { id: randomUUID(), start: new Date(time).toISOString(), hours, status: 'scheduled' as const }] };
    commit(enrollments.map(e => e.id === item.id ? updated : e));
    res.status(201).json(updated);
  });
  router.post('/enrollments/:id/lessons/:lessonId', (req, res) => {
    const item = enrollments.find(e => e.id === req.params.id);
    const lesson = item?.lessons.find(l => l.id === req.params.lessonId);
    const { status } = req.body;
    if (!lesson) return res.status(404).json({ message: 'ไม่พบนัดเรียน' });
    if (!['completed', 'cancelled'].includes(status)) return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' });
    if (lesson.status === status) return res.json(item);
    if (lesson.status !== 'scheduled') return res.status(409).json({ message: 'นัดนี้ปิดรายการแล้ว' });
    if (status === 'completed' && Date.parse(lesson.start) + lesson.hours * 3600000 > Date.now()) return res.status(409).json({ message: 'ยังไม่ถึงเวลาสิ้นสุดการเรียน' });
    const updated = { ...item!, lessons: item!.lessons.map(l => l.id === lesson.id ? { ...l, status } : l) };
    commit(enrollments.map(e => e.id === item!.id ? updated : e));
    res.json(updated);
  });
  router.use((err: Error, _req: any, res: any, _next: any) => { console.error(err); res.status(500).json({ message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' }); });
  return router;
}
