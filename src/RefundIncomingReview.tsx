import { useState } from 'react';
import type { ReceiptSubmission } from './marketplaceTypes';
import { needsCurrencyRecheck, needsReceiverRecheck } from './slipokCompatibility';

type Props = { receipts?: ReceiptSubmission[]; amount: number; busy: boolean; mutate: (value: Record<string, unknown>) => void };
const money = (value: number) => (value / 100).toFixed(2);
export default function RefundIncomingReview({ receipts = [], amount, busy, mutate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const receipt = receipts.find(r => r.id === selectedId) || receipts.at(-1), check = receipt?.verification;
  // Remount the confirmation when selected evidence or its server result changes.
  // A previous bank-check checkbox must never carry across different transfers.
  const evidence = [receipt?.id, check?.checkedAt, check?.status, check?.reference, check?.amountSatang].join(':');
  const canVerify = receipt?.id === receipts.at(-1)?.id && receipt?.status === 'pending' && (!check || !['verified', 'rejected'].includes(check.status) || needsCurrencyRecheck(check) || needsReceiverRecheck(check));
  const waiting = Date.parse(check?.retryAt || '') > Date.now();
  return <div className="wp-refund-incoming">
    {receipts.length > 0 && <label>สลิปต้นทาง<select value={receipt?.id || ''} disabled={busy} onChange={event => setSelectedId(event.target.value)}>{receipts.map(r => <option value={r.id} key={r.id}>{new Date(r.submittedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · {r.id.slice(0, 8)}</option>)}</select></label>}
    {canVerify && <><p className="wp-note">ตรวจสลิปเดิมเพื่ออ่านยอดและเลขอ้างอิงให้ ไม่เปลี่ยนการยกเลิกที่นั่งและยังไม่โอนคืน</p><button type="button" className="wp-primary" disabled={busy || waiting} onClick={() => mutate({ action: 'verify_slip', receiptId: receipt!.id })}>{busy ? 'กำลังดำเนินการ…' : waiting ? 'รอเวลาตรวจสลิปใหม่' : 'ตรวจสลิปและเติมข้อมูลอัตโนมัติ'}</button></>}
    <IncomingConfirmation key={evidence} receipt={receipt} amount={amount} busy={busy} mutate={mutate} />
  </div>;
}
function IncomingConfirmation({ receipt, amount: bookingAmount, busy, mutate }: Omit<Props, 'receipts'> & { receipt?: ReceiptSubmission }) {
  const check = receipt?.verification, verified = check?.status === 'verified';
  const [checked, setChecked] = useState(false), [noFundsChecked, setNoFundsChecked] = useState(false), [noFundsReason, setNoFundsReason] = useState('');
  const [amount, setAmount] = useState(money(bookingAmount)), [reference, setReference] = useState('');
  const amountValid = /^\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
  const refValid = /^[A-Za-z0-9\s-]+$/.test(reference) && reference.replace(/[\s-]/g, '').length >= 6 && reference.replace(/[\s-]/g, '').length <= 80;
  const verifiedValid = verified && Number.isSafeInteger(check.amountSatang) && check.amountSatang! > 0 && /^[A-Z0-9]{6,80}$/.test(check.reference || '');
  return <><form onSubmit={event => { event.preventDefault(); mutate({ action: 'confirm_received', fundsChecked: checked, receiptId: receipt?.id, ...(verified ? {} : { receivedAmount: Math.round(Number(amount) * 100), transferReference: reference }) }); }}>
    {verified ? <><p className="wp-success">อ่านยอดและเลขอ้างอิงเงินเข้าจาก SlipOK ให้แล้ว ไม่ต้องกรอกเอง</p><dl className="wp-verified-transfer"><div><dt>ยอดโอนที่ตรวจผ่าน</dt><dd>฿{money(check.amountSatang || 0)}</dd></div><div><dt>เลขอ้างอิงเงินเข้าจากธนาคาร</dt><dd>{check.reference || 'ข้อมูลไม่ครบ กรุณาติดต่อเจ้าของ'}</dd></div>{check.paymentChannelLabel && <div><dt>ช่องทางรับเงิน</dt><dd>{check.paymentChannelLabel}</dd></div>}{check.transferredAt && <div><dt>เวลาโอน</dt><dd>{new Date(check.transferredAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</dd></div>}</dl></> : <><p className="wp-note">{check?.message || 'ยังไม่มีผลตรวจสลิปที่ยืนยันได้'} หากยังตรวจไม่ผ่าน ให้ตรวจเงินเข้าจากรายการธนาคารแล้วกรอกด้านล่าง เลขที่อ่านจากภาพเพียงอย่างเดียวยังใช้ยืนยันไม่ได้</p><label>ยอดเข้าจริงที่ตรวจจากธนาคาร (บาท)<input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required /></label><label>เลขอ้างอิงเงินเข้าที่ตรวจจากธนาคาร<input value={reference} onChange={event => setReference(event.target.value)} minLength={6} maxLength={120} required autoComplete="off" /></label></>}
    <label className="wp-check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />ตรวจรายการธนาคาร เงินเข้าบัญชีเรา และสลิปต้นทางแล้ว</label><button className="wp-primary" disabled={busy || !checked || !(verified ? verifiedValid : amountValid && refValid)}>ยืนยันเงินเข้า → รอโอนคืน</button>
  </form>{!verified && <details><summary>ตรวจแล้วไม่พบเงินเข้า</summary><label>เหตุผลและผลตรวจธนาคาร<textarea value={noFundsReason} onChange={event => setNoFundsReason(event.target.value)} minLength={3} maxLength={200} /></label><label className="wp-check"><input type="checkbox" checked={noFundsChecked} onChange={event => setNoFundsChecked(event.target.checked)} />ตรวจรายการธนาคารแล้ว ไม่มีเงินเข้าที่ต้องคืน</label><button type="button" disabled={busy || !noFundsChecked || noFundsReason.trim().length < 3} onClick={() => mutate({ action: 'no_funds', fundsChecked: noFundsChecked, reason: noFundsReason })}>ปิดรายการ · ไม่มีเงินต้องคืน</button></details>}</>;
}
