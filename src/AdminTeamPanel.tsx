import { useEffect, useState } from 'react';
import { roleDescriptions, roleLabels, staffRoles, type StaffRole } from './adminRoles';
type TeamView = { members: { id: string; name: string; role: StaffRole; active: boolean; joinedAt: string }[]; invitations: { id: string; role: StaffRole; expiresAt: string; usedAt?: string; cancelledAt?: string }[] };
async function api(value?: unknown) {
  const r = await fetch('/api/finance/admin-team', value === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const d = await r.json(); if (!r.ok) throw Error(d.message || 'จัดการทีมไม่สำเร็จ'); return d;
}
export default function AdminTeamPanel() {
  const [team, setTeam] = useState<TeamView | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [code, setCode] = useState(''), [expiry, setExpiry] = useState(''), [confirm, setConfirm] = useState<string | null>(null);
  const load = async () => { try { setTeam(await api()); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  async function mutate(value: unknown) { if (busy) return; setBusy(true); setError(''); try { const d = await api(value); setCode(d.code || ''); setExpiry(d.invitation?.expiresAt || ''); setConfirm(null); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <section className="wp-section wp-team"><h2>ทีมและระดับสิทธิ์</h2><p>เจ้าของเพียงบัญชีเดียวตั้งเปอร์เซ็นต์ บัญชีรับโอน เปิดรับจอง และจัดการสิทธิ์ได้ ทีมงานใช้ LINE ของตัวเอง</p>
    <div className="wp-role-grid">{staffRoles.map(role => <article key={role}><h3>{roleLabels[role]}</h3><p>{roleDescriptions[role]}</p></article>)}</div>
    <form className="wp-form" onSubmit={e => { e.preventDefault(); void mutate({ action: 'invite', role: new FormData(e.currentTarget).get('role') }); }}><label>เชิญทีมงานด้วยสิทธิ์<select name="role" defaultValue="operator">{staffRoles.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}</select></label><button className="wp-primary" disabled={busy}>สร้างคำเชิญ 12 ตัว</button></form>
    {code && <div className="wp-invitation" role="status"><b>รหัสเชิญแสดงครั้งนี้เท่านั้น</b><code>{code}</code><p>ใช้ครั้งเดียวภายใน {new Date(expiry).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} ส่งให้คนที่ต้องการเชิญเท่านั้น ห้ามส่งรหัสผูกเจ้าของ</p><p>ให้เพื่อนเปิดหลังบ้าน → เข้าสู่ LINE ของตัวเอง → เลือก “มีรหัสเชิญทีมงาน”</p><button onClick={() => { setCode(''); setExpiry(''); }}>ซ่อนรหัส</button></div>}
    {error && <p className="wp-alert" role="alert">{error}</p>}
    <h3>ทีมงาน ({team?.members.filter(m => m.active).length || 0})</h3>{team?.members.map(m => <article className="wp-member" key={m.id}><div><b>{m.name}</b><small>{m.active ? roleLabels[m.role] : 'เพิกถอนแล้ว'}</small></div>{m.active && <><label>ระดับสิทธิ์<select aria-label={'สิทธิ์ของ ' + m.name} value={m.role} disabled={busy} onChange={e => void mutate({ action: 'role', id: m.id, role: e.target.value })}>{staffRoles.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}</select></label>{confirm === m.id ? <div><p>เพิกถอน {m.name}? คำขอครั้งถัดไปจะเข้าไม่ได้</p><button disabled={busy} onClick={() => void mutate({ action: 'revoke', id: m.id })}>ยืนยันเพิกถอน</button><button onClick={() => setConfirm(null)}>ย้อนกลับ</button></div> : <button disabled={busy} onClick={() => setConfirm(m.id)}>เพิกถอนสิทธิ์</button>}</>}</article>)}
    {team && !team.members.length && <p className="wp-empty">ยังไม่มีทีมงาน เริ่มจากเชิญผู้จัดก๊วนเพื่อช่วยดูสนาม</p>}
    <h3>คำเชิญที่ยังไม่ใช้</h3>{team?.invitations.filter(i => !i.usedAt && !i.cancelledAt && Date.parse(i.expiresAt) > Date.now()).map(i => <article className="wp-member" key={i.id}><span>{roleLabels[i.role]} · หมดอายุ {new Date(i.expiresAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</span><button disabled={busy} onClick={() => void mutate({ action: 'cancel-invite', id: i.id })}>ยกเลิกคำเชิญ</button></article>)}
    <p className="wp-note">เปลี่ยนระดับหรือเพิกถอนจะยกเลิก session เดิมของทีมงาน ต้องเข้า LINE ใหม่ ระบบบันทึกผู้ทำรายการใน audit ของฐานข้อมูล</p>
  </section>;
}
