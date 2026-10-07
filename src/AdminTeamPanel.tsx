import { useEffect, useState } from 'react';
import { describeRoles, memberRoles, roleDescriptions, roleLabels, staffRoles, type StaffRole } from './adminRoles';
type TeamRow = { id: string; role: StaffRole; roles?: StaffRole[] };
type TeamView = { members: (TeamRow & { name: string; active: boolean; joinedAt: string })[]; invitations: (TeamRow & { expiresAt: string; usedAt?: string; cancelledAt?: string })[] };
async function api(value?: unknown) {
  const r = await fetch('/api/finance/admin-team', value === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const d = await r.json(); if (!r.ok) throw Error(d.message || 'จัดการทีมไม่สำเร็จ'); return d;
}
function RoleFields({ selected, disabled, legend }: { selected: StaffRole[]; disabled: boolean; legend: string }) {
  return <fieldset className="wp-role-fields" disabled={disabled}><legend>{legend}</legend>{staffRoles.map(role => <label key={role}><input type="checkbox" name="roles" value={role} defaultChecked={selected.includes(role)} /><span>{roleLabels[role]}</span></label>)}</fieldset>;
}
export default function AdminTeamPanel() {
  const [team, setTeam] = useState<TeamView | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [code, setCode] = useState(''), [expiry, setExpiry] = useState(''), [confirm, setConfirm] = useState<string | null>(null);
  const load = async () => { try { setTeam(await api()); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  async function mutate(value: unknown) { if (busy) return; setBusy(true); setError(''); try { const d = await api(value); setCode(d.code || ''); setExpiry(d.invitation?.expiresAt || ''); setConfirm(null); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function saveRoles(form: HTMLFormElement, id?: string) {
    const roles = new FormData(form).getAll('roles'); if (!roles.length) { setError('เลือกสิทธิ์อย่างน้อยหนึ่งรายการ'); return; }
    void mutate({ action: id ? 'role' : 'invite', ...(id ? { id } : {}), roles });
  }
  return <section className="wp-section wp-team"><h2>ทีมและสิทธิ์</h2><p>หนึ่งคนมีหลายสิทธิ์ได้ เช่น ผู้จัดก๊วน + ฝ่ายการเงิน เจ้าของเท่านั้นที่เปลี่ยนเปอร์เซ็นต์ บัญชีรับโอน เปิดรับจอง และจัดการทีมได้</p>
    <div className="wp-role-grid">{staffRoles.map(role => <article key={role}><h3>{roleLabels[role]}</h3><p>{roleDescriptions[role]}</p></article>)}</div>
    <form className="wp-form" onSubmit={e => { e.preventDefault(); saveRoles(e.currentTarget); }}><RoleFields selected={['operator']} disabled={busy} legend="สิทธิ์สำหรับคำเชิญใหม่ · เลือกได้หลายข้อ" /><button className="wp-primary" disabled={busy}>สร้างคำเชิญ 12 ตัว</button></form>
    {code && <div className="wp-invitation" role="status"><b>รหัสเชิญแสดงครั้งนี้เท่านั้น</b><code>{code}</code><p>ใช้ครั้งเดียวภายใน {new Date(expiry).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} ส่งให้คนที่ต้องการเชิญเท่านั้น ห้ามส่งรหัสผูกเจ้าของ</p><p>ให้ทีมงานเปิดหลังบ้าน → เข้าสู่ LINE ของตัวเอง → เลือก “มีรหัสเชิญทีมงาน”</p><button onClick={() => { setCode(''); setExpiry(''); }}>ซ่อนรหัส</button></div>}
    {error && <p className="wp-alert" role="alert">{error}</p>}
    <h3>ทีมงาน ({team?.members.filter(m => m.active).length || 0})</h3>{team?.members.map(m => <article className="wp-member" key={m.id}><div><b>{m.name}</b><small>{m.active ? describeRoles(memberRoles(m)) : 'เพิกถอนแล้ว'}</small></div>{m.active && <><form key={memberRoles(m).join(',')} onSubmit={e => { e.preventDefault(); saveRoles(e.currentTarget, m.id); }}><RoleFields selected={memberRoles(m)} disabled={busy} legend={'สิทธิ์ของ ' + m.name} /><button className="wp-primary" disabled={busy}>บันทึกสิทธิ์</button></form>{confirm === m.id ? <div><p>เพิกถอน {m.name}? คำขอครั้งถัดไปจะเข้าไม่ได้</p><button disabled={busy} onClick={() => void mutate({ action: 'revoke', id: m.id })}>ยืนยันเพิกถอน</button><button onClick={() => setConfirm(null)}>ย้อนกลับ</button></div> : <button disabled={busy} onClick={() => setConfirm(m.id)}>เพิกถอนสิทธิ์</button>}</>}</article>)}
    {team && !team.members.length && <p className="wp-empty">ยังไม่มีทีมงาน เริ่มจากเชิญผู้จัดก๊วนเพื่อช่วยดูสนาม</p>}
    <h3>คำเชิญที่ยังไม่ใช้</h3>{team?.invitations.filter(i => !i.usedAt && !i.cancelledAt && Date.parse(i.expiresAt) > Date.now()).map(i => <article className="wp-member" key={i.id}><span>{describeRoles(memberRoles(i))} · หมดอายุ {new Date(i.expiresAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</span><button disabled={busy} onClick={() => void mutate({ action: 'cancel-invite', id: i.id })}>ยกเลิกคำเชิญ</button></article>)}
    <p className="wp-note">เพิ่มหรือลดสิทธิ์จะยกเลิก session เดิม ทีมงานต้องเข้า LINE ใหม่ ระบบบันทึกผู้เปลี่ยนสิทธิ์ใน audit</p>
  </section>;
}
