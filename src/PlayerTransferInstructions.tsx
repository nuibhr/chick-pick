import { useState } from 'react';
import type { TransferAccount } from './marketplaceTypes';
import { channelLabel, transferOptions, paymentQrPhone, paymentStaticQr, paymentChannelId, type PaymentChannelId } from './paymentChannels';
import PromptPayQR from './PromptPayQR';

export default function PlayerTransferInstructions({ account, amount, slipok, pending, holdExpiresAt, openQr }: { account: TransferAccount | null; amount: number; slipok: boolean; pending: boolean; holdExpiresAt?: string | null; openQr?: (channel: PaymentChannelId) => Promise<string> }) {
  const options = transferOptions(account);
  const [selected, setSelected] = useState(() => Math.max(0, options.findIndex(option => Boolean(paymentQrPhone(option) || paymentStaticQr(option))))), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  const current = options[selected] || options[0];
  async function copy() {
    if (!current) return;
    try { await navigator.clipboard.writeText(current.accountNumber.replace(/[\s-]/g, '')); setCopied(true); setCopyError(''); }
    catch { setCopyError('คัดลอกไม่ได้ กรุณาใช้เลขบัญชีที่แสดงด้านบน'); }
  }
  return <div className="pa-transfer-instructions"><b>{pending ? 'ส่งภาพถึงระบบแล้ว · ไม่ต้องโอนซ้ำ' : '1. เลือกช่องทางและโอนเงิน'}</b><span>ยอดสำหรับเลขจองนี้</span><strong>฿{(amount / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
    {!pending && options.length > 1 && <div className="pa-payment-options" role="group" aria-label="เลือกช่องทางรับเงิน">{options.map((option, i) => <button key={option.id || i} type="button" aria-pressed={selected === i} onClick={() => { setSelected(i); setCopied(false); setCopyError(''); }}>{channelLabel(option)}</button>)}</div>}
    {pending && options.length > 1 ? <small>ช่องทางของการจองนี้: {options.map(channelLabel).join(' / ')} · ผู้จัดจะเทียบกับสลิปที่ส่ง</small> : current ? <><span>{channelLabel(current)} · {current.accountName}</span><strong>{current.accountNumber}</strong>{!pending && <><button type="button" onClick={() => void copy()}>{copied ? 'คัดลอกแล้ว' : current.kind === 'promptpay' ? 'คัดลอกเบอร์พร้อมเพย์' : 'คัดลอกเลขบัญชี'}</button>{current.bankPromptPayPhone && <small>QR พร้อมเพย์ที่ผูกกับ {current.bankName} · เบอร์ {current.bankPromptPayPhone}</small>}{(paymentQrPhone(current) || paymentStaticQr(current)) && <PromptPayQR phone={paymentQrPhone(current)} bankPayload={paymentStaticQr(current)} amount={amount} recipient={current.accountName} openInBrowser={openQr ? () => openQr(paymentChannelId(current)) : undefined} />}</>}</> : <span role="alert">ผู้จัดยังไม่ได้ตั้งบัญชีสำหรับรายการนี้ กรุณาติดต่อผู้จัดก่อนโอน</span>}
    {copyError && <small role="alert">{copyError}</small>}{!pending && <><b>2. แนบสลิปจากแอปธนาคาร</b><small>โอนตามยอดด้านบน แล้วใช้ปุ่มแนบสลิปใต้รายการจอง รูปต้องเห็น QR ตรวจรายการโอนชัดเจน{holdExpiresAt ? ' · ส่งก่อน ' + new Date(holdExpiresAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : ''}</small></>}<b>3. รอแอดมินตรวจรับเงิน</b><small>{slipok ? 'SlipOK ตรวจรายการ ยอด บัญชีผู้รับ และสลิปซ้ำ ผลผ่านยังต้องให้แอดมินอนุมัติ' : 'ผู้จัดตรวจสลิปและยอดเข้าธนาคารก่อนอนุมัติ'} · การรับเงินกับการเลือกคนเข้าสนามเป็นคนละขั้นตอน</small></div>;
}
