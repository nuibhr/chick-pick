import { useRef, useState } from 'react';
import type { SlipOkConnection } from '../cloudflare/slipok';
export default function SlipOKSettings({ configured, branchId }: { configured: boolean; branchId?: string | null }) {
  const lock = useRef(false);
  const [result, setResult] = useState<SlipOkConnection | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function check() {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setResult(null);
    try { const r = await fetch('/api/marketplace/setup/slipok', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) }); const d = await r.json(); if (!r.ok) throw Error(r.status === 401 ? 'สิทธิ์เข้าสู่ระบบหมดอายุ กรุณาเข้า LINE ใหม่' : d.message || 'ตรวจการเชื่อมต่อไม่สำเร็จ'); setResult(d); }
    catch (e) { setError(e instanceof Error && ['TimeoutError','AbortError'].includes(e.name) ? 'ตรวจการเชื่อมต่อเกินเวลา กดตรวจใหม่ได้' : (e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  return <section className="wp-section"><h2>ตรวจสลิปผ่าน SlipOK</h2><p>ผู้เล่นโอนเงินและแนบสลิป ระบบตรวจรายการโอน ยอด บัญชีผู้รับ และสลิปซ้ำ ก่อนให้แอดมินอนุมัติ คุณยังเลือกคนเข้าสนามเอง</p><p><b>{(result?.configured ?? configured) ? 'ตั้งค่าคีย์ SlipOK แล้ว · กดตรวจเพื่อยืนยันการเชื่อมต่อจริง' : 'ยังไม่ตั้งคีย์ SlipOK · ตอนนี้แอดมินยังตรวจสลิปเอง'}</b>{branchId && <small> · สาขา {branchId}</small>}</p>{result && <div className={result.connected ? 'wp-success' : 'wp-alert'} role={result.connected ? 'status' : 'alert'}><div><p>{result.message}</p>{result.connected && <p>โควต้าคงเหลือ {result.quota} รายการ{result.overQuota !== undefined && result.overQuota !== null && result.overQuota > 0 ? ' · ใช้เกินโควต้า ' + result.overQuota : ''}</p>}<small>ตรวจเมื่อ {new Date(result.checkedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</small></div></div>}<button type="button" disabled={busy} onClick={() => void check()}>{busy ? 'กำลังตรวจ… รอไม่เกิน 15 วินาที' : 'ตรวจการเชื่อมต่อ SlipOK'}</button>{error && <p className="wp-alert" role="alert">{error}</p>}<p className="wp-note">บัญชีรับเงินใน SlipOK ต้องตรงกับบัญชีที่แอปใช้ การตั้งคีย์เพียงอย่างเดียวยังไม่ยืนยันการเชื่อมต่อหรือเงินเข้า</p></section>;
}
