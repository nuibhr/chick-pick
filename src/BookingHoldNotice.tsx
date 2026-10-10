import { Clock3 } from 'lucide-react';
import { canSubmitLateReceipt, expiredHoldMessage, holdTimeLeft, paymentHoldExpired } from './bookingHold';

type Props = { booking: Parameters<typeof paymentHoldExpired>[0]; now: number };
export default function BookingHoldNotice({ booking, now }: Props) {
  if (booking.cancelledAt || booking.paidAt || !booking.holdExpiresAt
    || booking.admissionStatus === 'approved' || booking.stripe && !['expired', 'test_paid'].includes(booking.stripe.status)) return null;
  if (booking.receipt?.status === 'pending' && booking.receipt.submittedAfterHold) return <div className="pa-hold-note is-expired" role="status"><b>รับหลักฐานโอนย้อนหลังแล้ว แต่ที่นั่งไม่ได้ถูกล็อก</b><p>ผู้จัดต้องตรวจเวลาโอนและที่นั่งก่อนยืนยัน หากเต็มแล้วจะประสานคืนเงินหรือเปลี่ยนรอบ · อย่าโอนซ้ำ</p></div>;
  if (booking.receipt?.status === 'pending') return <p className="pa-hold-note">เก็บที่นั่งไว้รอตรวจสลิปแล้ว · ไม่ต้องโอนซ้ำ</p>;
  if (paymentHoldExpired(booking, now)) return <div className="pa-hold-note is-expired" role="status"><b>คืนที่นั่งให้ก๊วนแล้ว</b><p>{canSubmitLateReceipt(booking, now) ? expiredHoldMessage : 'พ้นเวลาส่งสลิปย้อนหลังผ่านแอปแล้ว หากโอนจริงโปรดติดต่อผู้จัดพร้อมหลักฐาน อย่าโอนซ้ำ'}</p></div>;
  return <div className="pa-hold-note"><span><Clock3 size={18} /> ถือที่นั่งให้คุณ <strong role="timer" aria-label="เวลาที่เหลือในการแนบสลิป">{holdTimeLeft(booking.holdExpiresAt, now)}</strong></span><p>โอนเงินและส่งสลิปให้ถึงระบบก่อนหมดเวลา ที่นั่งจึงจะเก็บไว้รอแอดมินตรวจ</p></div>;
}
