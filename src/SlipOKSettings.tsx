import { useEffect, useState } from 'react';
type Check = { configured: boolean; connected: boolean; quota: number | null; overQuota?: number | null; message: string };
export default function SlipOKSettings({ configured, branchId }: { configured: boolean; branchId?: string | null }) {
  const [result, setResult] = useState<Check | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function check() {
    if (busy) return; setBusy(true); setError('');
    try { const r = await fetch('/api/marketplace/setup/slipok'); const d = await r.json(); if (!r.ok) throw Error(d.message || 'ตรวจการเชื่อมต่อไม่สำเร็จ'); setResult(d); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { if (configured) void check(); }, [configured, branchId]);
  return <section className="wp-section"><h2>ตรวจสลิปผ่าน SlipOK</h2><p>ผู้เล่นโอนเงินและแนบสลิป ระบบตรวจรายการโอน ยอด บัญชีผู้รับ และสลิปซ้ำ ก่อนให้แอดมินอนุมัติ คุณยังเลือกคนเข้าสนามเอง</p><p><b>{configured ? 'ตั้งค่าคีย์ SlipOK แล้ว' : 'ยังไม่ตั้งคีย์ SlipOK · ตอนนี้แอดมินยังตรวจสลิปเอง'}</b>{branchId && <small> · สาขา {branchId}</small>}</p>{result && <div role="status"><p>{result.message}</p>{result.connected && <p>โควต้าคงเหลือ {result.quota} รายการ{result.overQuota !== undefined && result.overQuota !== null && result.overQuota > 0 ? ' · ใช้เกินโควต้า ' + result.overQuota : ''}</p>}</div>}<button type="button" disabled={busy || !configured} onClick={() => void check()}>{busy ? 'กำลังตรวจ…' : 'ตรวจการเชื่อมต่อ SlipOK'}</button>{error && <p className="wp-alert" role="alert">{error}</p>}<p className="wp-note">บัญชีรับเงินใน SlipOK ต้องตรงกับบัญชีที่แอปใช้ ไม่มีช่องใส่ Secret ในหน้าแอป การจ่ายใหม่ไม่ใช้ Stripe ส่วนรายการเดิมเก็บไว้เพื่อกระทบยอด</p></section>;
}
