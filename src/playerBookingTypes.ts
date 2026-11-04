import type { TransferAccount, SlipOcr } from './marketplaceTypes';
import type { StripePayment } from './paymentTypes';
export type PlayerBooking = {
  id: string; sessionId: string; title: string; amount: number; createdAt: string;
  kind?: 'game' | 'coaching'; startsAt?: string; venue?: string; completed?: boolean;
  paidAt: string | null; admissionStatus: 'pending' | 'approved'; admissionUpdatedAt?: string | null;
  cancelledAt: string | null; replacementBookingId?: string | null;
  holdExpiresAt?: string | null; holdExpired?: boolean;
  latePayment?: import('./latePayment').PublicLatePayment | null;
  refund?: import('./refundTypes').PublicRefund | null;
  transferAccount: TransferAccount | null;
  stripe?: Pick<StripePayment, 'status' | 'mode' | 'expiresAt' | 'issue'> | null;
  receipt: { id: string; status: 'pending' | 'approved' | 'rejected'; submittedAt?: string; reviewedAt?: string | null; ocr: SlipOcr; verification?: import('../cloudflare/slipok').SlipVerification; rejectReason: string | null } | null;
};
