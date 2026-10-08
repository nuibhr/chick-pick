import { useEffect, useState } from 'react';
import type { Venue } from './venueTypes';
import type { Session } from './marketplaceTypes';

export default function OpenPlayForm({ ownerName, busy, save, session }: { ownerName: string; busy: boolean; save: (body: unknown) => Promise<boolean>; session?: Session }) {
  const [venues, setVenues] = useState<Venue[]>([]), [venueId, setVenueId] = useState(session?.venueId || ''), [error, setError] = useState('');
  const localTime = (value?: string) => value ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16) : '';
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void fetch('/api/marketplace/venues').then(async r => { const data = await r.json(); if (!r.ok) throw Error(data.message || 'โหลดสนามไม่สำเร็จ'); if (active) { setVenues(data.venues.filter((v: Venue) => v.active)); setLoading(false); } }).catch(e => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, []);
  return <form className="wp-form" onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    const f = new FormData(event.currentTarget), venue = venues.find(v => v.id === venueId);
    const startsAt = new Date(String(f.get('startsAt')) + '+07:00'), endsAt = new Date(String(f.get('endsAt')) + '+07:00');
    if (!venue || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 24 * 3600000) { setError('เลือกสนาม เวลาเริ่ม–จบที่ถูกต้อง และระยะเวลาไม่เกิน 24 ชั่วโมง'); return; }
    setError('');
    const body = Object.fromEntries(f);
    const clock = (date: Date) => date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    await save({ ...body, venue: venue.name, venueId: venue.id, area: venue.area, price: Number(body.price), capacity: Number(body.capacity), courtCount: Number(body.courtCount), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), time: clock(startsAt) + '–' + clock(endsAt) });
  }}>
    {error && <p className="wp-alert" role="alert">{error}</p>}
    <label>ชื่อก๊วน<input name="title" maxLength={120} defaultValue={session?.title} required /></label>
    <label>สนาม<select value={venueId} onChange={e => setVenueId(e.target.value)} required disabled={loading}><option value="">{loading ? 'กำลังโหลดสนาม…' : 'เลือกสนามที่เปิดแสดง'}</option>{venues.map(v => <option key={v.id} value={v.id}>{v.name} · {v.area}</option>)}</select></label>
    {!loading && !venues.length && <p className="wp-alert">เพิ่มสนามจริงใน <a href="/miniapp?organizer=1&workspace=operations&section=venues">จัดการสนาม</a> ก่อนสร้างก๊วน</p>}
    <label>ผู้จัด<input name="host" maxLength={120} defaultValue={session?.host || ownerName} required /></label>
    <label>เริ่มเล่น (เวลาไทย)<input name="startsAt" type="datetime-local" defaultValue={localTime(session?.startsAt)} required /></label>
    <label>จบเล่น (เวลาไทย)<input name="endsAt" type="datetime-local" defaultValue={localTime(session?.endsAt)} required /></label>
    <label>ราคา / คน (บาท)<input name="price" type="number" min="1" max="100000" step="0.01" defaultValue={session?.price} required /></label>
    <label>จำนวนคนสูงสุด<input name="capacity" type="number" min="4" max="100" defaultValue={session?.capacity || 12} required /></label>
    <label>จำนวนคอร์ท<input name="courtCount" type="number" min="1" max="20" defaultValue={session?.courtCount || 1} required /></label>
    <label>ระดับการเล่น<select name="style" defaultValue={session?.dupr === '3.5+' ? 'high' : 'casual'}><option value="casual">เบา–กลาง · ต่ำกว่า 3.5</option><option value="high">สูง · 3.5 ขึ้นไป</option></select></label>
    <button className="wp-primary" disabled={busy || loading || !venues.length}>บันทึกก๊วน</button>
  </form>;
}
