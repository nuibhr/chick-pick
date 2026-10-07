import { useState } from 'react';
import type { StripePayment } from './paymentTypes';
export default function StripeBookingPayment({ booking, token, mode, ready, refresh }: { booking: { id: string; kind?: 'game' | 'coaching'; stripe?: Pick<StripePayment, 'status' | 'mode' | 'expiresAt' | 'issue'> | null }; token: string; mode?: 'live' | 'test' | null; ready: boolean; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function action(sync = false) {
    if (busy) return; setBusy(true); setError('');
    try {
      const r = await fetch('/api/player/payments/' + (sync ? 'sync' : 'checkout'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ kind: booking.kind || 'game', id: booking.id }) });
      const d = await r.json(); if (!r.ok) throw Error(d.message || 'เปิดหน้าชำระไม่สำเร็จ');
      if (d.url) { const u = new URL(d.url); if (u.protocol !== 'https:' || u.hostname !== 'checkout.stripe.com') throw Error('ลิงก์ชำระไม่ถูกต้อง'); location.assign(u.href); } else await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const finished = ['paid', 'test_paid', 'requires_review'].includes(booking.stripe?.status || '');
  return <div className="pa-transfer-instructions"><b>PromptPay QR ผ่าน Stripe</b><small>{mode === 'test' ? 'โหมดทดสอบ · ไม่ใช่การรับเงินจริงและยังไม่รับเข้าสนาม' : 'เปิดหน้าชำระเพื่อแสดง QR แล้วใช้แอปธนาคารสแกนหรือเลือกรูป QR ตามที่ธนาคารรองรับ Stripe จะยืนยันเงินให้ระบบ'}</small>{booking.stripe?.expiresAt && <small>QR หมดอายุ {new Date(booking.stripe.expiresAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} กรุณาไม่จ่าย QR เดิมซ้ำ</small>}{booking.stripe?.status === 'test_paid' && <p role="status">ทดสอบชำระผ่านแล้ว · ไม่มีรายรับเงินจริง</p>}{booking.stripe?.issue && <p role="alert">{booking.stripe.issue}</p>}{!finished && <button className="pa-primary" disabled={busy || !ready || !token} onClick={() => void action()}>{busy ? 'กำลังตรวจสอบ…' : booking.stripe?.status === 'pending' ? 'เปิด QR เดิม' : 'เปิด PromptPay QR'}</button>}{booking.stripe && <button disabled={busy || !ready || !token} onClick={() => void action(true)}>ตรวจสถานะกับ Stripe</button>}{!ready && <small>ผู้จัดยังตั้งค่า Stripe ไม่ครบ</small>}{error && <p className="pa-slip-note" role="alert">{error}</p>}</div>;
}
