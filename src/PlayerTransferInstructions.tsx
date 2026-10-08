import { useState } from 'react';
import type { TransferAccount } from './marketplaceTypes';

export default function PlayerTransferInstructions({ account, amount, slipok, pending, holdExpiresAt }: { account: TransferAccount | null; amount: number; slipok: boolean; pending: boolean; holdExpiresAt?: string | null }) {
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  async function copy() {
    if (!account) return;
    try { await navigator.clipboard.writeText(account.accountNumber.replace(/[\s-]/g, '')); setCopied(true); setCopyError(''); }
    catch { setCopyError('คัดลอกไม่ได้ กรุณาใช้เลขบัญชีที่แสดงด้านบน'); }
  }
  return <div className="pa-transfer-instructions"><b>{pending ? 'ส่งภาพถึงระบบแล้ว · ไม่ต้องโอนซ้ำ' : '1. โอนเงินเข้าบัญชีนี้'}</b><span>ยอดสำหรับเลขจองนี้</span><strong>฿{(amount / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{account ? <><span>{account.bankName} · {account.accountName}</span><strong>{account.accountNumber}</strong>{!pending && <button type="button" onClick={() => void copy()}>{copied ? 'คัดลอกเลขบัญชีแล้ว' : 'คัดลอกเลขบัญชี'}</button>}</> : <span role="alert">ผู้จัดยังไม่ได้ตั้งบัญชีสำหรับรายการนี้ กรุณาติดต่อผู้จัดก่อนโอน</span>}{copyError && <small role="alert">{copyError}</small>}{!pending && <><b>2. แนบสลิปจากแอปธนาคาร</b><small>โอนตามยอดด้านบน แล้วใช้ปุ่มแนบสลิปใต้รายการจอง รูปต้องเห็น QR ตรวจรายการโอนชัดเจน{holdExpiresAt ? ' · ส่งก่อน ' + new Date(holdExpiresAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : ''}</small></>}<b>3. รอแอดมินตรวจรับเงิน</b><small>{slipok ? 'SlipOK ตรวจรายการ ยอด บัญชีผู้รับ และสลิปซ้ำ ผลผ่านยังต้องให้แอดมินอนุมัติ' : 'ผู้จัดตรวจสลิปและยอดเข้าธนาคารก่อนอนุมัติ'} · การรับเงินกับการเลือกคนเข้าสนามเป็นคนละขั้นตอน</small></div>;
}
