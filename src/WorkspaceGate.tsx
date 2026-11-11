import { useEffect, useState } from 'react';
import MvpApp from './MvpApp';
import { ShieldCheck } from 'lucide-react';
import './workspace-gate.css';
import OrganizerGateLayout from './OrganizerGateLayout';
import LineOrganizerGate, { type OrganizerAuthState } from './LineOrganizerGate';
import WorkerPilotAdmin from './WorkerPilotAdmin';
export default function WorkspaceGate(){
 const [state,setState]=useState<OrganizerAuthState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch('/api/finance/auth').then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.message||'เปิดพื้นที่ผู้จัดไม่ได้');setState(d);}).catch(e=>setError((e as Error).message));},[]);
 if(state?.authMethod==='line')return state.authenticated?<WorkerPilotAdmin/>:<LineOrganizerGate state={state} complete={()=>setState({...state,authenticated:true})}/>;
 if(state?.authenticated)return <MvpApp/>;
 return <OrganizerGateLayout><ShieldCheck size={34}/><small>สำหรับผู้จัดและทีมงาน</small><h2 id="organizer-login-title">{state?.setupRequired?'ตั้งรหัสผ่านผู้จัดครั้งแรก':'เข้าสู่ระบบผู้จัด'}</h2><p>ใช้รหัสผ่านแอดมินเดียวกับหน้าบัญชีและค่าคอม</p><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(state?.setupRequired&&f.get('password')!==f.get('confirm')){setError('รหัสผ่านไม่ตรงกัน');return;}setBusy(true);setError('');try{const r=await fetch('/api/finance/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:f.get('password'),setup:state?.setupRequired})});const d=await r.json();if(!r.ok)throw Error(d.message||'เข้าสู่ระบบไม่สำเร็จ');setState({authenticated:true,setupRequired:false});}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}><label>รหัสผ่าน<input type="password" name="password" required minLength={12} maxLength={128} autoComplete={state?.setupRequired?'new-password':'current-password'} placeholder="อย่างน้อย 12 ตัวอักษร"/></label>{state?.setupRequired&&<label>ยืนยันรหัสผ่าน<input type="password" name="confirm" required minLength={12} autoComplete="new-password"/></label>}<button disabled={!state||busy}>{busy?'กำลังตรวจสอบ…':state?.setupRequired?'ตั้งรหัสผ่านและเข้าใช้งาน':'เข้าสู่หลังบ้านผู้จัด'}</button></form>{error&&<p role="alert" className="wg-error">{error}</p>}<small className="wg-note">ระบบพรีวิว · ยังไม่เรียกเก็บเงินจริง</small></OrganizerGateLayout>;
}
