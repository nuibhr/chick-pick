import type { SlipVerification } from '../cloudflare/slipok';
export default function SlipVerificationStatus({ verification }: { verification?: SlipVerification }) {
  if (!verification) return null;
  return <div className="pa-slip-note" role={verification.status === 'verified' ? 'status' : 'alert'}><b>ผลตรวจ SlipOK</b><p>{verification.message}</p>{verification.amountSatang !== undefined && <span>ยอดที่ตรวจ ฿{(verification.amountSatang / 100).toFixed(2)} · </span>}{verification.reference && <span>เลขรายการ {verification.reference}</span>}{verification.retryAt && <p>ตรวจใหม่ได้หลัง {new Date(verification.retryAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>}{verification.status === 'verified' && <p>รอแอดมินอนุมัติเงิน การผ่าน SlipOK ยังไม่ถือว่าได้เข้าสนาม</p>}</div>;
}
