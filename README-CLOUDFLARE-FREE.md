# Chick&Pick บน Cloudflare Workers Free

URL สำหรับทดสอบการอ่านข้อมูล TiDB: `https://chick-pick-tidb-staging.nuibhr1.workers.dev/miniapp`

Worker นี้อ่านเอกสาร `marketplace` จาก TiDB ผ่าน TiDB Cloud Serverless HTTP driver. หน้า Mini App, `/api/health`, `/api/player/config`, `/api/player/sessions` และตารางโค้ชตัวอย่างใช้ได้บน HTTPS. ข้อมูลก๊วนมาจาก TiDB เดิม แต่การจอง, LINE identity, อัปโหลดและตรวจสลิป, แอดมิน, การเงิน และ OCR ยังปิดบน URL นี้ทั้งหมด. `/api/health` ต้องแสดง `mode: tidb-readonly-preview` และ `database: tidb`; คำสั่ง POST ต้องตอบ 503.

พรีวิวเดิม `https://chick-pick-preview.nuibhr1.workers.dev/miniapp` ยังเป็น static preview แยกกัน. ห้ามใช้ URL ใดรับเงินหรือให้ผู้เล่นจองจนกว่าจะผ่านการทดสอบระบบจริงครบ.

## Deploy staging ใหม่

```sh
npm ci
npm run lint
npm run build:cloudflare
npx wrangler deploy --config wrangler.tidb.jsonc
```

ตั้ง `TIDB_DATABASE_URL` เป็น Cloudflare Worker secret ของ `chick-pick-tidb-staging` ด้วย `wrangler secret put TIDB_DATABASE_URL --config wrangler.tidb.jsonc` หรือใน Dashboard. ห้ามใส่ค่าใน `wrangler.tidb.jsonc`, GitHub, ตัวแปร `VITE_` หรือคำสั่งที่พิมพ์ URL ออกหน้าจอ. URL ต้องเป็น TiDB Cloud endpoint ที่ Serverless driver รองรับ.

## ขั้นก่อนเปิดรับเงินจริง

1. พอร์ต admin auth และทุก mutation ไปยัง TiDB HTTP driver พร้อม transaction และ rate limit ที่คงอยู่ข้าม Worker isolates. ตรวจขอบเขต CPU 10 ms ของ Workers Free โดยเฉพาะ password hashing, JSON document โตขึ้น และภาพสลิป.
2. เก็บภาพสลิปใน private durable storage ที่ตรวจสิทธิ์ฝั่ง server แล้วทดสอบอัปโหลด/อ่าน/ลบ/สำรอง; อย่าใช้ `node:fs` บน Worker เป็นที่เก็บถาวร.
3. สร้าง LINE Login channel กับ LIFF บน URL HTTPS นี้, ตั้ง `LINE_CHANNEL_ID` และ `VITE_LIFF_ID` ตามระบบ build/runtime, ทดสอบ ID token บนมือถือ. เปิดรับจองเมื่อ auth, สิทธิ์ผู้จัด, capacity และ idempotency ผ่านการทดสอบพร้อมกัน.
4. ทดสอบเส้นทางเงินจริงแบบปิด: จอง → แนบสลิป → แอดมินเทียบยอดเงินเข้าบัญชีจริง → อนุมัติ/ปฏิเสธ → เลือกคนลงสนาม → ตรวจรายรับและค่าคอม → คืนเงิน/แก้ยอด. OCR เป็นข้อมูลช่วยอ่าน ไม่ใช่หลักฐานว่าเงินเข้า.

การทดสอบ `SELECT` จาก TiDB และหน้า HTTPS ไม่ยืนยันว่าขั้นตอนรับจองหรือรับเงินพร้อมใช้งาน.
