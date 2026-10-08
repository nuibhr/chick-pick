import generatePayload from 'promptpay-qr';
import { mobileNumber, validMobile } from './paymentChannels';

export function promptPayPayload(phone: string, amountSatang: number) {
  if (!validMobile(phone) || !Number.isSafeInteger(amountSatang) || amountSatang <= 0 || amountSatang > 10000000) throw Error('เบอร์พร้อมเพย์หรือยอดจองไม่ถูกต้อง');
  return generatePayload(mobileNumber(phone), { amount: amountSatang / 100 });
}
export async function promptPayImage(phone: string, amountSatang: number) {
  const qr = await import('qrcode');
  return qr.toDataURL(promptPayPayload(phone, amountSatang), { width: 360, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#10291fff', light: '#ffffffff' } });
}
