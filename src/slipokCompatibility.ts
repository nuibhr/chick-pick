import type { SlipVerification } from '../cloudflare/slipok';

// Only this local parser failure may retry an image already logged by SlipOK.
export const legacyCurrencyFailure = 'สลิปนี้ไม่ใช่รายการเงินบาทในประเทศไทย';
export function needsCurrencyRecheck(check: SlipVerification | undefined) {
  return Boolean(check?.provider === 'slipok' && (
    check.status === 'rejected' && check.code === undefined && check.message === legacyCurrencyFailure
    || check.currencyRecovery && ['checking', 'retry', 'unavailable'].includes(check.status)
  ));
}

export const legacyReceiverFailure = 'ข้อมูลผู้รับบนสลิปไม่ตรงกับช่องทางรับเงินของการจองนี้ หรือข้อมูลที่ธนาคารเปิดเผยยังยืนยันไม่ได้';
// Local parsing failure only. SlipOK's upstream wrong-recipient rejection
// uses a different message and cannot enter this recovery path.
export function needsReceiverRecheck(check: SlipVerification | undefined) {
  return Boolean(check?.provider === 'slipok' && (
    check.status === 'rejected' && check.code === 1014 && check.message === legacyReceiverFailure
    || check.receiverRecovery && ['checking', 'retry', 'unavailable'].includes(check.status)
  ));
}
