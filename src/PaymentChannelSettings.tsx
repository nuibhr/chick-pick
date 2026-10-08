import { useState, type FormEvent } from 'react';
import { Building2, Smartphone, ShieldCheck } from 'lucide-react';
import type { PaymentChannel } from './paymentChannels';

export default function PaymentChannelSettings({ channels, busy, save }: { channels: PaymentChannel[]; busy: boolean; save: (channels: PaymentChannel[]) => Promise<boolean> }) {
  const [bank, setBank] = useState(channels.find(c => c.kind === 'bank') || { id: 'bank' as const, kind: 'bank' as const, enabled: false, bankName: '', accountName: '', accountNumber: '' });
  const [phone, setPhone] = useState(channels.find(c => c.kind === 'promptpay') || { id: 'promptpay' as const, kind: 'promptpay' as const, enabled: false, bankName: 'พร้อมเพย์', accountName: '', accountNumber: '' });
  const [linked, setLinked] = useState(Boolean(phone.linkedBank));
  const [linkedName, setLinkedName] = useState(phone.linkedBank?.bankName || ''), [linkedNumber, setLinkedNumber] = useState(phone.linkedBank?.accountNumber || '');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const values: PaymentChannel[] = [];
    if (bank.enabled || bank.accountName || bank.accountNumber || bank.bankName) values.push(bank);
    if (phone.enabled || phone.accountName || phone.accountNumber) values.push({ ...phone, linkedBank: linked ? { bankName: linkedName, accountNumber: linkedNumber } : undefined });
    await save(values);
  }
  return <section className="wp-section"><h2>ช่องทางรับเงินที่แสดงให้ลูกค้า</h2><p>เปิดบัญชีธนาคาร พร้อมเพย์ หรือทั้งสองช่องทางได้ พร้อมเพย์เป็นคนละบัญชีรับเงินได้ การเปลี่ยนนี้ใช้กับการจองใหม่ รายการเดิมเก็บช่องทาง ณ ตอนจอง</p>
    <form className="wp-form" onSubmit={e => void submit(e)}>
      <fieldset className="wp-payment-channel"><legend><Building2 size={18} /> บัญชีธนาคาร</legend><label className="wp-check"><input type="checkbox" checked={bank.enabled} onChange={e => setBank({ ...bank, enabled: e.target.checked })} />เปิดแสดงบัญชีธนาคาร</label>
        <label>ธนาคาร<input required={bank.enabled || Boolean(bank.accountNumber)} value={bank.bankName} onChange={e => setBank({ ...bank, bankName: e.target.value })} maxLength={120} placeholder="เช่น กรุงศรี" /></label>
        <label>ชื่อบัญชีธนาคาร<input required={bank.enabled || Boolean(bank.accountNumber)} value={bank.accountName} onChange={e => setBank({ ...bank, accountName: e.target.value })} maxLength={120} /></label>
        <label>เลขบัญชีธนาคาร<input required={bank.enabled || Boolean(bank.accountName)} value={bank.accountNumber} onChange={e => setBank({ ...bank, accountNumber: e.target.value })} inputMode="numeric" pattern="[0-9 -]{10,20}" maxLength={20} /></label>
      </fieldset>
      <fieldset className="wp-payment-channel"><legend><Smartphone size={18} /> พร้อมเพย์ด้วยเบอร์โทร</legend><label className="wp-check"><input type="checkbox" checked={phone.enabled} onChange={e => setPhone({ ...phone, enabled: e.target.checked })} />เปิดแสดงพร้อมเพย์และ QR ตามยอดจอง</label>
        <label>ชื่อผู้รับพร้อมเพย์<input required={phone.enabled || Boolean(phone.accountNumber)} value={phone.accountName} onChange={e => setPhone({ ...phone, accountName: e.target.value })} maxLength={120} /></label>
        <label>เบอร์โทรพร้อมเพย์<input type="tel" required={phone.enabled || Boolean(phone.accountName)} value={phone.accountNumber} onChange={e => setPhone({ ...phone, accountNumber: e.target.value })} inputMode="tel" pattern="0[689][0-9 -]{8,12}" maxLength={14} placeholder="เบอร์ที่ลงทะเบียนพร้อมเพย์ 10 หลัก" /></label>
        <label className="wp-check"><input type="checkbox" checked={linked} onChange={e => setLinked(e.target.checked)} />ระบุบัญชีธนาคารที่เบอร์นี้ผูกไว้เพื่อช่วยตรวจสลิป</label>
        {linked && <><label>ธนาคารที่พร้อมเพย์ผูกไว้<input required value={linkedName} onChange={e => setLinkedName(e.target.value)} maxLength={120} /></label><label>เลขบัญชีที่พร้อมเพย์ผูกไว้<input required value={linkedNumber} onChange={e => setLinkedNumber(e.target.value)} inputMode="numeric" pattern="[0-9 -]{10,20}" maxLength={20} /></label></>}
        <small>หากธนาคารไม่ส่งเบอร์ผู้รับในผลตรวจ ระบบใช้บัญชีที่ผูกไว้เทียบแทนได้ ข้อมูลส่วนนี้ใช้ตรวจสลิป ไม่ใช่บัญชีกรุงศรีด้านบนโดยอัตโนมัติ</small>
      </fieldset>
      {!bank.enabled && !phone.enabled && <p className="wp-alert" role="alert">ปิดทั้งสองช่องทางแล้ว การจองใหม่จะยังรับไม่ได้จนเปิดอย่างน้อยหนึ่งช่องทาง รายการเดิมยังส่งสลิปได้</p>}
      <p className="wp-note"><ShieldCheck size={16} /> ต้องผูกผู้รับของทั้งสองช่องทางใน SlipOK สาขาเดียวกันให้เรียบร้อย การบันทึกในแอปไม่ได้เพิ่มบัญชีให้ SlipOK อัตโนมัติ</p>
      <button type="submit" className="wp-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกช่องทางรับเงิน'}</button>
    </form></section>;
}
