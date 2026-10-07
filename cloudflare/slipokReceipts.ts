import type { ReceiptSubmission } from '../src/marketplaceTypes';
import type { FinanceDocuments } from './financeDomain';
import type { TidbDocuments, Audit } from './tidbDocuments';
import type { ReceiptKV } from './pilot';
import { fail } from './pilotDomain';
import { verifySlipOk, slipokConfigured, type SlipOkEnv, type SlipVerification } from './slipok';

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
    if (old?.status === 'verified' || old?.status === 'rejected') fail(409, 'มีผลตรวจแล้ว ให้แอดมินอนุมัติหรือปฏิเสธสลิป');
    if (old?.retryAt && Date.parse(old.retryAt) > Date.now()) fail(429, 'ยังไม่ถึงเวลาตรวจใหม่ กรุณารอเวลาที่แจ้ง');
    p.receipt.verification = { provider: 'slipok', status: 'checking', checkedAt: new Date().toISOString(), attemptId, retryAt: new Date(Date.now() + 45000).toISOString(), message: 'กำลังตรวจรายการกับ SlipOK' };
    return { amount: p.amount, account: structuredClone(p.account), bookedAt: p.row.createdAt, mimeType: p.receipt.mimeType };
  }, { ...audit, action: 'slipok.check.started' });
  let result: SlipVerification;
  try {
    const image = await env.RECEIPTS!.get('receipt:' + receiptId, 'arrayBuffer');
    if (!image) throw Error('missing image');
    result = await verifySlipOk(env, image, input.mimeType, input.amount, input.account, input.bookedAt);
  } catch { result = { provider: 'slipok', status: 'retry', checkedAt: new Date().toISOString(), retryAt: new Date(Date.now() + 60000).toISOString(), message: 'ภาพหรือบริการตรวจยังไม่พร้อม กรุณาตรวจใหม่' }; }
  return db.updateFinance(docs => {
    const p = pendingReceipt(docs, kind, id, receiptId);
    if (p.receipt.verification?.attemptId !== attemptId) fail(409, 'ผลตรวจเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่');
    if (result.status === 'verified') {
      if (p.amount !== input.amount || JSON.stringify(p.account) !== JSON.stringify(input.account)) fail(409, 'ยอดหรือบัญชีเปลี่ยนระหว่างตรวจ');
      const receipts: ReceiptSubmission[] = [...docs.marketplace.bookings, ...docs.coaching].flatMap(row => row.receipts || []);
      if (receipts.some(r => r.id !== receiptId && (r.verifiedTransferReference === result.reference || r.verification?.status === 'verified' && r.verification.reference === result.reference))) result = { provider: 'slipok', status: 'rejected', checkedAt: result.checkedAt, code: 1012, message: 'รายการโอนนี้ถูกใช้กับสลิปอื่นในแอปแล้ว' };
    }
    p.receipt.verification = result; return result;
  }, { ...audit, action: 'slipok.check.completed' });
}
