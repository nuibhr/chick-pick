import type { SlipVerification } from '../cloudflare/slipok';

// Only this local parser failure may retry an image already logged by SlipOK.
export const legacyCurrencyFailure = 'สลิปนี้ไม่ใช่รายการเงินบาทในประเทศไทย';
export function needsCurrencyRecheck(check: SlipVerification | undefined) {
  return Boolean(check?.provider === 'slipok' && (
    check.status === 'rejected' && check.code === undefined && check.message === legacyCurrencyFailure
    || check.currencyRecovery && ['checking', 'retry', 'unavailable'].includes(check.status)
  ));
}
