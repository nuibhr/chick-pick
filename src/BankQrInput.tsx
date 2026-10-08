import { useEffect, useState } from 'react';
import { staticBankQr } from './bankQr';

export default function BankQrInput({ value, change, busyChanged }: { value?: string; change: (value?: string) => void; busyChanged: (busy: boolean) => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(Boolean(value));
  useEffect(() => { if (!value) setConfirmed(false); }, [value]);
  async function read(file?: File) {
    if (!file) return;
    setError(''); setBusy(true); busyChanged(true);
    let bitmap: ImageBitmap | undefined;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('เลือกภาพ QR รับเงิน JPG/PNG/WebP ไม่เกิน 5 MB');
      bitmap = await createImageBitmap(file);
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext('2d'); if (!ctx) throw Error('อ่านรูปไม่ได้ ลองเปิดหลังบ้านใน Safari หรือ Chrome');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height), { default: decode } = await import('jsqr');
      const payload = staticBankQr(decode(image.data, image.width, image.height)?.data);
      if (!payload) throw Error('ต้องเป็น QR รับเงินแบบไม่ระบุยอดจากแอปธนาคาร ไม่ใช้ QR บนสลิป หรือ QR ที่กำหนดยอดไว้');
      setConfirmed(false); change(payload);
    } catch (cause) { setError((cause as Error).message); } finally { bitmap?.close(); setBusy(false); busyChanged(false); }
  }
  return <div className="wp-bank-qr"><label>QR รับเงินของบัญชีธนาคาร (ถ้ามี)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }} /></label><small>ในแอปกรุงศรี: สแกน → รับเงิน → บันทึก QR แบบไม่กำหนดยอด แล้วแนบรูปที่นี่ อ่านเฉพาะรหัส QR ไม่เก็บภาพต้นฉบับ ลูกค้าต้องกรอกยอดจองเองเมื่อใช้ QR นี้</small>{value && <><p role="status">อ่าน QR รับเงินแล้ว</p><label className="wp-check"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />ยืนยันว่า QR นี้รับเงินเข้าบัญชีธนาคารด้านบน</label><button type="button" onClick={() => change(undefined)}>นำ QR ออก</button></>}{busy && <p role="status">กำลังอ่าน QR…</p>}{error && <p role="alert">{error}</p>}</div>;
}
