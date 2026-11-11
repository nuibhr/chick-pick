import { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { initializeLine, reauthenticateLine } from './lineSession';
import OrganizerGateLayout from './OrganizerGateLayout';
export type OrganizerAuthState = { authenticated: boolean; setupRequired: boolean; authMethod?: 'line'; pairingRequired?: boolean; liffId?: string; configured?: boolean };
export default function LineOrganizerGate({ state, complete }: { state: OrganizerAuthState; complete: () => void }) {
  const [invited, setInvited] = useState(false), [token, setToken] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (state.configured && state.liffId && location.pathname === '/miniapp') void import('@line/liff').then(async ({ default: liff }) => {
      await initializeLine(liff, state.liffId);
      const idToken = liff.isLoggedIn() ? liff.getIDToken() : null;
      if (!idToken || !active) return;
      const response = await fetch('/api/player/me', { headers: { Authorization: 'Bearer ' + idToken } });
      const me = await response.json(); if (!response.ok) throw Error(me.message || 'ยืนยัน LINE ไม่สำเร็จ');
      if (active) { setToken(idToken); setName(me.name); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [state.configured, state.liffId]);
  return <OrganizerGateLayout><ShieldCheck size={34} /><small>สำหรับผู้จัดและทีมงาน</small><h2 id="organizer-login-title">{state.pairingRequired ? 'ผูกบัญชีเจ้าของก๊วน' : 'เข้าสู่ระบบผู้จัด'}</h2><p>{state.configured ? token ? `บัญชี LINE: ${name}` : 'ใช้บัญชี LINE ที่ได้รับสิทธิ์จากเจ้าของก๊วน' : 'กำลังเตรียมการตั้งค่าผู้จัด ติดต่อเจ้าของระบบ'}</p>
    {!token ? <button type="button" disabled={!state.configured || busy} onClick={async () => { if (location.pathname !== '/miniapp') { location.assign('/miniapp?organizer=1&workspace=' + (location.pathname === '/platform' ? 'platform' : 'operations')); return; } setBusy(true); setError(''); try { const { default: liff } = await import('@line/liff'); await initializeLine(liff, state.liffId!); const result = reauthenticateLine(liff, location.origin + '/miniapp?organizer=1&workspace=' + (new URLSearchParams(location.search).get('workspace') || 'operations')); if (result === 'reopen') { setError('ปิดหน้าต่างนี้ แล้วเปิดเมนูผู้จัดใน LINE อีกครั้ง'); setBusy(false); } } catch (e) { setError((e as Error).message); setBusy(false); } }}>{busy ? 'กำลังเปิด LINE…' : 'เข้าสู่ระบบผู้จัดด้วย LINE'}</button> : <form onSubmit={async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setError('');
      try { const r = await fetch('/api/finance/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token, pairingToken: form.get('pairingToken') || undefined }) }); const d = await r.json(); if (!r.ok) throw Error(d.message || 'เข้าสู่ระบบไม่สำเร็จ'); complete(); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>{!state.pairingRequired && <label className="wg-check"><input type="checkbox" checked={invited} onChange={e => setInvited(e.target.checked)} />มีรหัสเชิญทีมงานจากเจ้าของ</label>}{(state.pairingRequired || invited) && <><label>{state.pairingRequired ? 'รหัสผูกเจ้าของ 12 ตัว' : 'รหัสเชิญทีมงาน 12 ตัว'}<input name="pairingToken" type="password" required minLength={12} maxLength={12} pattern="[A-Za-z0-9]{12}" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ตัวอักษรและตัวเลข 12 ตัว" /></label>{state.pairingRequired && <p className="wg-note"><LockKeyhole size={14} /> บัญชี {name} จะเป็นเจ้าของหลังบ้านเพียงบัญชีเดียว ใช้รหัสนี้ครั้งแรกเท่านั้น ครั้งต่อไปเข้าด้วย LINE</p>}</>}<button disabled={busy}>{busy ? 'กำลังตรวจสิทธิ์…' : state.pairingRequired ? 'ผูกบัญชีนี้เป็นเจ้าของ' : 'เข้าสู่หลังบ้านผู้จัด'}</button></form>}
    {error && <p className="wg-error" role="alert">{error}</p>}</OrganizerGateLayout>;
}
