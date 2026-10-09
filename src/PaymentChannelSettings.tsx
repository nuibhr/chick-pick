import { useState, type FormEvent } from 'react';
import { Building2, Smartphone, QrCode, ShieldCheck } from 'lucide-react';
import { configuredChannels, parsePaymentChannels, type PaymentChannel } from './paymentChannels';
import BankQrInput from './BankQrInput';

export default function PaymentChannelSettings({ channels, busy, save }: { channels: PaymentChannel[]; busy: boolean; save: (channels: PaymentChannel[]) => Promise<boolean> }) {
  const initial = configuredChannels({ channels });
  const [readingQr, setReadingQr] = useState(false), [error, setError] = useState('');
  const [bank, setBank] = useState<PaymentChannel>(initial.find(c => c.id === 'bank') || { id: 'bank', kind: 'bank', enabled: false, bankName: '', accountName: '', accountNumber: '' });
  const [bankPhone, setBankPhone] = useState<PaymentChannel>(initial.find(c => c.id === 'bank-promptpay') || { id: 'bank-promptpay', kind: 'promptpay', enabled: false, bankName: bank.bankName, accountName: '', accountNumber: '', linkedBank: { bankName: bank.bankName, accountNumber: bank.accountNumber } });
  const [bankConfirmed, setBankConfirmed] = useState(Boolean(initial.find(c => c.id === 'bank-promptpay')));
  const [phone, setPhone] = useState<PaymentChannel>(initial.find(c => c.id === 'promptpay') || { id: 'promptpay', kind: 'promptpay', enabled: false, bankName: 'พร้อมเพย์', accountName: '', accountNumber: '' });
  const [linked, setLinked] = useState(Boolean(phone.linkedBank));
  const [linkedName, setLinkedName] = useState(phone.linkedBank?.bankName || ''), [linkedNumber, setLinkedNumber] = useState(phone.linkedBank?.accountNumber || '');
  const has = (c: PaymentChannel) => c.enabled || Boolean(c.accountName || c.accountNumber);
  function changeBankPhone(value: Partial<PaymentChannel>) { setBankPhone(current => ({ ...current, ...value })); setBankConfirmed(false); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (has(bankPhone) && !bankConfirmed) { setError('ยืนยันว่าเบอร์พร้อมเพย์ช่องที่สองผูกกับบัญชีธนาคารที่ระบุแล้ว'); return; }
    const values: PaymentChannel[] = [];
    if (has(bank) || bank.bankName) values.push({ ...bank, bankPromptPayPhone: undefined });
    if (has(bankPhone)) values.push(bankPhone);
    if (has(phone)) values.push({ ...phone, linkedBank: linked ? { bankName: linkedName, accountNumber: linkedNumber } : undefined });
    const parsed = parsePaymentChannels(values);
    if (!parsed) { setError('ตรวจชื่อผู้รับ เลขบัญชี เบอร์พร้อมเพย์ 10 หลัก และบัญชีที่ผูกให้ครบ เบอร์พร้อมเพย์ของสองช่องต้องไม่ซ้ำกัน'); return; }
    await save(parsed);
  }
  return <section className="wp-section"><h2>ช่องทางรับเงิน 3 ช่อง</h2><p>เปิด–ปิดแยกกันได้: โอนเลขบัญชีกรุงศรี, พร้อมเพย์ที่ผูกกรุงศรี และพร้อมเพย์อีกบัญชี การเปลี่ยนใช้กับการจองใหม่ รายการเดิมเก็บช่องทาง ณ ตอนจอง</p>
    <form className="wp-form" onSubmit={e => void submit(e)}>
      <fieldset className="wp-payment-channel"><legend><Building2 size={18} /> 1. โอนผ่านเลขบัญชีกรุงศรี</legend><label className="wp-check"><input type="checkbox" checked={bank.enabled} onChange={e => setBank({ ...bank, enabled: e.target.checked })} />เปิดแสดงเลขบัญชีสำหรับโอนตรง</label>
        <label>ธนาคาร<input required={has(bank)} value={bank.bankName} onChange={e => setBank({ ...bank, bankName: e.target.value, bankQrPayload: undefined })} maxLength={120} placeholder="เช่น กรุงศรี" /></label>
        <label>ชื่อบัญชีธนาคาร<input required={has(bank)} value={bank.accountName} onChange={e => setBank({ ...bank, accountName: e.target.value })} maxLength={120} /></label>
        <label>เลขบัญชีธนาคาร<input required={has(bank)} value={bank.accountNumber} onChange={e => setBank({ ...bank, accountNumber: e.target.value, bankQrPayload: undefined })} inputMode="numeric" pattern="[0-9 -]{10,20}" maxLength={20} /></label>
        <small>ลูกค้าคัดลอกเลขบัญชีเพื่อโอนตรง ส่วน QR พร้อมเพย์พร้อมยอดจองอยู่ช่องที่สอง</small>
        <BankQrInput value={bank.bankQrPayload} change={bankQrPayload => setBank(current => ({ ...current, bankQrPayload }))} busyChanged={setReadingQr} />
      </fieldset>
      <fieldset className="wp-payment-channel"><legend><QrCode size={18} /> 2. พร้อมเพย์ที่ผูกบัญชีกรุงศรี</legend><label className="wp-check"><input type="checkbox" checked={bankPhone.enabled} onChange={e => setBankPhone({ ...bankPhone, enabled: e.target.checked })} />เปิดแสดงพร้อมเพย์กรุงศรีและ QR ตามยอดจอง</label>
        <label>ชื่อผู้รับพร้อมเพย์กรุงศรี<input required={has(bankPhone)} value={bankPhone.accountName} onChange={e => changeBankPhone({ accountName: e.target.value })} maxLength={120} /></label>
        <label>เบอร์พร้อมเพย์ที่ผูกกรุงศรี<input type="tel" required={has(bankPhone)} value={bankPhone.accountNumber} onChange={e => changeBankPhone({ accountNumber: e.target.value })} inputMode="tel" pattern="0[689][0-9 -]{8,12}" maxLength={14} /></label>
        <label>ธนาคารที่เบอร์นี้ผูกไว้<input required={has(bankPhone)} value={bankPhone.linkedBank?.bankName || ''} onChange={e => changeBankPhone({ bankName: e.target.value, linkedBank: { bankName: e.target.value, accountNumber: bankPhone.linkedBank?.accountNumber || '' } })} maxLength={120} /></label>
        <label>เลขบัญชีที่เบอร์นี้ผูกไว้<input required={has(bankPhone)} value={bankPhone.linkedBank?.accountNumber || ''} onChange={e => changeBankPhone({ linkedBank: { bankName: bankPhone.linkedBank?.bankName || '', accountNumber: e.target.value } })} inputMode="numeric" pattern="[0-9 -]{10,20}" maxLength={20} /></label>
        <label className="wp-check"><input type="checkbox" required={has(bankPhone)} checked={bankConfirmed} onChange={e => setBankConfirmed(e.target.checked)} />ยืนยันว่าเบอร์นี้ลงทะเบียนพร้อมเพย์กับบัญชีที่ระบุแล้ว</label>
        <small>สร้าง QR พร้อมยอดก๊วนหรือค่าเรียน เปิดช่องนี้ได้แม้ปิดการโอนเลขบัญชีช่องแรก การบันทึกในแอปไม่ได้ลงทะเบียนพร้อมเพย์ให้กับธนาคาร</small>
      </fieldset>
      <fieldset className="wp-payment-channel"><legend><Smartphone size={18} /> 3. พร้อมเพย์อีกบัญชี</legend><label className="wp-check"><input type="checkbox" checked={phone.enabled} onChange={e => setPhone({ ...phone, enabled: e.target.checked })} />เปิดแสดงพร้อมเพย์อีกบัญชีและ QR ตามยอดจอง</label>
        <label>ชื่อผู้รับพร้อมเพย์อีกบัญชี<input required={has(phone)} value={phone.accountName} onChange={e => setPhone({ ...phone, accountName: e.target.value })} maxLength={120} /></label>
        <label>เบอร์โทรพร้อมเพย์อีกบัญชี<input type="tel" required={has(phone)} value={phone.accountNumber} onChange={e => setPhone({ ...phone, accountNumber: e.target.value })} inputMode="tel" pattern="0[689][0-9 -]{8,12}" maxLength={14} /></label>
        <label className="wp-check"><input type="checkbox" checked={linked} onChange={e => setLinked(e.target.checked)} />ระบุบัญชีธนาคารที่เบอร์นี้ผูกไว้เพื่อช่วยตรวจสลิป</label>
        {linked && <><label>ธนาคารที่พร้อมเพย์อีกบัญชีผูกไว้<input required value={linkedName} onChange={e => setLinkedName(e.target.value)} maxLength={120} /></label><label>เลขบัญชีที่พร้อมเพย์อีกบัญชีผูกไว้<input required value={linkedNumber} onChange={e => setLinkedNumber(e.target.value)} inputMode="numeric" pattern="[0-9 -]{10,20}" maxLength={20} /></label></>}
        <small>เป็นบัญชีรับเงินแยกจากกรุงศรี เบอร์ต้องไม่ซ้ำกับช่องที่สอง ข้อมูลบัญชีที่ผูกใช้ตรวจสลิปและไม่แสดงเลขนี้ให้ลูกค้า</small>
      </fieldset>
      {!bank.enabled && !bankPhone.enabled && !phone.enabled && <p className="wp-alert" role="alert">ปิดทั้งสามช่องทางแล้ว การจองใหม่จะยังรับไม่ได้จนเปิดอย่างน้อยหนึ่งช่องทาง รายการเดิมยังส่งสลิปได้</p>}
      <p className="wp-note"><ShieldCheck size={16} /> ต้องตั้งบัญชีผู้รับใน SlipOK ให้ตรงกับบัญชีที่เปิดรับเงินจริง การบันทึกในแอปไม่ได้เพิ่มบัญชีให้ SlipOK อัตโนมัติ</p>
      {error && <p className="wp-alert" role="alert">{error}</p>}
      <button type="submit" className="wp-primary" disabled={busy || readingQr}>{readingQr ? 'กำลังอ่าน QR…' : busy ? 'กำลังบันทึก…' : 'บันทึกช่องทางรับเงินทั้งสามช่อง'}</button>
    </form></section>;
}
