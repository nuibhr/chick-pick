import { MapPin, Ticket } from 'lucide-react';
import type { PublicSession } from './marketplaceTypes';
import type { PlayerBooking } from './playerBookingTypes';
import type { PaymentChannelId } from './paymentChannels';
import { paymentHoldExpired } from './bookingHold';
import { paymentTicketLabel } from './paymentPresentation';
import BookingHoldNotice from './BookingHoldNotice';
import ExpiredBookingActions from './ExpiredBookingActions';
import PlayerTransferInstructions from './PlayerTransferInstructions';
import SlipVerificationStatus from './SlipVerificationStatus';
import StripeBookingPayment from './StripeBookingPayment';

export default function PlayerBookingCard({ booking, session, now, busy, token, config, renew, browse, upload, cancel, refresh, openQr }: { booking: PlayerBooking; session?: PublicSession; now: number; busy: boolean; token: string; config: { paymentProvider?: string; slipokConfigured?: boolean; stripeConfigured?: boolean; stripeMode?: 'live' | 'test' | null }; renew: () => void; browse: () => void; upload: (file?: File) => void; cancel: () => void; refresh: () => Promise<void>; openQr: (channel: PaymentChannelId) => Promise<string> }) {
  const expired = paymentHoldExpired(booking, now), pending = booking.receipt?.status === 'pending';
  const transferable = !booking.cancelledAt && !expired && !booking.paidAt && config.paymentProvider !== 'stripe' && (!booking.stripe || booking.stripe.status === 'expired');
  const future = Date.parse(booking.startsAt || session?.startsAt || '') > now;
  const available = future && (!session || !session.bookingPaused && session.status !== 'completed' && session.joined < session.capacity);
  return <article className="pa-ticket" id={'booking-' + booking.id} tabIndex={-1}>
    <div className="pa-ticket-head"><span><Ticket size={16} /> {booking.kind === 'coaching' ? 'COACH PASS' : 'COURT PASS'}</span><span className={booking.admissionStatus === 'approved' && !booking.cancelledAt ? 'paid' : ''}>{paymentTicketLabel(booking, now)}</span></div>
    <div className="pa-ticket-main"><small>{booking.kind === 'coaching' && booking.startsAt ? new Date(booking.startsAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : (session?.date || 'วันที่ก๊วน') + ' · ' + (session?.time || 'ดูรายละเอียดกับผู้จัด')}</small><h2>{booking.title}</h2><p><MapPin size={14} />{booking.venue || session?.venue || 'รายละเอียดสนาม'}</p></div>
    <div className="pa-ticket-foot"><span>เลขจอง <b>{booking.id.slice(0, 8).toUpperCase()}</b></span><strong>฿{(booking.amount / 100).toLocaleString('th-TH')}</strong></div>
    {booking.cancelledAt ? <><p className="pa-slip-note">{booking.refund?.reason || 'ยกเลิกการจองแล้ว'}<br />{booking.refund?.status === 'pending' ? 'ผู้จัดยืนยันเงินเข้าแล้ว กำลังรอโอนคืน' : booking.refund?.status === 'completed' ? 'ผู้จัดบันทึกโอนคืนแล้ว ตรวจยอดบัญชีของคุณได้เลย' : booking.refund?.status === 'review_required' ? 'ผู้จัดกำลังตรวจเรื่องเงินให้ ไม่ต้องยกเลิกซ้ำหรือโอนใหม่' : booking.refund?.status === 'not_required' ? 'ผู้จัดตรวจแล้วไม่มียอดเงินที่ต้องคืน หากคุณเคยโอนกรุณาติดต่อผู้จัด' : 'ที่นั่งกลับไปเปิดรับแล้ว'}</p>{(!booking.refund || booking.refund.status === 'not_required') && <button className="pa-cancel-booking" type="button" onClick={browse}>เลือกก๊วนใหม่</button>}</> : <>
      <BookingHoldNotice booking={booking} now={now} />
      <ExpiredBookingActions booking={booking} now={now} busy={busy} available={available} renew={renew} browse={browse} upload={upload} />
      {transferable && !pending && <PlayerTransferInstructions account={booking.transferAccount} amount={booking.amount} slipok={Boolean(config.slipokConfigured)} pending={false} holdExpiresAt={booking.holdExpiresAt} openQr={openQr} />}
      {!booking.paidAt && booking.stripe && booking.stripe.status !== 'expired' && <StripeBookingPayment booking={booking} token={token} mode={booking.stripe.mode || config.stripeMode} ready={Boolean(config.stripeConfigured)} refresh={refresh} />}
      {booking.receipt && <SlipVerificationStatus verification={booking.receipt.verification} receiptStatus={booking.receipt.status} />}
      {booking.receipt?.rejectReason && <p className="pa-slip-note" role="alert">ผู้จัดแจ้ง: {booking.receipt.rejectReason}</p>}
      {transferable && !pending && <label className="pa-slip-upload">{busy ? 'กำลังส่งสลิปและตรวจรายการ…' : booking.receipt?.status === 'rejected' ? 'ส่งหลักฐานที่แก้ไขแล้ว' : 'โอนสำเร็จแล้ว · แนบสลิป'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label>}
      {!expired && !booking.paidAt && !pending && (!booking.stripe || ['expired', 'test_paid'].includes(booking.stripe.status)) && future && <button type="button" className="pa-cancel-booking" disabled={busy} onClick={cancel}>ยกเลิกการจอง</button>}
    </>}
  </article>;
}
