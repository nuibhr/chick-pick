import { useState } from 'react';
import type { PlayerBooking } from './playerBookingTypes';
import { paymentHoldExpired } from './bookingHold';

export default function ExpiredBookingActions({ booking, now, busy, available, renew, browse, upload }: { booking: PlayerBooking; now: number; busy: boolean; available: boolean; renew: () => void; browse: () => void; upload: (file?: File) => void }) {
  const [paid, setPaid] = useState(false);
  if (booking.cancelledAt || booking.paidAt || !paymentHoldExpired(booking, now) || booking.receipt?.status === 'pending') return null;
  return <section className="pa-expired-actions" aria-label="เลือกวิธีดำเนินการหลังหมดเวลา"><h3>หมดเวลาแล้ว ทำต่อได้ตามนี้</h3><p>ที่นั่งเดิมถูกคืนแล้ว เลือกตามสถานะการโอนของคุณ</p>
    {booking.replacementBookingId ? <p>มีรายการจองต่อแล้ว ใช้ QR จากรายการใหม่ หากโอนให้เลขจองเดิมไปแล้ว ให้ส่งหลักฐานของรายการเดิมด้านล่าง</p> : available ? <button className="pa-renew-booking" type="button" disabled={busy} onClick={renew}>ยังไม่ได้โอน · จองต่อและรับ QR ใหม่</button> : <button className="pa-renew-booking" type="button" disabled={busy} onClick={browse}>รอบนี้เต็มหรือปิดรับแล้ว · เลือกก๊วนอื่น</button>}
    <button type="button" className="pa-already-paid" disabled={busy} aria-expanded={paid} onClick={() => setPaid(!paid)}>โอนแล้ว · ส่งสลิปย้อนหลัง</button>
    {paid && <div className="pa-paid-evidence"><p>แนบสลิปที่ธนาคารแสดงว่าโอนสำเร็จ ผู้จัดจะตรวจเงินและที่ว่างให้ หากเต็มจะจัดการเรื่องคืนเงิน ไม่ต้องโอนใหม่</p><label className="pa-slip-upload">{busy ? 'กำลังส่งหลักฐาน…' : 'เลือกสลิปโอนสำเร็จจากธนาคาร'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label></div>}
  </section>;
}
