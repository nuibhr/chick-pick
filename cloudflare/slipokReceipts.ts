import type { ReceiptSubmission } from '../src/marketplaceTypes';
import type { FinanceDocuments } from './financeDomain';
import type { TidbDocuments, Audit } from './tidbDocuments';
import type { ReceiptKV } from './pilot';
import { fail } from './pilotDomain';
import { verifySlipOk, slipokConfigured, type SlipOkEnv, type SlipVerification } from './slipok';
import { needsCurrencyRecheck, needsReceiverRecheck } from '../src/slipokCompatibility';
import { rejectedNonPaymentImage } from '../src/receiptHoldPolicy';
import { digest } from './pilotAuth';

function pendingReceipt(docs: FinanceDocuments, kind: 'game' | 'coaching', id: string, receiptId: string) {
  const row = kind === 'game' ? docs.marketplace.bookings.find(b => b.id === id) : docs.coaching.find(e => e.id === id);
  const receipt = row?.receipts?.at(-1);
  const unit = kind === 'game' ? 'game:' + (row && 'sessionId' in row ? row.sessionId : '') : 'coaching:' + id;
  if (!row || !receipt || receipt.id !== receiptId) return fail(404, 'ไม่พบสลิปที่รอตรวจ');
  if (row.cancelledAt || row.paidAt || receipt.status !== 'pending' || docs['revenue-settlements'].some(s => s.key === unit)) fail(409, 'รายการนี้ปิดรับผลตรวจแล้ว');
  if (!row.transferAccount) fail(409, 'การจองนี้ไม่มีบัญชีรับโอน');
  return { row, receipt, amount: kind === 'game' ? row.amount : Math.round(row.amount * 100), account: row.transferAccount! };
}

export async function checkStoredReceipt(db: TidbDocuments, env: SlipOkEnv & { RECEIPTS?: ReceiptKV }, kind: 'game' | 'coaching', id: string, receiptId: string, audit: Audit) {
  if (!slipokConfigured(env) || !env.RECEIPTS) fail(503, 'ยังไม่ตั้ง SlipOK หรือที่เก็บภาพสลิป');
  const attemptId = crypto.randomUUID();
  const input = await db.updateFinance(docs => {
    const p = pendingReceipt(docs, kind, id, receiptId), old = p.receipt.verification;
    const currencyRecovery = audit.actorType === 'admin' && needsCurrencyRecheck(old);
    const receiverRecovery = audit.actorType === 'admin' && needsReceiverRecheck(old);
    const recovery = currencyRecovery || receiverRecovery;
    if (old?.status === 'verified' || old?.status === 'rejected' && !recovery) fail(409, 'มีผลตรวจแล้ว ให้แอดมินอนุมัติหรือปฏิเสธสลิป');
    if (recovery && !/^[a-f0-9]{64}$/.test(p.receipt.sha256 || '')) fail(409, 'สลิปนี้ไม่มีข้อมูลยืนยันภาพเดิม กรุณาติดต่อเจ้าของก่อนตรวจใหม่');
    if (old?.retryAt && Date.parse(old.retryAt) > Date.now()) fail(429, 'ยังไม่ถึงเวลาตรวจใหม่ กรุณารอเวลาที่แจ้ง');
    p.receipt.verification = { provider: 'slipok', status: 'checking', checkedAt: new Date().toISOString(), attemptId, retryAt: new Date(Date.now() + 45000).toISOString(), message: 'กำลังตรวจรายการกับ SlipOK', ...(currencyRecovery ? { currencyRecovery: true as const } : {}), ...(receiverRecovery ? { receiverRecovery: true as const } : {}) };
    return { amount: p.amount, account: structuredClone(p.account), bookedAt: p.row.createdAt, mimeType: p.receipt.mimeType, currencyRecovery, receiverRecovery, recovery, sha256: p.receipt.sha256 };
  }, { ...audit, action: 'slipok.check.started' });
  let result: SlipVerification;
  try {
    const image = await env.RECEIPTS!.get('receipt:' + receiptId, 'arrayBuffer');
    if (!image) throw Error('missing image');
    // New uploads always have a hash. Check it for every verification, not only
    // parser repairs. Missing legacy hashes remain subject to existing policy.
    if (input.sha256 && await digest(new Uint8Array(image)) !== input.sha256) throw Error('image changed');
    result = await verifySlipOk(env, image, input.mimeType, input.amount, input.account, input.bookedAt, fetch, input.recovery);
  } catch { result = { provider: 'slipok', status: 'retry', checkedAt: new Date().toISOString(), retryAt: new Date(Date.now() + 60000).toISOString(), message: 'ภาพหรือบริการตรวจยังไม่พร้อม กรุณาตรวจใหม่' }; }
  return db.updateFinance(docs => {
    const p = pendingReceipt(docs, kind, id, receiptId);
    if (p.receipt.verification?.attemptId !== attemptId) fail(409, 'ผลตรวจเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่');
    if (result.status === 'verified') {
      if (p.amount !== input.amount || JSON.stringify(p.account) !== JSON.stringify(input.account)) fail(409, 'ยอดหรือบัญชีเปลี่ยนระหว่างตรวจ');
      const receipts: ReceiptSubmission[] = [...docs.marketplace.bookings, ...docs.coaching].flatMap(row => row.receipts || []);
      if ([...docs.marketplace.bookings, ...docs.coaching].some(row => row.refund?.transferReference === result.reference) || receipts.some(r => r.id !== receiptId && (r.verifiedTransferReference === result.reference || r.verification?.status === 'verified' && r.verification.reference === result.reference))) result = { provider: 'slipok', status: 'rejected', checkedAt: result.checkedAt, code: 1012, message: 'รายการโอนนี้ถูกใช้กับสลิปอื่นหรือกันไว้คืนเงินในแอปแล้ว' };
    }
    if (input.currencyRecovery && ['retry', 'unavailable'].includes(result.status)) result.currencyRecovery = true;
    if (input.receiverRecovery && ['retry', 'unavailable'].includes(result.status)) result.receiverRecovery = true;
    p.receipt.verification = result;
    if (rejectedNonPaymentImage(p.receipt)) {
      // Reject only the image, not an alleged transfer. Preserve the private
      // bytes and history; do not mark no_funds, cancel, approve, refund or renew
      // the hold. The original deadline then applies and resubmission can follow
      // the existing eligibility rules. Ambiguous bank results remain pending.
      p.receipt.status = 'rejected';
      p.receipt.rejectReason = 'SlipOK: ' + result.message;
      p.receipt.reviewedAt = result.checkedAt;
    }
    return result;
  }, { ...audit, action: 'slipok.check.completed' });
}
