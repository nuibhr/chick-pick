import { useCallback, useEffect, useRef, useState } from 'react';
import type { Booking, MarketplaceData } from './marketplaceTypes';
import type { CoachingState } from './coachingTypes';
import { refundLabels } from './refundTypes';

type RefundRow = Pick<Booking, 'id' | 'title' | 'amount' | 'createdAt' | 'cancelledAt' | 'paidAt' | 'refund' | 'receipts'> & { playerName: string; kind: 'game' | 'coaching' };
const money = (value: number) => (value / 100).toFixed(2);
async function load<T>(path: string): Promise<T> {
  const response = await fetch(path), data = await response.json();
  if (!response.ok) throw Error(data.message || 'โหลดรายการไม่ได้');
  return data;
}
export default function RefundPanel({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<RefundRow[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [filter, setFilter] = useState('action');
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    const [game, coaching] = await Promise.all([load<MarketplaceData>('/api/marketplace'), load<CoachingState>('/api/coaching')]);
    setRows([...game.bookings.map(b => ({ ...b, kind: 'game' as const })), ...coaching.enrollments.map(e => ({ ...e, kind: 'coaching' as const, amount: Math.round(e.amount * 100), playerName: e.student }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);
  useEffect(() => { void refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh().catch(e => setError(e.message)); }, 30000); return () => clearInterval(timer); }, [refresh]);
  async function mutate(row: RefundRow, value: Record<string, unknown>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const base = row.kind === 'game' ? '/api/marketplace/bookings/' : '/api/coaching/enrollments/';
      const response = await fetch(base + row.id + '/refund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }), result = await response.json();
      if (!response.ok) throw Error(result.message || 'บันทึกไม่ได้');
      setNotice(value.action === 'cancel' ? 'ยกเลิกการจองแล้ว เก็บสลิปเดิมไว้และแยกสถานะคืนเงิน' : value.action === 'complete' ? 'บันทึกว่าโอนคืนแล้ว รายจ่ายคืนเงินเข้า Monitor' : 'บันทึกผลตรวจเงินแล้ว');
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  const visible = rows.filter(row => filter === 'all' ? row.cancelledAt : filter === 'active' ? !row.cancelledAt : row.refund?.status === 'review_required' || row.refund?.status === 'pending');
  return <section className="wp-section wp-refunds"><h2>ยกเลิก / คืนเงิน</h2><p>ยกเลิกเพื่อคืนที่นั่งหรือเวลาเรียน โดยเก็บภาพสลิปและประวัติเดิม การโอนคืนต้องทำผ่านธนาคารเอง แล้วบันทึกผลที่นี่</p>
    {!canManage && <p className="wp-note">ผู้จัดดูสถานะได้ เจ้าของหรือฝ่ายการเงินเป็นผู้ยกเลิกรายการที่เกี่ยวกับเงินและยืนยันการคืนเงิน</p>}
    {error && <p role="alert" className="wp-alert">{error}</p>}{notice && <p role="status" className="wp-success">{notice}</p>}
    <label>แสดงรายการ<select value={filter} onChange={e => setFilter(e.target.value)}><option value="action">รอตรวจเงิน / รอโอนคืน</option><option value="active">การจองที่ยังไม่ยกเลิก</option><option value="all">ประวัติยกเลิกทั้งหมด</option></select></label>
    {loading ? <p role="status">กำลังโหลดรายการ…</p> : !visible.length ? <p className="wp-empty">ไม่มีรายการในหมวดนี้</p> : visible.map(row => <RefundCard key={row.kind + row.id} row={row} busy={busy} canManage={canManage} mutate={mutate} />)}
  </section>;
}
function RefundCard({ row, busy, canManage, mutate }: { row: RefundRow; busy: boolean; canManage: boolean; mutate: (row: RefundRow, value: Record<string, unknown>) => Promise<void> }) {
  const refund = row.refund, receipt = row.receipts?.at(-1), check = receipt?.verification;
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [fundsChecked, setFundsChecked] = useState(false), [transferred, setTransferred] = useState(false);
  const [amount, setAmount] = useState(check?.amountSatang ? money(check.amountSatang) : money(row.amount));
  const [reference, setReference] = useState(check?.reference || ''), [refundReference, setRefundReference] = useState(''), [receiptId, setReceiptId] = useState(receipt?.id || '');
  const [noFundsReason, setNoFundsReason] = useState('');
  const amountValid = /^\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
  const base = row.kind === 'game' ? '/api/marketplace/bookings/' : '/api/coaching/enrollments/';
  return <article className="wp-refund-card"><div><small>{row.kind === 'game' ? 'Open Play' : 'โค้ช'} · {row.id.slice(0, 8).toUpperCase()} · {new Date(row.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</small><h3>{row.playerName} · {row.title}</h3><p>ยอดจอง ฿{money(row.amount)}{refund?.receivedAmount ? ' · เงินต้องคืน ฿' + money(refund.receivedAmount) : ''}</p><strong>{refund ? refundLabels[refund.status] : row.cancelledAt ? 'ยกเลิกแล้ว · ประวัติเดิม' : row.paidAt ? 'รับเงินแล้ว' : 'ยังไม่ยืนยันเงินเข้า'}</strong>{refund && <p>เหตุผล: {refund.reason}</p>}</div>
    {!!row.receipts?.length && <details><summary>สลิปต้นทางและผลตรวจ {row.receipts.length} ภาพ</summary>{row.receipts.map(r => <div key={r.id}><p>{new Date(r.submittedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · {r.status === 'approved' ? 'รับเงินแล้ว' : r.status === 'rejected' ? 'ปฏิเสธการรับชำระเดิม' : 'ยังไม่รับชำระ'}{r.verification?.message && ' · ' + r.verification.message}</p><a href={base + row.id + '/receipts/' + r.id} target="_blank" rel="noopener noreferrer">เปิดภาพสลิปเดิม</a></div>)}</details>}
    {canManage && !refund && <details><summary>{row.cancelledAt ? 'ตรวจประวัติเงินของรายการยกเลิกเดิม' : 'ยกเลิกการจองนี้'}</summary><form onSubmit={event => { event.preventDefault(); void mutate(row, { action: 'cancel', reason, confirmCancellation: confirmed }); }}><label>เหตุผลยกเลิก<textarea value={reason} onChange={e => setReason(e.target.value)} minLength={3} maxLength={200} required /></label><label className="wp-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />ยืนยันคืนที่นั่ง/เวลาเรียน และเก็บสลิปเดิม โดยยังไม่ถือว่าโอนคืนแล้ว</label><button className="wp-danger" disabled={busy || !confirmed || reason.trim().length < 3}>ยืนยันยกเลิกและติดตามเงินคืน</button></form></details>}
    {canManage && refund?.status === 'review_required' && <div><p className="wp-note">ผล SlipOK เดิมไม่ถือเป็นการยืนยันเงินเข้า ตรวจรายการธนาคารจริงก่อน ไม่ต้องเปลี่ยนสลิปหรือให้ผู้เล่นโอนใหม่</p><form onSubmit={event => { event.preventDefault(); void mutate(row, { action: 'confirm_received', fundsChecked, receivedAmount: Math.round(Number(amount) * 100), transferReference: reference, receiptId }); }}><label>สลิปต้นทาง<select value={receiptId} onChange={e => setReceiptId(e.target.value)}>{row.receipts?.map(r => <option value={r.id} key={r.id}>{new Date(r.submittedAt).toLocaleString('th-TH')} · {r.id.slice(0, 8)}</option>)}</select></label><label>ยอดเข้าจริง (บาท)<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" required /></label><label>เลขอ้างอิงเงินเข้าจากธนาคาร<input value={reference} onChange={e => setReference(e.target.value)} minLength={6} maxLength={120} required autoComplete="off" /></label><label className="wp-check"><input type="checkbox" checked={fundsChecked} onChange={e => setFundsChecked(e.target.checked)} />ตรวจรายการธนาคาร เงินเข้าบัญชีเรา และสลิปต้นทางแล้ว</label><button className="wp-primary" disabled={busy || !fundsChecked || !amountValid || reference.trim().length < 6}>ยืนยันเงินเข้า → รอโอนคืน</button></form><details><summary>ตรวจแล้วไม่พบเงินเข้า</summary><label>เหตุผลและผลตรวจธนาคาร<textarea value={noFundsReason} onChange={e => setNoFundsReason(e.target.value)} minLength={3} maxLength={200} /></label><label className="wp-check"><input type="checkbox" checked={fundsChecked} onChange={e => setFundsChecked(e.target.checked)} />ตรวจรายการธนาคารแล้ว ไม่มีเงินเข้าที่ต้องคืน</label><button disabled={busy || !fundsChecked || noFundsReason.trim().length < 3} onClick={() => void mutate(row, { action: 'no_funds', fundsChecked, reason: noFundsReason })}>ปิดรายการ · ไม่มีเงินต้องคืน</button></details></div>}
    {canManage && refund?.status === 'pending' && <form onSubmit={event => { event.preventDefault(); void mutate(row, { action: 'complete', refundTransferred: transferred, refundReference }); }}><p>โอนคืนผู้จ่ายจริง ฿{money(refund.receivedAmount!)} ผ่านธนาคารก่อน แล้วบันทึกเลขอ้างอิงการโอนคืน</p><label>เลขอ้างอิงการโอนคืน<input value={refundReference} onChange={e => setRefundReference(e.target.value)} minLength={6} maxLength={120} required autoComplete="off" /></label><label className="wp-check"><input type="checkbox" checked={transferred} onChange={e => setTransferred(e.target.checked)} />โอนคืนผู้จ่ายจริงครบจำนวนแล้ว และตรวจผลสำเร็จในธนาคาร</label><button className="wp-primary" disabled={busy || !transferred || refundReference.trim().length < 6}>บันทึกว่าโอนคืนแล้ว</button></form>}
    {refund?.completedAt && <p>โอนคืนเมื่อ {new Date(refund.completedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · อ้างอิง {refund.refundReference}</p>}{refund?.resolutionReason && <p>{refund.resolutionReason}</p>}
  </article>;
}
