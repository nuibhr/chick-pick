import type { ReceiptSubmission } from '../src/marketplaceTypes';
import { fail } from './pilotDomain';

// Only an authenticated receipt reviewer supplies these fields after checking the bank.
// OCR and player uploads cannot create a verified transfer.
export function recordVerifiedTransfer(receipt: ReceiptSubmission, expectedSatang: number, value: Record<string, unknown>, receipts: ReceiptSubmission[]) {
  const check = receipt.verification;
  if (check && (check.status !== 'verified' || check.amountSatang !== expectedSatang)) fail(409, 'SlipOK ยังไม่ยืนยันสลิปนี้ ตรวจใหม่หรือปฏิเสธและให้ส่งใหม่');
  const raw = value.transferReference ?? check?.reference;
  if (typeof raw !== 'string' || raw.length > 120 || !/^[A-Za-z0-9\s-]+$/.test(raw)) fail(400, 'กรอกเลขอ้างอิงรายการโอนจากธนาคาร');
  const reference = (raw as string).replace(/[\s-]/g, '').toUpperCase();
  if (check && reference !== check.reference) fail(409, 'เลขอ้างอิงต้องตรงกับที่ SlipOK ยืนยัน');
  if (reference.length < 6 || reference.length > 80) fail(400, 'เลขอ้างอิงต้องมี 6–80 ตัวอักษรหรือตัวเลข');
  const amount = value.receivedAmount ?? (check?.amountSatang !== undefined ? check.amountSatang / 100 : undefined);
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.round(amount * 100) !== expectedSatang) fail(400, 'ยอดเงินเข้าจริงต้องตรงกับยอดจอง ไม่เกิน 2 ทศนิยม');
  if (receipts.some(other => other.id !== receipt.id && (other.status === 'approved' && other.verifiedTransferReference === reference || other.verification?.status === 'verified' && other.verification.reference === reference))) fail(409, 'เลขอ้างอิงรายการโอนนี้รับเงินกับรายการอื่นแล้ว ตรวจธนาคารก่อน ไม่อนุมัติซ้ำ');
  receipt.verifiedTransferReference = reference;
  receipt.verifiedAmount = Math.round((amount as number) * 100);
}
