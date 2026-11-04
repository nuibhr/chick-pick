import type { PlayerBooking } from './playerBookingTypes';
import { paymentHoldExpired } from './bookingHold';
export type PlayerNotice = { id: string; bookingId: string; title: string; body: string; at: string; tone: 'info' | 'success' | 'warning' };
export const currentBookingVisible = (booking: PlayerBooking) => !booking.cancelledAt && (!booking.replacementBookingId || Boolean(booking.paidAt) || booking.receipt?.status === 'pending' || booking.latePayment?.status === 'review_required');
export function playerNotices(bookings: PlayerBooking[], now = Date.now()): PlayerNotice[] {
  return bookings.flatMap((booking): PlayerNotice[] => {
    if (!booking.cancelledAt && booking.replacementBookingId && !currentBookingVisible(booking)) return [];
    let title = 'จองแล้ว · รอชำระเงิน', body = 'โอนและแนบสลิปก่อนหมดเวลาถือที่นั่ง', at = booking.createdAt, tone: PlayerNotice['tone'] = 'info';
    if (booking.cancelledAt) {
      title = 'ยกเลิกการจองแล้ว'; at = booking.refund?.updatedAt || booking.cancelledAt;
      body = booking.refund?.status === 'completed' ? 'ผู้จัดบันทึกโอนคืนแล้ว กรุณาตรวจบัญชีของคุณ' : booking.refund?.status === 'pending' ? 'ตรวจเงินแล้ว กำลังรอผู้จัดโอนคืน' : booking.refund?.status === 'not_required' ? 'ผู้จัดตรวจแล้ว ไม่มีเงินต้องคืน' : booking.refund ? 'ยกเลิกที่นั่งแล้ว ผู้จัดกำลังตรวจเรื่องเงินให้' : 'ที่นั่งกลับไปเปิดรับแล้ว';
      tone = booking.refund?.status === 'completed' ? 'success' : 'info';
    } else if (booking.paidAt) {
      const admitted = booking.kind === 'coaching' || booking.admissionStatus === 'approved';
      title = admitted ? 'ยืนยันการเข้าร่วมแล้ว' : 'ยืนยันเงินเข้าแล้ว';
      body = admitted ? 'ดูวันเวลาและสนามในรายการจองได้เลย' : 'รอผู้จัดเลือกคนเข้าสนาม';
      at = admitted ? booking.admissionUpdatedAt || booking.paidAt : booking.paidAt; tone = 'success';
    } else if (booking.receipt?.status === 'rejected') {
      title = 'ผู้จัดขอแก้ไขหลักฐาน'; body = booking.receipt.rejectReason || 'ตรวจรายละเอียดในรายการจองก่อนส่งภาพใหม่ ไม่ต้องโอนซ้ำ'; at = booking.receipt.reviewedAt || booking.receipt.submittedAt || booking.createdAt; tone = 'warning';
    } else if (booking.latePayment?.status === 'review_required') {
      title = 'รับสลิปย้อนหลังแล้ว'; body = 'กำลังตรวจเงินและที่ว่าง ยังไม่ยืนยันที่นั่ง กรุณาอย่าโอนซ้ำ'; at = booking.latePayment.submittedAt;
    } else if (booking.receipt?.status === 'pending') {
      const verified = booking.receipt.verification?.status === 'verified';
      title = verified ? 'ตรวจสลิปผ่าน · รอผู้จัด' : 'รับสลิปแล้ว'; body = 'ผู้จัดกำลังตรวจรับชำระ ไม่ต้องส่งภาพหรือโอนซ้ำ'; at = booking.receipt.verification?.checkedAt || booking.receipt.submittedAt || booking.createdAt;
    } else if (paymentHoldExpired(booking, now)) {
      title = 'หมดเวลาถือที่นั่ง'; body = 'ยังไม่โอน: กดจองต่อเพื่อตรวจที่ว่างและรับ QR ใหม่ · โอนแล้ว: ส่งสลิปย้อนหลัง'; at = booking.holdExpiresAt || booking.createdAt; tone = 'warning';
    }
    const timestamp = Date.parse(at);
    if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > 30 * 86400000) return [];
    return [{ id: `${booking.id}:${title}:${at}`, bookingId: booking.id, title, body: booking.title + ' · เลขจอง ' + booking.id.slice(0, 8).toUpperCase() + ' · ' + body, at, tone }];
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 30);
}
