import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Booking } from './marketplaceTypes';

type Row = Pick<Booking, 'id' | 'title' | 'playerName' | 'amount' | 'paidAt' | 'receipts' | 'cancelledAt' | 'refund'>;
export default function BookingCancellation({ booking, canFinance, busy, mutate, routeBase = '/api/marketplace/bookings' }: { booking: Row; canFinance: boolean; busy: boolean; routeBase?: string; mutate: (path: string, body: unknown, message: string) => Promise<boolean> }) {
  const [snapshot, setSnapshot] = useState<Row | null>(null), [disposition, setDisposition] = useState('unknown'), [reason, setReason] = useState(''), [amount, setAmount] = useState(''), [reference, setReference] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false);
  useEffect(() => { if (snapshot) dialog.current?.showModal(); }, [snapshot]);
  if (booking.cancelledAt || booking.paidAt && !canFinance) return null;
  const receipt = snapshot?.receipts?.at(-1), verified = receipt?.verification?.status === 'verified', paid = Boolean(snapshot?.paidAt);
  const manualValid = /^\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && /^[A-Za-z0-9\s-]{6,120}$/.test(reference);
  const hasVerifiedMoney = paid || booking.receipts?.some(r => r.verifiedTransferReference || r.status === 'approved' || r.verification?.status === 'verified');
  return <><button type="button" className="wp-danger wp-cancel-reservation" disabled={busy} onClick={() => { setSnapshot(booking); setDisposition('unknown'); setReason(''); setReference(''); setAmount((booking.amount / 100).toFixed(2)); }}>ยกเลิกการจอง</button>
    {snapshot && <dialog className="wp-cancel-dialog" ref={dialog} onCancel={() => setSnapshot(null)} aria-labelledby={'cancel-title-' + booking.id}>
      <form onSubmit={async event => {
        event.preventDefault(); if (lock.current) return; lock.current = true;
        try { await mutate(`${routeBase}/${encodeURIComponent(booking.id)}/cancellation`, { confirmCancellation: true, expectedReceiptId: receipt?.id || null, expectedPaidAt: snapshot.paidAt || null, disposition: paid ? 'unknown' : disposition, fundsChecked: disposition !== 'unknown', reason: reason.trim() || 'ผู้จัดยกเลิกการจอง', ...(disposition === 'received' && !verified ? { receivedAmount: Math.round(Number(amount) * 100), transferReference: reference } : {}) }, 'ยกเลิกการจองเรียบร้อยแล้ว เก็บหลักฐานและจัดสถานะเงินให้ในรายการเดียว'); }
        finally { lock.current = false; setSnapshot(null); }
      }}>
        <div className="wp-cancel-heading"><div><small>จัดการในครั้งเดียว</small><h2 id={'cancel-title-' + booking.id}>ยกเลิกการจองนี้?</h2></div><button type="button" onClick={() => setSnapshot(null)} aria-label="ปิดหน้าต่างยกเลิก" disabled={busy}><X size={20} /></button></div>
        <p><strong>{booking.playerName}</strong><br />{booking.title} · ฿{(booking.amount / 100).toFixed(2)}</p>
        {paid ? <p className="wp-note">รายการนี้รับเงินแล้ว ระบบจะคืนที่ว่างและส่งเข้าคิวรอโอนคืนให้ฝ่ายการเงิน โดยเก็บรายรับเดิมไว้</p> : canFinance ? <fieldset><legend>ตรวจยอดในธนาคาร แล้วเลือกสถานะเงิน</legend>
          <label><input type="radio" name="disposition" value="no_payment" checked={disposition === 'no_payment'} disabled={hasVerifiedMoney} onChange={e => setDisposition(e.target.value)} /><span>ตรวจแล้ว ไม่มีเงินเข้า<small>ยกเลิกและปิดงานได้เลย</small></span></label>
          <label><input type="radio" name="disposition" value="received" checked={disposition === 'received'} onChange={e => setDisposition(e.target.value)} /><span>ตรวจแล้ว มีเงินเข้า<small>ยกเลิกและส่งเข้าคิวรอโอนคืน</small></span></label>
          <label><input type="radio" name="disposition" value="unknown" checked={disposition === 'unknown'} onChange={e => setDisposition(e.target.value)} /><span>ยังไม่แน่ใจ<small>ยกเลิกที่นั่งก่อน เก็บเรื่องเงินไว้ตรวจต่อ</small></span></label>
        </fieldset> : <p className="wp-note">ยกเลิกที่นั่งและเก็บสลิปไว้ให้ฝ่ายการเงินตรวจต่อได้ทันที</p>}
        {!paid && disposition === 'received' && (verified ? <p className="wp-success">ใช้ยอดและเลขอ้างอิงจาก SlipOK ที่ตรวจผ่านแล้ว ไม่ต้องกรอกซ้ำ</p> : <div className="wp-cancel-money"><label>ยอดเข้าจริง (บาท)<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" required /></label><label>เลขอ้างอิงเงินเข้าจากธนาคาร<input value={reference} onChange={e => setReference(e.target.value)} maxLength={120} required autoComplete="off" /></label></div>)}
        <details><summary>เพิ่มเหตุผลให้ผู้เล่น (ไม่บังคับ)</summary><textarea aria-label="เหตุผลยกเลิก" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="เช่น ยกเลิกตามคำขอผู้เล่น" /></details>
        <p className="wp-cancel-footnote">สลิปและประวัติยังอยู่ ผู้เล่นจะเห็นสถานะใหม่ในกระดิ่งแจ้งเตือน การโอนคืนยังต้องทำผ่านธนาคารเอง</p>
        <div className="wp-cancel-actions"><button type="button" disabled={busy} onClick={() => setSnapshot(null)}>เก็บการจองไว้</button><button className="wp-danger" disabled={busy || disposition === 'received' && !verified && !manualValid}>{busy ? 'กำลังบันทึก…' : paid || disposition === 'received' ? 'ยกเลิกและรอคืนเงิน' : disposition === 'no_payment' ? 'ยกเลิกและปิดงาน' : 'ยกเลิกการจอง'}</button></div>
      </form>
    </dialog>}
  </>;
}
