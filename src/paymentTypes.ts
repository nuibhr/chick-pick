export type PaymentProvider = 'manual' | 'stripe';
export type StripePayment = {
  attemptId: string; status: 'creating' | 'pending' | 'expired' | 'paid' | 'test_paid' | 'requires_review';
  mode: 'test' | 'live'; amount: number; createdAt: string; sessionId?: string; url?: string;
  expiresAt?: string; paymentIntentId?: string; eventId?: string; receivedAt?: string; fee?: number; issue?: string;
};
// An issued QR must be closed by Stripe before another channel can accept money.
export const stripeLocksPayment = (payment?: StripePayment) => Boolean(payment && payment.status !== 'expired' && payment.status !== 'test_paid');
export const stripePublicView = (payment?: StripePayment) => payment ? { status: payment.status, mode: payment.mode, expiresAt: payment.expiresAt, issue: payment.issue } : null;
