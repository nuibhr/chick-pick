# รับสลิปและ OCR สำหรับ LINE Mini App

## สายงานที่โค้ดรองรับ

1. ผู้เล่นที่ยืนยันตัวตนผ่าน LINE จองก๊วน แล้วถ่ายหรือเลือกภาพ JPG, PNG, WebP ขนาดไม่เกิน 5 MB ในหน้า `/miniapp`.
2. Backend เก็บภาพไว้ในโฟลเดอร์ `data/receipts` ซึ่งไม่ถูกเปิดเป็น static URL. แอดมินต้องเข้าสู่ระบบก่อนดูภาพได้.
3. ถ้าตั้งค่า Hugging Face OCR ไว้ Backend อัปโหลดภาพเข้า private Gradio Space ผ่าน HTTPS ด้วย token ฝั่งเซิร์ฟเวอร์ เรียกงาน `/ocr` แล้วบันทึก JSON ที่อ่านได้. ถ้า OCR ไม่พร้อม ภาพยังอยู่และแอดมินตรวจเองได้.
4. แอดมินเทียบภาพกับยอดเงินที่เข้าบัญชีจริง แล้วอนุมัติหรือปฏิเสธพร้อมเหตุผล. อนุมัติแล้วจึงนับเป็นรายรับโอนและเข้าฐานคำนวณค่าคอม. OCR ไม่อนุมัติยอดเงินอัตโนมัติ.

## ตั้งค่า Hugging Face

ระบบรองรับ private Gradio Space ของ `nuibhr/line-bill-scanner` และยังรองรับ raw `/ocr` endpoint เดิม. ต้อง deploy และทดสอบกับสลิปไทยหลายธนาคารก่อนใช้เป็นตัวช่วยตรวจจริง.

ตั้งค่าตัวแปรฝั่ง Backend เท่านั้น:

```env
HF_OCR_ENDPOINT_URL="https://YOUR-PRIVATE-SPACE.hf.space"
HF_OCR_TOKEN="YOUR_SERVER_SIDE_TOKEN"
```

Backend อัปโหลดภาพไป `/gradio_api/upload`, เรียก `/gradio_api/call/ocr` และอ่านผลลัพธ์ SSE โดยแนบ `Authorization: Bearer ...` ทุกครั้ง. ฟังก์ชัน `/ocr` ตอบ JSON เช่น:

```json
{
  "amount": 190.00,
  "transferredAt": "2026-09-28 14:30",
  "reference": "BANK-TRANSACTION-ID",
  "sender": "ผู้โอน",
  "receiver": "ผู้รับ",
  "rawText": "ข้อความทั้งหมดที่ OCR อ่านได้",
  "confidence": 0.82
}
```

ทุก field ยกเว้น `rawText` อาจเป็น `null` ได้. Backend รองรับผลลัพธ์ `{ "result": { ... } }` หรือ `[{ "generated_text": "..." }]` ด้วย ถ้า `generated_text` ไม่ใช่ JSON จะเก็บเป็นข้อความดิบเพื่อให้คนตรวจ. อัตราความมั่นใจเป็นค่าเพื่อช่วยอ่าน ไม่ใช่หลักฐานการโอน.

Space ต้องเป็น Private และ token ต้องอยู่ใน backend เท่านั้น. OCR เป็นข้อมูลช่วยอ่าน ไม่ใช่หลักฐานว่ามีเงินเข้าบัญชี.

เอกสารผู้ให้บริการ: [Inference Endpoint requests](https://huggingface.co/docs/inference-endpoints/guides/test_endpoint), [Spaces API endpoints](https://huggingface.co/docs/hub/spaces-api-endpoints).

## สิ่งที่ยังต้องทำก่อนเปิดจริง

- ตั้ง `LINE_CHANNEL_ID`, `VITE_LIFF_ID` และ HTTPS URL ของ `/miniapp` ให้ตรงกับ LINE Developers.
- เลือกโมเดลหรือสร้าง custom endpoint ที่อ่าน **สลิปภาษาไทย** ได้จริง แล้วทดสอบความถูกต้องกับสลิปหลายธนาคาร รวมภาพเบลอและสลิปซ้ำ.
- กำหนดอายุเก็บภาพสลิปและนโยบายลบข้อมูล. TiDB เก็บภาพและ metadata แบบถาวรแล้ว แต่ยังต้องกำหนดรอบสำรองและ retention ก่อนเปิดจริง.
- กำหนดบัญชีรับโอน/คำแนะนำการชำระเงินในแอป รวมถึงกติกายกเลิกและคืนเงินสำหรับรายการที่อนุมัติแล้ว.
