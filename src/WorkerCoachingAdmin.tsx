import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coach, CoachingState } from './coachingTypes';
import type { Venue } from './venueTypes';
import { permissions, type AdminRole } from './adminRoles';
import ReceiptReview from './ReceiptReview';

const when = (s: string) => new Date(s).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
export default function WorkerCoachingAdmin({ role, receiptsOnly = false }: { role: AdminRole; receiptsOnly?: boolean }) {
  const [data, setData] = useState<CoachingState>({ coaches: [], slots: [], enrollments: [], demo: false });
  const [venues, setVenues] = useState<Venue[]>([]), [edit, setEdit] = useState<Coach | 'new' | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const lock = useRef(false), access = permissions(role);
  const refresh = useCallback(async () => {
    const r = await fetch('/api/coaching'), result = await r.json();
    if (!r.ok) throw Error(result.message || 'โหลดระบบโค้ชไม่สำเร็จ');
    setData(result);
    if (!receiptsOnly) { const v = await fetch('/api/venues'); if (v.ok) setVenues((await v.json()).venues); }
  }, [receiptsOnly]);
  useEffect(() => { void refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh().catch(e => setError(e.message)); }, 30000); return () => clearInterval(timer); }, [refresh]);
  async function mutate(path: string, value: unknown, message: string) {
    if (lock.current) return false; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { const r = await fetch(path.startsWith('/api/') ? path : '/api/coaching' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); const result = await r.json(); if (!r.ok) throw Error(result.message || 'บันทึกไม่ได้'); await refresh(); setNotice(message); return true; }
    catch (e) { setError((e as Error).message); return false; } finally { lock.current = false; setBusy(false); }
  }
  const pending = data.enrollments.filter(e => !e.cancelledAt && e.receipts?.at(-1)?.status === 'pending');
  if (loading) return <p role="status">กำลังโหลดข้อมูลโค้ช…</p>;
  return <>
    {error && <p className="wp-alert" role="alert">{error}</p>}{notice && <p className="wp-success" role="status">{notice}</p>}
    {!receiptsOnly && access.operations && <>
      <section className="wp-section"><div className="wp-section-head"><div><h2>โค้ชและค่าหัวคิว</h2><p>ราคาลูกค้าเป็นรายชั่วโมง · ค่าหัวคิวเป็นบาทต่อการจอง · การแก้ราคามีผลกับช่วงเวลาที่สร้างใหม่</p></div><button type="button" className="wp-primary" disabled={busy} onClick={() => setEdit(edit ? null : 'new')}>{edit ? 'ปิดฟอร์ม' : '+ เพิ่มโค้ช'}</button></div>
        {edit && <form className="wp-form" key={typeof edit === 'string' ? edit : edit.id} onSubmit={async event => { event.preventDefault(); const f = new FormData(event.currentTarget), v = Object.fromEntries(f); const ok = await mutate('/coaches' + (edit === 'new' ? '' : '/' + edit.id), { ...v, hourlyRate: Number(v.hourlyRate), active: v.active === 'true', ...(access.configure ? { bookingFee: Number(v.bookingFee) } : {}) }, 'บันทึกโค้ชแล้ว'); if (ok) setEdit(null); }}>
          <label>ชื่อโค้ช<input name="name" required maxLength={80} defaultValue={edit === 'new' ? '' : edit.name} /></label><label>ความถนัด<input name="specialty" required maxLength={120} defaultValue={edit === 'new' ? '' : edit.specialty} /></label>
          <label>สนาม<select name="venue" required defaultValue={edit === 'new' ? '' : edit.venue}><option value="">เลือกสนามที่เพิ่มไว้</option>{venues.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}{edit !== 'new' && !venues.some(v => v.name === edit.venue) && <option value={edit.venue}>{edit.venue}</option>}</select><small>เพิ่มสนามในเมนูสนามก่อนเพิ่มโค้ช</small></label>
          <label>ราคาเรียน / ชั่วโมง (บาท)<input name="hourlyRate" type="number" min="0.01" max="100000" step="0.01" required defaultValue={edit === 'new' ? '' : edit.hourlyRate} /></label>
          {access.configure && <label>ค่าหัวคิว / การจอง (บาท)<input name="bookingFee" type="number" min="0" max="100000" step="0.01" required defaultValue={edit === 'new' ? '' : edit.bookingFee ?? ''} /><small>เจ้าของกำหนด · จำนวนคงที่ ไม่คูณจำนวนชั่วโมง · ใส่ 0 เมื่อไม่เก็บ</small></label>}
          <label>สถานะ<select name="active" defaultValue={edit === 'new' || edit.active !== false ? 'true' : 'false'}><option value="true">เปิดแสดงหน้าบ้าน</option><option value="false">ซ่อนโค้ช · ไม่รับจองใหม่</option></select></label><label>แนะนำโค้ช<textarea name="bio" maxLength={500} defaultValue={edit === 'new' ? '' : edit.bio} /></label><button className="wp-primary" disabled={busy}>บันทึกโค้ช</button>
        </form>}
        {data.coaches.map(c => <article className="wp-player" key={c.id}><div><strong>{c.name}</strong><p>{c.venue} · ฿{c.hourlyRate}/ชม. · {c.active === false ? 'ซ่อน' : 'แสดงหน้าบ้าน'}</p><small>{c.bookingFee === undefined ? 'รอเจ้าของตั้งค่าหัวคิวก่อนรับจอง' : `ค่าหัวคิว ฿${c.bookingFee} / จอง`}</small></div><button type="button" disabled={busy} onClick={() => setEdit(c)}>แก้ไขโค้ช</button></article>)}{!data.coaches.length && <p className="wp-empty">ยังไม่มีโค้ชจริง เพิ่มสนามและโค้ชคนแรกก่อนเปิดรับ</p>}
      </section>
      <section className="wp-section"><h2>ตารางพร้อมสอน / ไม่อยู่</h2><p>เวลาไทย · ทุก 30 นาที · ห้ามเวลาชนกัน · ราคาคำนวณจากโค้ชและจำนวนชั่วโมง</p>
        <form className="wp-form" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget, f = new FormData(form); const ok = await mutate('/slots', { coachId: f.get('coachId'), start: new Date(String(f.get('start')) + '+07:00').toISOString(), hours: Number(f.get('hours')), status: f.get('status') }, 'บันทึกเวลาสอนแล้ว'); if (ok) form.reset(); }}><label>โค้ช<select name="coachId" required><option value="">เลือกโค้ช</option>{data.coaches.filter(c => c.active !== false).map(c => <option key={c.id} value={c.id}>{c.name} · ฿{c.hourlyRate}/ชม.</option>)}</select></label><label>วันเวลาเริ่ม (ไทย)<input name="start" type="datetime-local" step="1800" required /></label><label>จำนวนชั่วโมง<select name="hours">{[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].map(h => <option key={h} value={h}>{h} ชม.</option>)}</select></label><label>สถานะ<select name="status"><option value="open">พร้อมสอน</option><option value="blocked">ไม่อยู่ / หยุดสอน</option></select></label><button className="wp-primary" disabled={busy || !data.coaches.length}>เพิ่มช่วงเวลา</button></form>
        {data.slots.filter(s => Date.parse(s.start) > Date.now()).sort((a, b) => a.start.localeCompare(b.start)).map(s => <article className="wp-player" key={s.id}><div><strong>{data.coaches.find(c => c.id === s.coachId)?.name}</strong><p>{when(s.start)} · {s.hours} ชม. · ฿{s.price}</p><small>{s.status === 'open' ? 'พร้อมสอน' : s.status === 'booked' ? 'มีผู้จอง' : 'ไม่อยู่'}</small></div><button type="button" disabled={busy || s.status === 'booked'} onClick={() => void mutate('/slots/' + s.id, { status: s.status === 'open' ? 'blocked' : 'open' }, 'เปลี่ยนสถานะช่วงเวลาแล้ว')}>{s.status === 'open' ? 'หยุดรับ' : 'เปิดรับ'}</button></article>)}
      </section>
      <section className="wp-section"><h2>นัดเรียน</h2>{data.enrollments.map(e => <article className="wp-player" key={e.id}><div><strong>{e.student} · {e.title}</strong><p>{e.lessons[0] ? when(e.lessons[0].start) : ''} · ฿{e.amount}</p><small>{e.cancelledAt ? 'ยกเลิก' : e.payment === 'paid' ? e.lessons.every(l => l.status === 'completed') ? 'เรียนจบแล้ว' : 'ตรวจเงินแล้ว' : e.receipts?.at(-1)?.status === 'pending' ? 'รอตรวจสลิป' : 'รอส่งสลิป'}</small></div>{!e.cancelledAt && <button type="button" disabled={busy || e.payment === 'paid' && (e.lessons.every(l => l.status === 'completed') || e.lessons.some(l => Date.parse(l.start) + l.hours * 3600000 > Date.now())) || e.payment !== 'paid' && e.receipts?.at(-1)?.status === 'pending'} onClick={() => void mutate('/enrollments/' + e.id + (e.payment === 'paid' ? '/complete' : '/cancel'), {}, e.payment === 'paid' ? 'ปิดนัดเรียนแล้ว' : 'ยกเลิกนัดและคืนเวลาว่างแล้ว')}>{e.payment === 'paid' ? 'เรียนจบแล้ว' : 'ยกเลิกนัดที่ยังไม่จ่าย'}</button>}</article>)}{!data.enrollments.length && <p className="wp-empty">ยังไม่มีนัดเรียน</p>}</section>
    </>}
    {access.receipts && <section className="wp-section"><h2>สลิปค่าเรียนรอตรวจ {pending.length}</h2>{pending.map(e => <ReceiptReview key={e.receipts.at(-1).id} booking={{ id: e.id, title: e.title, playerName: e.student, amount: Math.round(e.amount * 100), transferAccount: e.transferAccount }} receipt={e.receipts.at(-1)} routeBase="/api/coaching/enrollments" busy={busy} mutate={mutate} />)}{!pending.length && <p className="wp-empty">ยังไม่มีสลิปค่าเรียนรอตรวจ</p>}</section>}
  </>;
}
