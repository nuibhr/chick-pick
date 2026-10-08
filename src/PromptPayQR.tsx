import { useEffect, useState } from 'react';
import { promptPayImage } from './promptPay';

export default function PromptPayQR({ phone, amount, recipient }: { phone: string; amount: number; recipient: string }) {
  const [image, setImage] = useState<{ key: string; url: string } | null>(null), [error, setError] = useState('');
  const key = phone + ':' + amount;
  useEffect(() => {
    let active = true; setError('');
    void promptPayImage(phone, amount).then(url => { if (active) setImage({ key, url }); }).catch(() => { if (active) setError('สร้าง QR ไม่สำเร็จ กรุณาใช้เบอร์พร้อมเพย์ที่แสดงหรือติดต่อผู้จัด'); });
    return () => { active = false; };
  }, [key, phone, amount]);
  return <div className="pa-payment-qr"><b>สแกนพร้อมเพย์ตามยอดจอง</b>{image?.key === key ? <><img src={image.url} alt={'QR พร้อมเพย์ของ ' + recipient + ' ยอด ' + (amount / 100).toFixed(2) + ' บาท'} width={260} height={260} /><a href={image.url} download={'chick-pick-promptpay-' + amount + '.png'}>บันทึก QR สำหรับเปิดในแอปธนาคาร</a></> : error ? <p role="alert">{error}</p> : <p role="status">กำลังสร้าง QR…</p>}<small>ตรวจชื่อผู้รับและยอดในแอปธนาคารก่อนยืนยันโอน จากนั้นกลับมาแนบสลิป QR นี้ช่วยกรอกยอด ไม่มีเลขอ้างอิงของการจองอยู่ใน QR</small></div>;
}
