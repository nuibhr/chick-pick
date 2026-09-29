import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, Check, Clock3, GraduationCap, MapPin, X } from 'lucide-react';
import type { Coach, CoachingState, Enrollment } from '../coachingTypes';
import './coaching.css';

const money = (n: number) => new Intl.NumberFormat('th-TH').format(n);
const date = (s: string) => new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
async function api(path = '', body?: unknown) {
  const res = await fetch('/api/coaching' + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'เชื่อมต่อไม่สำเร็จ');
  return data;
}

export default function Coaching() {
  const [data, setData] = useState<CoachingState | null>(null);
  const [view, setView] = useState('explore');
  const [coach, setCoach] = useState<Coach | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = async () => setData(await api());
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);
  const act = async (path: string, body: unknown, message: string, after?: () => void) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await api(path, body); after?.(); await refresh(); setNotice(message); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  const enrollments = data?.enrollments || [];
  return <div className="coaching">
    <div className="coach-kicker">CHICK&PICK ACADEMY <span>ฝึกวันนี้ เล่นสนุกขึ้นทุกวัน</span></div>
    <section className="coach-hero"><div><span className="coach-pill"><GraduationCap size={15}/> เรียนส่วนตัวกับโค้ช</span><h1>ตีให้มั่นใจ<br/><em>ไปให้ไกลกว่าเดิม.</em></h1><p>จากลูกแรก สู่เกมที่เป็นคุณ<br/>เลือกโค้ชที่ใช่ เรียนรายชั่วโมง หรือฝึกต่อเนื่องเป็นคอร์ส</p><button className="coach-primary" onClick={() => document.getElementById('coach-content')?.scrollIntoView({ behavior: 'smooth' })}>ค้นหาโค้ชของคุณ <ArrowUpRight size={18}/></button></div><div className="coach-court" aria-hidden="true"><div className="court-net"/><div className="court-ball">✦</div><div className="court-caption">A LITTLE PRACTICE.<br/>A BETTER GAME.</div><span className="court-tag">YOUR NEXT LEVEL ↗</span></div></section>
    <div className="coach-demo">โหมดทดลอง · โค้ชและราคาเป็นข้อมูลตัวอย่าง · ไม่มีการเรียกเก็บเงินจริง · ข้อมูลผู้เรียนใช้ร่วมกันในเครื่องนี้</div>
    <div className="coach-tabs" role="tablist" aria-label="เมนูเรียนกับโค้ช">{[['explore', 'ค้นหาโค้ช'], ['learning', 'การเรียนของฉัน'], ['manage', 'จัดการสำหรับโค้ช']].map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={view === id ? 'active' : ''}>{label}</button>)}</div>
    {error && <div className="coach-error" role="alert">{error} <button onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>ลองโหลดอีกครั้ง</button></div>}
    {notice && <div className="coach-notice" role="status"><Check size={18}/>{notice}</div>}
    {!data && !error && <p role="status">กำลังโหลดข้อมูลโค้ช…</p>}
    <div id="coach-content">
      {data && view === 'explore' && <><div className="coach-section-title"><div><small>FIND YOUR COACH</small><h2>เริ่มจากโค้ชที่เข้าใจคุณ</h2></div><span>{data.coaches.length} โค้ชพร้อมสอน</span></div><div className="coach-grid">{data.coaches.map((c, i) => <article className="coach-card" key={c.id}><div className={'coach-cover cover-' + i}><span>0{i + 1} / THE COACH</span><div className="coach-avatar">{c.initials}</div><span className="coach-cover-label">{c.specialty}</span></div><div className="coach-card-body"><h3>{c.name}</h3><p className="coach-location"><MapPin size={14}/>{c.venue}</p><p className="coach-bio">{c.bio}</p><div className="coach-price"><div><small>เรียนส่วนตัว เริ่มต้น</small><strong>฿{money(c.hourlyRate)} <span>/ ชั่วโมง</span></strong></div><button aria-label={'เลือกเรียนกับ' + c.name} onClick={() => setCoach(c)}><ArrowUpRight/></button></div><div className="coach-course-hint">มีคอร์ส {c.courses[0].hours} ชั่วโมง · ฿{money(c.courses[0].price)}</div></div></article>)}</div><div className="coach-steps">{[['01', 'เลือกวิธีเรียน', 'รายชั่วโมง หรือคอร์สที่ตรงเป้าหมาย'], ['02', 'ยืนยันค่าเรียน', 'โค้ชบันทึกการรับเงินก่อนเริ่มนัด'], ['03', 'ลงสนาม พัฒนาต่อ', 'ติดตามนัดและชั่วโมงเรียนได้ทุกครั้ง']].map(([n, title, text]) => <div key={n}><b>{n}</b><div><strong>{title}</strong><p>{text}</p></div></div>)}</div></>}
      {data && view !== 'explore' && <>
        <div className="coach-section-title"><div><small>{view === 'manage' ? 'COACH DESK' : 'MY LEARNING'}</small><h2>{view === 'manage' ? 'ดูแลผู้เรียนและค่าเรียน' : 'ทุกชั่วโมง คือพัฒนาการ'}</h2></div></div>
        {view === 'manage' && <div className="coach-stats"><div><small>รับเงินแล้ว (ทดลอง)</small><strong>฿{money(enrollments.filter(e => e.payment === 'paid').reduce((s, e) => s + e.amount, 0))}</strong></div><div><small>รอรับเงิน</small><strong>฿{money(enrollments.filter(e => e.payment === 'pending').reduce((s, e) => s + e.amount, 0))}</strong></div><div><small>นัดที่รอสอน</small><strong>{enrollments.flatMap(e => e.lessons).filter(l => l.status === 'scheduled').length} <span>ครั้ง</span></strong></div></div>}
        {!enrollments.length && <div className="coach-empty"><GraduationCap size={36}/><h3>ชั่วโมงแรกของคุณ เริ่มได้ที่นี่</h3><p>เลือกโค้ชและรูปแบบการเรียน แล้วกลับมาดูนัดได้ในหน้านี้</p><button className="coach-primary" onClick={() => setView('explore')}>เลือกโค้ช</button></div>}
        <div className="enrollment-list">{enrollments.map(e => <EnrollmentCard key={e.id} item={e} coach={data.coaches.find(c => c.id === e.coachId)!} manage={view === 'manage'} busy={busy} act={act}/>)}</div>
      </>}
    </div>
    {coach && <Booking coach={coach} busy={busy} error={error} close={() => { setCoach(null); setError(''); }} submit={body => act('/enrollments', body, 'บันทึกการสมัครเรียนแล้ว รอโค้ชยืนยันการรับเงิน', () => { setCoach(null); setView('learning'); })}/>}
  </div>;
}

