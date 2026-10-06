import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, GraduationCap, MapPin } from 'lucide-react';
import type { Coach, CoachSlot } from './coachingTypes';
import './coach-preview.css';
const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const when = (s: string) => new Date(s).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
type Catalog = { coaches: Coach[]; slots: CoachSlot[]; bookingEnabled: boolean; demo: boolean };
export default function PlayerCoaches({ token, login, booked, unauthorized }: { token: string; login: () => Promise<void>; booked: () => Promise<void>; unauthorized: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null), [coachId, setCoachId] = useState(''), [day, setDay] = useState(dayKey(new Date())), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { const r = await fetch('/api/coach-catalog'), result = await r.json(); if (!r.ok) throw Error(result.message || 'โหลดโค้ชไม่สำเร็จ'); setCatalog(result); }, []);
  useEffect(() => { let active = true; const load = () => { if (active) void refresh().catch(e => setError(e.message)); }; load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000); return () => { active = false; clearInterval(timer); }; }, [refresh]);
  const coach = catalog?.coaches.find(c => c.id === coachId) || catalog?.coaches[0];
  const days = useMemo(() => {
    const keys = new Set(Array.from({ length: 14 }, (_, i) => dayKey(new Date(Date.now() + i * 86400000))));
    for (const slot of catalog?.slots || []) if (slot.coachId === coach?.id) keys.add(dayKey(new Date(slot.start)));
    return [...keys].sort().map(key => ({ key, label: new Date(key + 'T12:00:00+07:00').toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short' }) }));
  }, [catalog, coach?.id]);
  const slots = catalog?.slots.filter(s => s.coachId === coach?.id && dayKey(new Date(s.start)) === day).sort((a, b) => a.start.localeCompare(b.start)) || [];
  async function reserve(slot: CoachSlot) {
    if (busy) return;
    if (!token) { await login(); return; }
    setBusy(true); setError('');
    try { const r = await fetch('/api/player/lessons', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ slotId: slot.id }) }), result = await r.json(); if (!r.ok) { if (r.status === 401) unauthorized(); throw Error(result.message || 'จองไม่สำเร็จ'); } await refresh(); await booked(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="cp-page"><div className="pa-page-intro"><span>CHICK&PICK ACADEMY</span><h1>ตารางโค้ช<span>.</span></h1><p>ดูวันว่าง ช่วงเวลา และราคา ก่อนเลือกเรียน</p></div>
    {error && <p className="pa-message pa-error" role="alert">{error}</p>}{!catalog && !error && <p role="status">กำลังโหลดตารางโค้ช…</p>}
    {catalog && !catalog.coaches.length && <div className="pa-empty"><GraduationCap size={28} /><b>ยังไม่มีโค้ชเปิดรับ</b><p>ตารางจริงจะแสดงเมื่อผู้จัดเพิ่มโค้ชและช่วงเวลาสอน</p><button type="button" onClick={() => void refresh().catch(e => setError(e.message))}>รีเฟรชตาราง</button></div>}
    {coach && <><div className="cp-coaches" role="group" aria-label="เลือกโค้ช">{catalog.coaches.map(c => <button key={c.id} type="button" aria-pressed={c.id === coach.id} onClick={() => setCoachId(c.id)}><span>{c.initials}</span><b>{c.name}</b><small>฿{c.hourlyRate.toLocaleString('th-TH')}/ชม.</small></button>)}</div>
      <section className="cp-calendar"><div className="cp-coach-info"><span><GraduationCap size={22} /></span><div><h2>{coach.name}</h2><p>{coach.specialty}</p><small><MapPin size={13} />{coach.venue}</small></div></div><p className="cp-bio">{coach.bio}</p>
        <div className="cp-day-list" role="group" aria-label="เลือกวัน">{days.map(d => <button key={d.key} type="button" aria-pressed={d.key === day} onClick={() => setDay(d.key)}><CalendarDays size={15} />{d.label}</button>)}</div>
        <div className="cp-slots"><h3>ช่วงเวลา {days.find(d => d.key === day)?.label}</h3>{slots.map(s => <div className={'cp-slot ' + s.status} key={s.id}><div><Clock3 size={17} /><span><b>{when(s.start)} น. · {s.hours} ชม.</b><small>{s.status === 'booked' ? 'มีผู้จองแล้ว' : s.status === 'blocked' ? 'โค้ชไม่อยู่' : s.bookingReady === false ? 'รอผู้จัดตั้งค่าการจอง' : 'พร้อมสอน'}</small></span></div><strong>฿{s.price.toLocaleString('th-TH')}</strong><button type="button" disabled={busy || s.status !== 'open' || !catalog.bookingEnabled || coach.bookingReady === false || s.bookingReady === false} onClick={() => void reserve(s)}>{s.status !== 'open' ? 'ไม่ว่าง' : !catalog.bookingEnabled || coach.bookingReady === false || s.bookingReady === false ? 'ยังไม่เปิดจอง' : token ? 'จองเวลานี้' : 'เข้าสู่ LINE เพื่อจอง'}</button></div>)}{!slots.length && <p className="cp-empty">ยังไม่มีช่วงเวลาที่โค้ชเปิดในวันนี้</p>}</div>
        <div className="cp-notice"><b>{catalog.bookingEnabled && coach.bookingReady !== false ? 'จองเวลาแล้ว แนบสลิปในหน้าการจอง' : 'ผู้จัดยังไม่เปิดรับจองโค้ชนี้'}</b><p>กันเวลา 30 นาทีสำหรับโอนและแนบสลิป เมื่อส่งสลิปแล้วจะกันเวลาต่อระหว่างตรวจเงิน ราคาตามช่วงเวลาที่เลือก ผู้จัดตรวจยอดเข้าบัญชีเอง การจองที่ยังไม่จ่ายยกเลิกได้หากไม่มีสลิปรอตรวจ เมื่อจ่ายแล้วให้ติดต่อผู้จัดเรื่องเปลี่ยนนัดหรือคืนเงิน</p></div>
      </section></>}
  </div>;
}
