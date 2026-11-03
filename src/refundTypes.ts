// Cancelling a seat never means money has already been returned.
export type BookingRefund = {
  status: 'review_required' | 'pending' | 'completed' | 'not_required';
  reason: string; requestedAt: string; requestedBy: string;
  receivedAmount?: number; receivedAt?: string; receivedBy?: string;
  transferReference?: string; receiptId?: string;
  completedAt?: string; completedBy?: string; refundReference?: string;
  resolutionReason?: string;
  postSettlement?: boolean;
};
export type PublicRefund = Pick<BookingRefund, 'status' | 'reason' | 'receivedAmount' | 'completedAt'>;
export const refundNeedsAction = (refund?: BookingRefund) => refund?.status === 'review_required' || refund?.status === 'pending';
export const refundLabels: Record<BookingRefund['status'], string> = {
  review_required: 'ยกเลิกแล้ว · รอตรวจเงินเข้าเพื่อคืนเงิน',
  pending: 'ยกเลิกแล้ว · รอโอนคืน',
  completed: 'ยกเลิกแล้ว · คืนเงินแล้ว',
  not_required: 'ยกเลิกแล้ว · ตรวจแล้วไม่มีเงินต้องคืน',
};
export function publicRefund(refund?: BookingRefund): PublicRefund | null {
  return refund ? { status: refund.status, reason: refund.reason, receivedAmount: refund.receivedAmount, completedAt: refund.completedAt } : null;
}