function Booking({ coach, busy, error, close, submit }: { coach: Coach; busy: boolean; error: string; close: () => void; submit: (body: unknown) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [plan, setPlan] = useState('hourly');
  const [hours, setHours] = useState(1);
  const course = coach.courses.find(c => c.id === plan);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="coach-dialog" onCancel={e => { e.preventDefault(); if (!busy) close(); }}><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); submit({ coachId: coach.id, courseId: course?.id, hours, student: f.get('student'), phone: f.get('phone') }); }}><div className="coach-dialog-head"><div><small>YOUR NEXT LEVEL</small><h2>เรียนกับ{coach.name.replace('โค้ช', 'โค้ช')}</h2></div><button type="button" aria-label="ปิดหน้าจอง" disabled={busy} onClick={close}><X/></button></div><p className="coach-muted">เรียนส่วนตัว 1 คน · ไม่รวมค่าเช่าสนาม<br/>นัดเวลาเรียนหลังโค้ชยืนยันรับเงิน</p><label>รูปแบบการเรียน<select value={plan} onChange={e => setPlan(e.target.value)}><option value="hourly">รายชั่วโมง · ฿{money(coach.hourlyRate)}/ชม.</option>{coach.courses.map(c => <option value={c.id} key={c.id}>{c.name} · {c.hours} ชม. · ฿{money(c.price)}</option>)}</select></label>{!course && <label>จำนวนชั่วโมง<select value={hours} onChange={e => setHours(Number(e.target.value))}>{[1, 1.5, 2, 2.5, 3, 3.5, 4].map(n => <option key={n} value={n}>{n} ชั่วโมง</option>)}</select></label>}<div className="coach-form-grid"><label>ชื่อผู้เรียน<input name="student" autoComplete="name" required maxLength={80} placeholder="ชื่อที่ให้โค้ชเรียก"/></label><label>เบอร์โทร<input name="phone" autoComplete="tel" type="tel" required pattern="0[0-9]{8,9}" placeholder="08xxxxxxxx"/></label></div><div className="coach-total"><span>ค่าเรียน {course?.hours || hours} ชั่วโมง</span><strong>฿{money(course?.price || hours * coach.hourlyRate)}</strong></div><p className="coach-muted">ชำระเต็มจำนวน · นัดที่ยกเลิกคืนชั่วโมงในระบบ<br/>การคืนเงินและค่าเช่าสนามให้ตกลงกับโค้ชแยกต่างหาก</p>{error && <p role="alert" className="coach-error">{error}</p>}<button className="coach-primary wide" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'ยืนยันสมัครเรียน · ยังไม่ชำระเงิน'}</button></form></dialog>;
}

