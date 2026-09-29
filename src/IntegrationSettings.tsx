import { useEffect, useState } from 'react';
import { ExternalLink, Landmark, ShieldCheck } from 'lucide-react';
import type { TransferAccount } from './marketplaceTypes';

type Setup = { mode: 'preview'; storage: 'local-json'; line: { channelConfigured: boolean; liffConfigured: boolean }; ocrConfigured: boolean; transferAccount: TransferAccount | null };
export default function IntegrationSettings() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [draft, setDraft] = useState<TransferAccount>({ bankName: '', accountName: '', accountNumber: '' });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/marketplace/setup', { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.message);
      setSetup(data); if (data.transferAccount) setDraft(data.transferAccount);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, []);
  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/marketplace/setup/transfer-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const result = await response.json(); if (!response.ok) throw Error(result.message);
      setDraft(result.transferAccount); setMessage(result.message);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="ws-card ws-feature-page ws-connection-settings"><h2>เตรียม LINE และบัญชีรับโอน</h2>
    {error && <p role="alert">{error}</p>}{!setup ? <p>กำลังตรวจการตั้งค่า…</p> : <>
      <div className="ws-integration"><b>LINE Login / LIFF</b><span className="ws-status completed">{setup.line.channelConfigured && setup.line.liffConfigured ? 'ใส่ค่าแล้ว · รอทดสอบบนมือถือ' : 'ยังตั้งค่าไม่ครบ'}</span></div>
      <p className="ws-setting-note">ต้องมี HTTPS URL, LINE Channel ID และ LIFF ID ก่อนทดสอบเข้าสู่ระบบจริง เปิดสิทธิ์ openid และ profile ใน LIFF แล้วตั้งค่าไว้บนเซิร์ฟเวอร์</p>
      <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer">เปิด LINE Developers <ExternalLink size={13} /></a>
      <div className="ws-integration"><b>OCR อ่านสลิป</b><span className="ws-status completed">{setup.ocrConfigured ? 'ใส่ค่าแล้ว · รอทดสอบการอ่าน' : 'ยังไม่เชื่อม · แอดมินตรวจภาพได้'}</span></div>
      <form onSubmit={event => { event.preventDefault(); void save(); }}><h3><Landmark size={18} /> บัญชีรับโอนสำหรับการจองใหม่</h3><p>ผู้จองจะเห็นบัญชีนี้ในรายการของตัวเอง เปลี่ยนแล้วรายการเดิมยังใช้บัญชีเดิม เพื่อตรวจยอดให้ตรงกัน</p>
        <label>ธนาคาร<input required maxLength={120} value={draft.bankName} onChange={event => setDraft({ ...draft, bankName: event.target.value })} placeholder="ชื่อธนาคาร" autoComplete="off" /></label>
        <label>ชื่อบัญชี<input required maxLength={120} value={draft.accountName} onChange={event => setDraft({ ...draft, accountName: event.target.value })} placeholder="ชื่อตามบัญชีธนาคาร" autoComplete="off" /></label>
        <label>เลขบัญชี<input required inputMode="numeric" pattern="[0-9 -]{10,25}" maxLength={25} value={draft.accountNumber} onChange={event => setDraft({ ...draft, accountNumber: event.target.value })} placeholder="กรอกเลขบัญชีให้ครบ" autoComplete="off" /></label>
        <button className="ws-primary" type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกบัญชีสำหรับทดลอง'}</button>
      </form>{message && <p role="status">{message}</p>}
      <p className="ws-setting-note"><ShieldCheck size={15} /> ยังเป็นพรีวิวในเครื่อง การตั้งบัญชีไม่เปิดรับเงินจริง ระบบฐานข้อมูล สิทธิ์ผู้จัด และที่เก็บสลิปถาวรต้องพร้อมก่อน</p>
    </>}
  </section>;
}
