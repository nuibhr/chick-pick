import type { ReceiptSubmission } from './marketplaceTypes';
import type { StripePayment } from './paymentTypes';
import { paymentHoldExpired } from './bookingHold';
import { refundLabels, type PublicRefund } from './refundTypes';

type Ticket = { refund?: PublicRefund | null; holdExpiresAt?: string | null; holdExpired?: boolean; cancelledAt?: string | null; paidAt?: string | null; kind?: string; completed?: boolean; admissionStatus?: string; stripe?: Pick<StripePayment, 'status'> | null; receipt?: Pick<ReceiptSubmission, 'status' | 'verification'> | null };
export function paymentTicketLabel(ticket: Ticket, now = Date.now()) {
  if (ticket.cancelledAt) return ticket.refund ? refundLabels[ticket.refund.status] : 'ยกเลิกแล้ว';
  if (paymentHoldExpired(ticket, now)) return ticket.receipt?.status === 'pending' && ticket.receipt.submittedAfterHold
    ? 'ส่งสลิปย้อนหลังแล้ว · รอผู้จัดตรวจสิทธิ์/คืนเงิน' : 'หมดเวลาถือที่นั่ง';
  if (ticket.paidAt) return ticket.kind === 'coaching' ? ticket.completed ? 'เรียนจบแล้ว' : 'รับเงินแล้ว · ยืนยันนัดเรียน' : ticket.admissionStatus === 'approved' ? 'ผู้จัดรับเข้าสนามแล้ว' : 'รับเงินแล้ว · รอผู้จัดเลือกเข้าสนาม';
  if (ticket.receipt?.status === 'rejected') return 'ผู้จัดขอให้ส่งสลิปใหม่';
  if (ticket.receipt?.status === 'pending') {
    switch (ticket.receipt.verification?.status) {
      case 'verified': return 'SlipOK ผ่าน · รอแอดมินอนุมัติ';
      case 'checking': return 'กำลังตรวจสลิปกับ SlipOK';
      case 'rejected': return 'SlipOK ไม่ผ่าน · รอผู้จัดตรวจ';
      case 'retry': case 'unavailable': return 'ส่งสลิปแล้ว · รอตรวจซ้ำ';
      default: return 'ส่งสลิปแล้ว · รอแอดมินตรวจ';
    }
  }
  if (ticket.stripe?.status === 'test_paid') return 'รายการทดสอบ · ยังไม่รับเงินจริง';
  return 'รอโอนเงินและแนบสลิป';
}
