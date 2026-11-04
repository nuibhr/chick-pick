import { useCallback, useEffect, useRef, useState } from 'react';
import type { Booking, MarketplaceData } from './marketplaceTypes';
import type { CoachingState } from './coachingTypes';
import { refundLabels } from './refundTypes';
import RefundIncomingReview from './RefundIncomingReview';

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
      const verify = value.action === 'verify_slip';
      const route = base + encodeURIComponent(row.id) + (verify ? '/receipts/' + encodeURIComponent(String(value.receiptId)) + '/verify' : '/refund');
      const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(verify ? {} : value) }), result = await response.json();
      if (!response.ok) throw Error(result.message || 'บันทึกไม่ได้');
      setNotice(verify ? 'ตรวจสลิปแล้ว หากผ่านระบบจะใส่ยอดและเลขอ้างอิงให้โดยอัตโนมัติ' : value.action === 'cancel' ? 'เปิดงานตรวจเรื่องเงินแล้ว การจองเดิมยังยกเลิกอยู่' : value.action === 'complete' ? 'บันทึกว่าโอนคืนแล้ว รายจ่ายคืนเงินเข้า Monitor' : 'บันทึกผลตรวจเงินแล้ว');
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  const visible = rows.filter(row => filter === 'all' ? row.cancelledAt : row.refund?.status === 'review_required' || row.refund?.status === 'pending');
  return <section className="wp-section wp-refunds"><h2>ยกเลิก / คืนเงิน</h2><p>การจองในหน้านี้ยกเลิกแล้ว เหลือเฉพาะเรื่องเงินที่ต้องตรวจหรือโอนคืน ไม่ต้องยกเลิกซ้ำ</p>
    {!canManage && <p className="wp-note">ผู้จัดดูสถานะได้ เจ้าของหรือฝ่ายการเงินเป็นผู้ยืนยันเงินเข้าและบันทึกผลการโอนคืน</p>}
    {error && <p role="alert" className="wp-alert">{error}</p>}{notice && <p role="status" className="wp-success">{notice}</p>}
    <label>แสดงรายการ<select value={filter} onChange={e => setFilter(e.target.value)}><option value="action">รอตรวจเงิน / รอโอนคืน</option><option value="all">ประวัติยกเลิกทั้งหมด</option></select></label>
    {loading ? <p role="status">กำลังโหลดรายการ…</p> : !visible.length ? <p className="wp-empty">ไม่มีรายการในหมวดนี้</p> : visible.map(row => <RefundCard key={row.kind + row.id} row={row} busy={busy} canManage={canManage} mutate={mutate} />)}
  </section>;
}
function RefundCard({ row, busy, canManage, mutate }: { row: RefundRow; busy: boolean; canManage: boolean; mutate: (row: RefundRow, value: Record<string, unknown>) => Promise<void> }) {
  const refund = row.refund;
  const [transferred, setTransferred] = useState(false), [refundReference, setRefundReference] = useState('');
  const base = row.kind === 'game' ? '/api/marketplace/bookings/' : '/api/coaching/enrollments/';
  return <article className="wp-refund-card"><div><small>{row.kind === 'game' ? 'Open Play' : 'โค้ช'} · {row.id.slice(0, 8).toUpperCase()} · {new Date(row.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</small><h3>{row.playerName} · {row.title}</h3><p>ยอดจอง ฿{money(row.amount)}{refund?.receivedAmount ? ' · เงินต้องคืน ฿' + money(refund.receivedAmount) : ''}</p><strong>{refund ? refundLabels[refund.status] : row.cancelledAt ? 'ยกเลิกแล้ว · ประวัติเดิม' : row.paidAt ? 'รับเงินแล้ว' : 'ยังไม่ยืนยันเงินเข้า'}</strong>{refund && <p>เหตุผล: {refund.reason}</p>}</div>
    {!!row.receipts?.length && <details><summary>สลิปต้นทางและผลตรวจ {row.receipts.length} ภาพ</summary>{row.receipts.map(r => <div key={r.id}><p>{new Date(r.submittedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · {r.status === 'approved' ? 'รับเงินแล้ว' : r.status === 'rejected' ? 'ปฏิเสธการรับชำระเดิม' : 'ยังไม่รับชำระ'}{r.verification?.message && ' · ' + r.verification.message}</p><a href={base + row.id + '/receipts/' + r.id} target="_blank" rel="noopener noreferrer">เปิดภาพสลิปเดิม</a></div>)}</details>}
    {canManage && !refund && row.cancelledAt && <button type="button" disabled={busy} onClick={() => void mutate(row, { action: 'cancel', confirmCancellation: true, reason: 'เปิดตรวจเรื่องเงินของการจองที่ยกเลิกไว้แล้ว' })}>ตรวจเรื่องเงินของรายการเดิม</button>}
    {canManage && refund?.status === 'review_required' && <RefundIncomingReview receipts={row.receipts} amount={row.amount} busy={busy} mutate={value => void mutate(row, value)} />}
    {canManage && refund?.status === 'pending' && <form onSubmit={event => { event.preventDefault(); void mutate(row, { action: 'complete', refundTransferred: transferred, refundReference }); }}><p>โอนคืนผู้จ่ายจริง ฿{money(refund.receivedAmount!)} ผ่านธนาคารก่อน แล้วบันทึกเลขอ้างอิงการโอนคืน</p><label>เลขอ้างอิงการโอนคืน<input value={refundReference} onChange={e => setRefundReference(e.target.value)} minLength={6} maxLength={120} required autoComplete="off" /></label><label className="wp-check"><input type="checkbox" checked={transferred} onChange={e => setTransferred(e.target.checked)} />โอนคืนผู้จ่ายจริงครบจำนวนแล้ว และตรวจผลสำเร็จในธนาคาร</label><button className="wp-primary" disabled={busy || !transferred || refundReference.trim().length < 6}>บันทึกว่าโอนคืนแล้ว</button></form>}
    {canManage && refund?.status === 'not_required' && <button type="button" disabled={busy} onClick={() => void mutate(row, { action: 'reopen_review', reason: 'ผู้จัดเปิดตรวจเงินอีกครั้งหลังได้รับข้อมูลเพิ่มเติม' })}>ตรวจเงินอีกครั้ง</button>}
    {refund?.completedAt && <p>โอนคืนเมื่อ {new Date(refund.completedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · อ้างอิง {refund.refundReference}</p>}{refund?.resolutionReason && <p>{refund.resolutionReason}</p>}
  </article>;
}