function EnrollmentCard({ item: e, coach, manage, busy, act }: { item: Enrollment; coach: Coach; manage: boolean; busy: boolean; act: (path: string, body: unknown, message: string) => Promise<void> }) {
  const completed = e.lessons.filter(l => l.status === 'completed').reduce((s, l) => s + l.hours, 0);
  const booked = e.lessons.filter(l => l.status === 'scheduled').reduce((s, l) => s + l.hours, 0);
  const available = e.totalHours - completed - booked;
  const [method, setMethod] = useState('cash');
  return <article className="enrollment"><div className="enrollment-heading"><div><small>{coach.name} · {e.student}</small><h3>{e.title}</h3><p>{coach.venue}</p></div><span className={'payment-badge ' + e.payment}>{e.payment === 'paid' ? 'รับเงินแล้ว' : 'รอรับเงิน'} · ฿{money(e.amount)}</span></div><div className="hours-row"><span><b>{available}</b> ชม. พร้อมนัด</span><span><b>{booked}</b> ชม. นัดแล้ว</span><span><b>{completed}/{e.totalHours}</b> ชม. เรียนแล้ว</span></div><progress max={e.totalHours} value={completed} aria-label="ชั่วโมงที่เรียนแล้ว"/>
    {manage && <p className="coach-muted">ติดต่อ {e.phone} · สมัคร {date(e.createdAt)}<br/>เลขอ้างอิง {e.id.slice(0, 8).toUpperCase()}</p>}
    {e.payment === 'pending' && (manage ? <div className="payment-controls"><label>วิธีรับเงิน<select aria-label="วิธีรับเงิน" value={method} onChange={ev => setMethod(ev.target.value)}><option value="cash">เงินสด</option><option value="transfer">โอนธนาคาร</option></select></label><button className="coach-primary" disabled={busy} onClick={() => act('/enrollments/' + e.id + '/payment', { method }, 'บันทึกการรับเงินทดลองแล้ว สามารถนัดเรียนได้')}>ยืนยันรับเงิน ฿{money(e.amount)} (ทดลอง)</button></div> : <p className="coach-muted">รอโค้ชยืนยันรับเงินก่อนนัดเรียน · ทดลองได้ที่แท็บจัดการสำหรับโค้ช</p>)}
    {e.payment === 'paid' && <p className="coach-muted">รับเต็มจำนวนด้วย{e.paymentMethod === 'cash' ? 'เงินสด' : 'การโอน'} · {date(e.paidAt!)}</p>}
    {e.payment === 'paid' && available >= 0.5 && <form className="lesson-form" onSubmit={event => { event.preventDefault(); const f = new FormData(event.currentTarget); const start = new Date(String(f.get('start'))); if (!Number.isFinite(start.getTime())) return; act('/enrollments/' + e.id + '/lessons', { start: start.toISOString(), hours: Number(f.get('hours')) }, 'เพิ่มนัดเรียนแล้ว'); }}><label>วันและเวลาเรียน<input aria-label={'วันเวลาเรียนของ ' + e.student} name="start" type="datetime-local" required/></label><label>ชั่วโมง<select name="hours" defaultValue={Math.min(1, available)}>{[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].filter(n => n <= available).map(n => <option value={n} key={n}>{n} ชม.</option>)}</select></label><button className="coach-primary" disabled={busy}><CalendarDays size={16}/> นัดเรียน</button></form>}
    {e.lessons.length > 0 && <div className="lesson-list">{[...e.lessons].sort((a, b) => a.start.localeCompare(b.start)).map(l => <div key={l.id} className="lesson-row"><Clock3 size={17}/><div><strong>{date(l.start)}</strong><p>{l.hours} ชั่วโมง · {{ scheduled: 'รอเรียน', completed: 'เรียนแล้ว', cancelled: 'ยกเลิกแล้ว · คืนชั่วโมง' }[l.status]}</p></div>{l.status === 'scheduled' && <div className="lesson-actions">{manage && <button disabled={busy || Date.parse(l.start) + l.hours * 3600000 > Date.now()} title="บันทึกได้เมื่อสิ้นสุดเวลาเรียน" onClick={() => act(`/enrollments/${e.id}/lessons/${l.id}`, { status: 'completed' }, 'บันทึกการสอนเรียบร้อย')}>สอนแล้ว</button>}<button disabled={busy} onClick={() => act(`/enrollments/${e.id}/lessons/${l.id}`, { status: 'cancelled' }, 'ยกเลิกนัดและคืนชั่วโมงแล้ว')}>ยกเลิกนัด</button></div>}</div>)}</div>}
  </article>;
}
