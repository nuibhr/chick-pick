import { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
export type OrganizerAuthState = { authenticated: boolean; setupRequired: boolean; authMethod?: 'line'; pairingRequired?: boolean; liffId?: string; configured?: boolean };
export default function LineOrganizerGate({ state, complete }: { state: OrganizerAuthState; complete: () => void }) {
  const [token, setToken] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (state.configured && state.liffId && location.pathname === '/miniapp') void import('@line/liff').then(async ({ default: liff }) => {
      await liff.init({ liffId: state.liffId });
      const idToken = liff.isLoggedIn() ? liff.getIDToken() : null;
      if (!idToken || !active) return;
      const response = await fetch('/api/player/me', { headers: { Authorization: 'Bearer ' + idToken } });
      const me = await response.json(); if (!response.ok) throw Error(me.message || 'ยืนยัน LINE ไม่สำเร็จ');
      if (active) { setToken(idToken); setName(me.name); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [state.configured, state.liffId]);
  return <div className="wg-page"><div className="wg-brand"><img className="wg-brand-logo" src="/brand/chick-pick-mark.png" alt="" /><span className="wg-brand-name">Chick<span>&</span>Pick</span><small>ORGANIZER WORKSPACE</small></div><div className="wg-layout"><section className="wg-story"><small>YOUR CLUB. YOUR CALL.</small><h1>เลือกคนลงสนาม<br />ดูแลทุกเกมด้วยกัน.</h1><p>จัดก๊วน ตรวจสลิป และรับผู้เล่นเข้าสนามด้วยบัญชี LINE ของเจ้าของ</p><div className="wg-art"><img src="/chicken-court-3d.webp" alt="มาสคอต Chick&Pick ในสนาม" /></div></section><section className="wg-card"><ShieldCheck size={34} /><small>PRIVATE WORKSPACE</small><h2>{state.pairingRequired ? 'ผูกบัญชีเจ้าของก๊วน' : 'เข้าสู่พื้นที่ผู้จัด'}</h2><p>{state.configured ? token ? `บัญชี LINE: ${name}` : 'เข้าสู่ LINE ก่อน แล้วระบบจะตรวจสิทธิ์ผู้จัด' : 'กำลังเตรียมการตั้งค่าผู้จัด ติดต่อเจ้าของระบบ'}</p>
    {!token ? <button type="button" disabled={!state.configured || busy} onClick={async () => { if (location.pathname !== '/miniapp') { location.assign('/miniapp?organizer=1'); return; } setBusy(true); setError(''); try { const { default: liff } = await import('@line/liff'); await liff.init({ liffId: state.liffId! }); liff.login({ redirectUri: location.origin + '/miniapp?organizer=1' }); } catch (e) { setError((e as Error).message); setBusy(false); } }}>เข้าสู่ LINE ของผู้จัด</button> : <form onSubmit={async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setError('');
      try { const r = await fetch('/api/finance/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token, pairingToken: form.get('pairingToken') || undefined }) }); const d = await r.json(); if (!r.ok) throw Error(d.message || 'เข้าสู่ระบบไม่สำเร็จ'); complete(); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>{state.pairingRequired && <><label>รหัสผูกเจ้าของ 12 ตัว<input name="pairingToken" type="password" required minLength={12} maxLength={12} pattern="[A-Za-z0-9]{12}" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ตัวอักษรและตัวเลข 12 ตัว" /></label><p className="wg-note"><LockKeyhole size={14} /> บัญชี {name} จะเป็นเจ้าของหลังบ้านเพียงบัญชีเดียว ใช้รหัสนี้ครั้งแรกเท่านั้น ครั้งต่อไปเข้าด้วย LINE</p></>}<button disabled={busy}>{busy ? 'กำลังตรวจสิทธิ์…' : state.pairingRequired ? 'ผูกบัญชีนี้เป็นเจ้าของ' : 'เข้าสู่ workspace'}</button></form>}
    {error && <p className="wg-error" role="alert">{error}</p>}<a href="/miniapp?organizer=0">ดูหน้าผู้เล่น →</a></section></div></div>;
}
