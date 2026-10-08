import { useEffect, useRef, useState } from 'react';
import { promptPayImage } from './promptPay';
import { downloadQr, saveQrImage } from './qrExport';

export default function PromptPayQR({ phone = '', bankPayload, amount, recipient, openInBrowser }: { phone?: string; bankPayload?: string; amount: number; recipient: string; openInBrowser?: () => Promise<string> }) {
  const [image, setImage] = useState<{ key: string; url: string } | null>(null), [error, setError] = useState('');
  const [exporting, setExporting] = useState(false), [notice, setNotice] = useState(''), [externalUrl, setExternalUrl] = useState('');
  const key = (bankPayload || phone) + ':' + amount;
  const target = useRef(key); target.current = key;
  useEffect(() => { target.current = key; setExternalUrl(''); setNotice(''); return () => { target.current = ''; }; }, [key]);
  useEffect(() => {
    let active = true; setError('');
    const render = bankPayload ? import('qrcode').then(qr => qr.toDataURL(bankPayload, { width: 360, margin: 4, errorCorrectionLevel: 'M' })) : promptPayImage(phone, amount);
    void render.then(url => { if (active) setImage({ key, url }); }).catch(() => { if (active) setError('สร้าง QR ไม่สำเร็จ กรุณาใช้เลขรับเงินที่แสดงหรือติดต่อผู้จัด'); });
    return () => { active = false; };
  }, [key, phone, bankPayload, amount]);
  async function save() {
    if (exporting || image?.key !== key) return;
    setExporting(true); setNotice('');
    try {
      const result = await saveQrImage(image.url, 'chick-pick-qr-' + amount + '.png', { canShare: navigator.canShare?.bind(navigator), share: navigator.share?.bind(navigator), download: downloadQr });
      if (target.current !== key) return;
      setNotice(result === 'shared' ? 'ปิดหน้าต่างแชร์แล้ว ตรวจภาพที่บันทึกไว้ก่อนเปิดแอปธนาคาร' : result === 'download-started' ? 'เริ่มดาวน์โหลดแล้ว หาก LINE ไม่บันทึกภาพ ให้เปิด QR ใน Safari/Chrome ด้วยปุ่มด้านล่าง' : result === 'unavailable' ? 'LINE บนเครื่องนี้ยังบันทึกไฟล์ไม่ได้ ใช้ปุ่มเปิด QR ใน Safari/Chrome ด้านล่าง' : 'ยกเลิกการบันทึกแล้ว');
    } catch { setNotice('บันทึกไม่ได้ กรุณาเปิด QR ใน Safari/Chrome'); } finally { setExporting(false); }
  }
  async function external() {
    if (!openInBrowser || exporting) return;
    setExporting(true); setNotice('');
    try {
      const url = await openInBrowser(), parsed = new URL(url);
      if (target.current !== key) return;
      if (parsed.origin !== location.origin || parsed.pathname !== '/api/player/payments/qr/view') throw Error('invalid QR URL');
      setExternalUrl(url);
      const { default: liff } = await import('@line/liff');
      if (target.current !== key) return;
      if (liff.isInClient()) liff.openWindow({ url, external: true });
      else setNotice('กดลิงก์เปิดหน้าบันทึก QR ด้านล่าง แล้วดาวน์โหลดหรือแตะภาพค้าง');
    } catch { setNotice('เปิด QR ไม่สำเร็จ ลองรีเฟรชการจอง หรือติดต่อผู้จัดก่อนโอน'); } finally { setExporting(false); }
  }
  return <div className="pa-payment-qr"><b>{bankPayload ? 'QR รับเงินของบัญชีธนาคาร' : 'สแกนพร้อมเพย์ตามยอดจอง'}</b>{image?.key === key ? <><img src={image.url} alt={'QR รับเงินของ ' + recipient + ' ยอดจอง ' + (amount / 100).toFixed(2) + ' บาท'} width={260} height={260} /><button type="button" disabled={exporting} onClick={() => void save()}>{exporting ? 'กำลังเตรียม…' : 'บันทึก / แชร์ภาพ QR'}</button>{openInBrowser && <button type="button" disabled={exporting} onClick={() => void external()}>เปิด QR ใน Safari / Chrome</button>}{externalUrl && <a href={externalUrl} target="_blank" rel="noopener noreferrer">เปิดหน้าบันทึก QR · ลิงก์ใช้ได้ 5 นาที</a>}</> : error ? <p role="alert">{error}</p> : <p role="status">กำลังสร้าง QR…</p>}{notice && <p role="status">{notice}</p>}<small>{bankPayload ? 'QR ธนาคารไม่กำหนดยอด กรอกยอดจองด้านบนเอง' : 'QR นี้ช่วยกรอกยอด ไม่มีเลขอ้างอิงการจองอยู่ใน QR'} · ตรวจชื่อผู้รับและยอดในแอปธนาคารก่อนโอน แล้วกลับมาแนบสลิป</small></div>;
}
