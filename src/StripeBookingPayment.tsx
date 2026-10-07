import { useState } from 'react';
import type { StripePayment } from './paymentTypes';
export default function StripeBookingPayment({ booking, token, mode, ready, refresh }: { booking: { id: string; kind?: 'game' | 'coaching'; stripe?: Pick<StripePayment, 'status' | 'mode' | 'expiresAt' | 'issue'> | null }; token: string; mode?: 'live' | 'test' | null; ready: boolean; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function action() {
    if (busy) return; setBusy(true); setError('');
    try {
      const r = await fetch('/api/player/payments/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ kind: booking.kind || 'game', id: booking.id }) });
      const d = await r.json(); if (!r.ok) throw Error(d.message || 'เปิดหน้าชำระไม่สำเร็จ');
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="pa-transfer-instructions"><b>รายการ Stripe เดิม</b><small>การชำระใหม่เปลี่ยนเป็นโอนและแนบสลิปแล้ว กรุณาตรวจสถานะรายการเดิมก่อนเพื่อป้องกันจ่ายซ้ำ</small>{booking.stripe?.expiresAt && <small>QR เดิมหมดอายุ {new Date(booking.stripe.expiresAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</small>}{mode === 'test' && booking.stripe?.status === 'test_paid' && <p role="status">เป็นการจองทดสอบ ไม่มีรายรับเงินจริง ให้ยกเลิกการจองทดสอบแล้วจองใหม่เพื่อแนบสลิป</p>}{booking.stripe?.issue && <p role="alert">{booking.stripe.issue}</p>}{booking.stripe && <button disabled={busy || !ready || !token} onClick={() => void action()}>{busy ? 'กำลังตรวจ…' : 'ตรวจสถานะรายการเดิม'}</button>}{error && <p className="pa-slip-note" role="alert">{error}</p>}</div>;
}
