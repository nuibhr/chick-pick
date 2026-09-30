import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, GraduationCap, MapPin } from 'lucide-react';
import type { Coach, CoachSlot } from './coachingTypes';
import './coach-preview.css';

const money = (value: number) => new Intl.NumberFormat('th-TH').format(value);
const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const time = (value: string) => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
type Catalog = { coaches: Coach[]; slots: CoachSlot[]; bookingEnabled: boolean; demo: boolean };

export default function CoachPreview() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [coachId, setCoachId] = useState('');
  const [day, setDay] = useState(dayKey(new Date()));
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/coach-catalog', { signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (!response.ok) throw Error(value.message || 'โหลดตารางโค้ชไม่สำเร็จ');
      setCatalog(value);
    }).catch(cause => { if (cause.name !== 'AbortError') setError(cause.message); });
    return () => controller.abort();
  }, []);
  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const current = new Date(Date.now() + index * 86400000);
    return { key: dayKey(current), label: current.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short' }) };
  }), []);
  const coach = catalog?.coaches.find(item => item.id === coachId) || catalog?.coaches[0];
  const slots = catalog?.slots.filter(slot => slot.coachId === coach?.id && dayKey(new Date(slot.start)) === day).sort((a, b) => a.start.localeCompare(b.start)) || [];
  return <div className="cp-page"><div className="pa-page-intro"><span>CHICK&PICK ACADEMY</span><h1>ตารางโค้ช<span>.</span></h1><p>ดูวันว่าง ช่วงเวลา และราคา ก่อนเลือกเรียน</p></div>
    {error && <p className="pa-message pa-error" role="alert">{error}</p>}
    {!catalog && !error && <p role="status">กำลังโหลดตารางโค้ช…</p>}
    {catalog && <><div className="cp-coaches" role="group" aria-label="เลือกโค้ช">{catalog.coaches.map(item => <button type="button" key={item.id} aria-pressed={coach?.id === item.id} onClick={() => setCoachId(item.id)}><span>{item.initials}</span><b>{item.name}</b><small>เริ่ม ฿{money(item.hourlyRate)}/ชม.</small></button>)}</div>
      {coach && <section className="cp-calendar"><div className="cp-coach-info"><span><GraduationCap size={22}/></span><div><h2>{coach.name}</h2><p>{coach.specialty}</p><small><MapPin size={13}/>{coach.venue}</small></div></div><p className="cp-bio">{coach.bio}</p><div className="cp-day-list" role="group" aria-label="เลือกวัน">{days.map(item => <button type="button" key={item.key} aria-pressed={day === item.key} onClick={() => setDay(item.key)}><CalendarDays size={15}/>{item.label}</button>)}</div>
        <div className="cp-slots"><h3>ช่วงเวลา {days.find(item => item.key === day)?.label}</h3>{slots.length ? slots.map(slot => <div className={'cp-slot ' + slot.status} key={slot.id}><div><Clock3 size={17}/><span><b>{time(slot.start)} น. · {slot.hours} ชม.</b><small>{slot.status === 'open' ? 'โค้ชพร้อมสอน' : slot.status === 'booked' ? 'มีนัดแล้ว' : 'โค้ชไม่อยู่'}</small></span></div><strong>{slot.status === 'blocked' ? 'หยุดสอน' : '฿' + money(slot.price)}</strong></div>) : <p className="cp-empty">ยังไม่มีช่วงเวลาที่โค้ชเปิดในวันนี้</p>}</div>
        <div className="cp-notice"><b>ดูตารางตัวอย่างได้ก่อน</b><p>ชื่อโค้ชและราคาเป็นข้อมูลตัวอย่าง การขอจองเวลาและชำระเงินผ่าน LINE ยังไม่เปิดใช้ โปรดรอผู้จัดยืนยันช่องเวลาอีกครั้งก่อนเดินทาง</p></div>
      </section>}</>}
  </div>;
}
