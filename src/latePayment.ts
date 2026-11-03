export type LatePayment = {
  status: 'review_required' | 'accepted' | 'refund_required';
  receiptId: string; submittedAt: string; resolvedAt?: string; resolvedBy?: string;
};
export type PublicLatePayment = Omit<LatePayment, 'resolvedBy'>;
export const needsPaymentRecovery = (row: { latePayment?: Pick<LatePayment, 'status'> | null }) => Boolean(row.latePayment && row.latePayment.status !== 'accepted');
export function publicLatePayment(value?: LatePayment): PublicLatePayment | null {
  return value ? { status: value.status, receiptId: value.receiptId, submittedAt: value.submittedAt, resolvedAt: value.resolvedAt } : null;
}
