import { paymentHoldExpired } from './bookingHold';
type Props = { booking: Parameters<typeof paymentHoldExpired>[0]; now: number; busy: boolean; upload: (file?: File) => void };
export default function LateReceiptUpload({ booking, now, busy, upload }: Props) {
  if (booking.cancelledAt || booking.paidAt || !paymentHoldExpired(booking, now) || booking.receipt?.status === 'pending') return null;
  return <div className="pa-hold-note is-expired"><b>โอนแล้ว แต่ส่งสลิปไม่ทัน?</b><p>ส่งสลิปในเลขจองเดิมได้ ผู้จัดจะตรวจเงินและที่ว่างให้ การส่งย้อนหลังยังไม่รับประกันที่นั่ง กรุณาอย่าโอนซ้ำ</p><label className="pa-slip-upload">{busy ? 'กำลังส่งหลักฐาน…' : 'ส่งสลิปย้อนหลัง · โอนแล้วเท่านั้น'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label></div>;
}
