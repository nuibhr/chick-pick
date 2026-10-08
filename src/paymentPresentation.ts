import type { ReceiptSubmission } from './marketplaceTypes';
import type { StripePayment } from './paymentTypes';

type Ticket = { cancelledAt?: string | null; paidAt?: string | null; kind?: string; completed?: boolean; admissionStatus?: string; stripe?: Pick<StripePayment, 'status'> | null; receipt?: Pick<ReceiptSubmission, 'status' | 'verification'> | null };
export function paymentTicketLabel(ticket: Ticket) {
  if (ticket.cancelledAt) return 'ยกเลิกแล้ว';
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
