export type ReceiptHoldEvidence = {
  status: string;
  submittedAfterHold?: boolean;
  verification?: { provider?: string; status?: string; code?: number };
};

// These codes identify unsupported/invalid images or a missing/non-payment QR.
// Bank delays, duplicate slips, amount mismatches and recipient mismatches are
// deliberately NOT classified as no payment: a real transfer may have happened.
export function rejectedNonPaymentImage(receipt: ReceiptHoldEvidence | null | undefined): boolean {
  const check = receipt?.verification;
  return check?.provider === 'slipok' && check.status === 'rejected'
    && [1005, 1006, 1007, 1008].includes(check.code || 0);
}

export function receiptProtectsHold(receipt: ReceiptHoldEvidence | null | undefined): boolean {
  return receipt?.status === 'pending' && !receipt.submittedAfterHold && !rejectedNonPaymentImage(receipt);
}
