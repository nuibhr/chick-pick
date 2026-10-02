# Chick&Pick บน Cloudflare Workers Free

URL สำหรับทดสอบการอ่านข้อมูล TiDB: `https://chick-pick-tidb-staging.nuibhr1.workers.dev/miniapp`

Worker นี้อ่านเอกสาร `marketplace` จาก TiDB ผ่าน TiDB Cloud Serverless HTTP driver. หน้า Mini App, `/api/health`, `/api/player/config`, `/api/player/sessions` และตารางโค้ชตัวอย่างใช้ได้บน HTTPS. ข้อมูลก๊วนมาจาก TiDB เดิม. มี KV namespace `chick-pick-staging-receipts` แยกไว้สำหรับภาพสลิปในรอบทดลอง แต่ยังไม่มี route เขียนหรืออ่านภาพจากภายนอก. `/api/player/me` และ `/api/player/bookings` รองรับการอ่านข้อมูลส่วนตัวหลังตรวจ ID token กับ LINE ฝั่ง server แล้ว แต่ยังต้องตั้งค่า channel/LIFF ก่อนทดสอบด้วยบัญชีจริง. การจอง, อัปโหลดและตรวจสลิป, แอดมิน, การเงิน และ OCR ยังปิดบน URL นี้. `/api/health` ต้องแสดง `mode: tidb-readonly-preview`, `database: tidb` และ `receiptStorageConfigured: true`; คำสั่ง POST ต้องตอบ 503.

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
2. ผูกการอัปโหลดสลิปกับ KV โดยใช้ key สุ่มรายภาพ, ตรวจสิทธิ์ฝั่ง server ทุกครั้งที่อ่าน และลบ key หาก transaction ใน TiDB ล้มเหลว. ทดสอบอัปโหลด/อ่าน/ลบ/สำรองและกำหนดอายุข้อมูล; อย่าใช้ `node:fs` บน Worker เป็นที่เก็บถาวร. Workers KV Free จำกัด 1 GB และ 1,000 writes/วัน จึงต้องติดตามการใช้จริงก่อนขยายก๊วน.
3. สร้าง LINE MINI App channel กับ LIFF บน URL HTTPS นี้ตามขั้นด้านล่าง แล้วทดสอบ ID token บนมือถือ. เปิดรับจองเมื่อ auth, สิทธิ์ผู้จัด, capacity และ idempotency ผ่านการทดสอบพร้อมกัน.
4. ทดสอบเส้นทางเงินจริงแบบปิด: จอง → แนบสลิป → แอดมินเทียบยอดเงินเข้าบัญชีจริง → อนุมัติ/ปฏิเสธ → เลือกคนลงสนาม → ตรวจรายรับและค่าคอม → คืนเงิน/แก้ยอด. OCR เป็นข้อมูลช่วยอ่าน ไม่ใช่หลักฐานว่าเงินเข้า.

การทดสอบ `SELECT` จาก TiDB และหน้า HTTPS ไม่ยืนยันว่าขั้นตอนรับจองหรือรับเงินพร้อมใช้งาน.

## เชื่อม LINE MINI App สำหรับ staging

ใช้ provider Chick&Pick เดิม และเลือกประเทศไทย. การสร้าง channel ต้องให้เจ้าของบัญชียืนยันข้อตกลงและสิทธิ์ดำเนินการก่อน.

1. ในแท็บ Web app settings ตั้ง Endpoint URL ของ Developing เป็น `https://chick-pick-tidb-staging.nuibhr1.workers.dev/miniapp` และตรวจ scopes `openid` กับ `profile`.
2. คัดลอก Channel ID **ของ Developing** และ LIFF ID **ของ Developing** มาตั้ง Worker vars `LINE_CHANNEL_ID` และ `VITE_LIFF_ID` ใน `wrangler.tidb.jsonc`. ทั้งคู่เป็น public identifiers; ห้ามใส่ Channel secret หรือ access token ในไฟล์นี้. Worker ตรวจ ID token ผ่าน LINE โดยไม่ต้องใช้ Channel secret.
3. Deploy แล้วตรวจ `/api/player/config`: `connected: true`, LIFF ID ตรงกับ Console และ `bookingEnabled: false`. `/api/health` ต้องแสดง `lineConfigured: true`. เรียก `/api/player/me` โดยไม่มี token หรือใช้ token ปลอมต้องได้ 401.
4. เปิด Developing LIFF URL จาก Console บนมือถือด้วยบัญชีที่เป็นผู้ทดสอบที่ตอบรับคำเชิญแล้ว หรือมีสิทธิ์ใน channel. ตรวจชื่อ/ภาพของบัญชีจริงและรายการจองเฉพาะเจ้าของบัญชี.
5. ก่อนเปิดให้ผู้เล่นทั่วไป ใช้ Published Channel ID/LIFF ID คู่ใหม่และตั้ง Endpoint URL ของ Published ให้ตรงกับ deployment. อย่าสลับ Channel ID ของ Developing กับ LIFF ID ของ Published เพราะ ID token จะไม่ผ่านการตรวจ audience.

LINE MINI App มี Developing, Review และ Published แยก Channel ID/LIFF ID. MINI App ที่ยังไม่ verified ใช้ทดสอบได้ แต่ Developing จำกัดบัญชีที่มีสิทธิ์ และความสามารถบางรายการต้องผ่าน review. ดู [LINE MINI App Console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/).
