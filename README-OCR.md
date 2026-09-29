# รับสลิปและ OCR สำหรับ LINE Mini App

## สายงานที่โค้ดรองรับ

1. ผู้เล่นที่ยืนยันตัวตนผ่าน LINE จองก๊วน แล้วถ่ายหรือเลือกภาพ JPG, PNG, WebP ขนาดไม่เกิน 5 MB ในหน้า `/miniapp`.
2. Backend เก็บภาพไว้ในโฟลเดอร์ `data/receipts` ซึ่งไม่ถูกเปิดเป็น static URL. แอดมินต้องเข้าสู่ระบบก่อนดูภาพได้.
3. ถ้าตั้งค่า Hugging Face OCR ไว้ Backend ส่งภาพไปยัง endpoint ผ่าน HTTPS ด้วย token ฝั่งเซิร์ฟเวอร์ แล้วบันทึก JSON ที่อ่านได้. ถ้า OCR ไม่พร้อม ภาพยังอยู่และแอดมินตรวจเองได้.
4. แอดมินเทียบภาพกับยอดเงินที่เข้าบัญชีจริง แล้วอนุมัติหรือปฏิเสธพร้อมเหตุผล. อนุมัติแล้วจึงนับเป็นรายรับโอนและเข้าฐานคำนวณค่าคอม. OCR ไม่อนุมัติยอดเงินอัตโนมัติ.

## ตั้งค่า Hugging Face

ระบบนี้เตรียม **สัญญา API สำหรับ Inference Endpoint หรือ custom Docker Space** ไว้แล้ว แต่ยังไม่มีโมเดล OCR ที่ deploy แล้ว จึงยังไม่ควรคาดว่าจะอ่านข้อมูลจริงได้จนกว่าจะตั้งค่าและทดสอบกับสลิปไทยหลายธนาคาร.

ตั้งค่าตัวแปรฝั่ง Backend เท่านั้น:

```env
HF_OCR_ENDPOINT_URL="https://YOUR-PRIVATE-ENDPOINT/ocr"
HF_OCR_TOKEN="YOUR_SERVER_SIDE_TOKEN"
```

Backend ส่ง `POST` ไป URL นี้ โดย body เป็นไบต์ภาพดิบ, `Content-Type` ตรงกับภาพ, `Accept: application/json` และ `Authorization: Bearer ...`. Endpoint ต้องตอบ JSON เช่น:

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

Gradio Space ทั่วไปมีรูปแบบ API ของตัวเอง ต้องทำ adapter ให้รับภาพดิบและตอบ JSON ตามสัญญานี้ก่อนใช้งาน. สำหรับสลิปที่มีข้อมูลการเงิน ควรใช้ endpoint ที่ควบคุมสิทธิ์เข้าถึง และตรวจเงื่อนไขการส่งภาพไปผู้ให้บริการก่อนเปิดกับผู้เล่นจริง.

เอกสารผู้ให้บริการ: [Inference Endpoint requests](https://huggingface.co/docs/inference-endpoints/guides/test_endpoint), [Spaces API endpoints](https://huggingface.co/docs/hub/spaces-api-endpoints).

## สิ่งที่ยังต้องทำก่อนเปิดจริง

- ตั้ง `LINE_CHANNEL_ID`, `VITE_LIFF_ID` และ HTTPS URL ของ `/miniapp` ให้ตรงกับ LINE Developers.
- เลือกโมเดลหรือสร้าง custom endpoint ที่อ่าน **สลิปภาษาไทย** ได้จริง แล้วทดสอบความถูกต้องกับสลิปหลายธนาคาร รวมภาพเบลอและสลิปซ้ำ.
- ใช้ที่เก็บข้อมูลถาวรพร้อมสำรองข้อมูล และกำหนดอายุเก็บภาพสลิป. โค้ดปัจจุบันยังเก็บ JSON และไฟล์บนเครื่องเดียว และ API production ยังปิดอยู่.
- กำหนดบัญชีรับโอน/คำแนะนำการชำระเงินในแอป รวมถึงกติกายกเลิกและคืนเงินสำหรับรายการที่อนุมัติแล้ว.
