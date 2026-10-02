# Chick&Pick บน Cloudflare Workers Free

URL สำหรับทดสอบข้อมูล TiDB และโปรไฟล์ LINE: `https://chick-pick-tidb-staging.nuibhr1.workers.dev/miniapp`

Worker นี้อ่านเอกสาร `marketplace` จาก TiDB ผ่าน TiDB Cloud Serverless HTTP driver. หน้า Mini App, `/api/health`, `/api/player/config`, `/api/player/sessions` และตารางโค้ชตัวอย่างใช้ได้บน HTTPS. ข้อมูลก๊วนมาจาก TiDB เดิม. มี KV namespace `chick-pick-staging-receipts` แยกไว้สำหรับภาพสลิปในรอบทดลอง แต่ยังไม่มี route เขียนหรืออ่านภาพจากภายนอก. `/api/player/me` และ `/api/player/bookings` รองรับการอ่านข้อมูลส่วนตัวหลังตรวจ ID token กับ LINE ฝั่ง server แล้ว. ตั้งค่า Developing channel/LIFF และ scopes `openid`, `profile` แล้ว ผู้ใช้รายงานว่าล็อกอินบนมือถือได้. เปิดเฉพาะ POST `/api/player/me/profile` หลังตรวจ ID token ฝั่ง server; ชื่อและรูปมาจาก LINE และบันทึกโปรไฟล์พร้อม audit ใน TiDB transaction เดียวกัน. ตรวจ origin, ชนิด JSON, ขนาด 4 KB, ระดับ 2.0–5.0 และแนะนำตัวไม่เกิน 160 ตัวอักษร; กันบันทึกซ้ำภายใน 2 วินาทีโดยตรวจข้อมูลใต้ row lock. การป้องกันนี้ยังไม่ใช่ rate limit สำหรับทุก API. ยังต้องยืนยันการบันทึกด้วยบัญชีจริงบนมือถือ. การจอง, อัปโหลดและตรวจสลิป, แอดมิน, การเงิน และ OCR ยังปิดบน URL นี้. `/api/health` ต้องแสดง `mode: tidb-profile-preview`, `database: tidb` และ `receiptStorageConfigured: true`; POST โปรไฟล์ที่ไม่มี token ต้องได้ 401; mutation สำหรับจอง/สลิปยังได้ 503.

พรีวิวเดิม `https://chick-pick-preview.nuibhr1.workers.dev/miniapp` ยังเป็น static preview แยกกัน. ห้ามใช้ URL ใดรับเงินหรือให้ผู้เล่นจองจนกว่าจะผ่านการทดสอบระบบจริงครบ.

## Deploy staging ใหม่

`build:cloudflare` ตรวจไฟล์ใน `public/` เทียบกับรายการที่เลือกเข้า Git ก่อน build. หากมีไฟล์ใหม่ ให้ตรวจเนื้อหาและ stage เฉพาะ asset ของแอป; เก็บเอกสารส่วนตัวนอก `public/` เสมอ. โฟลเดอร์ `artifacts/` ถูก ignore และไม่ได้อยู่ใน assets directory. ปิด Version URLs เพื่อไม่ให้เข้ารุ่นเก่าผ่าน URL พรีวิวแยก.

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
3. ทดสอบ LINE MINI App Developing ที่เชื่อมไว้ด้วย ID token บนมือถือ. เปิดรับจองเมื่อ auth, สิทธิ์ผู้จัด, capacity และ idempotency ผ่านการทดสอบพร้อมกัน.
4. ทดสอบเส้นทางเงินจริงแบบปิด: จอง → แนบสลิป → แอดมินเทียบยอดเงินเข้าบัญชีจริง → อนุมัติ/ปฏิเสธ → เลือกคนลงสนาม → ตรวจรายรับและค่าคอม → คืนเงิน/แก้ยอด. OCR เป็นข้อมูลช่วยอ่าน ไม่ใช่หลักฐานว่าเงินเข้า.

การทดสอบ `SELECT` จาก TiDB และหน้า HTTPS ไม่ยืนยันว่าขั้นตอนรับจองหรือรับเงินพร้อมใช้งาน.

## เชื่อม LINE MINI App สำหรับ staging

ใช้ provider Chick&Pick เดิม และเลือกประเทศไทย. การสร้าง channel ต้องให้เจ้าของบัญชียืนยันข้อตกลงและสิทธิ์ดำเนินการก่อน.

สถานะที่ตรวจเมื่อ 2 ตุลาคม 2026: เจ้าของสร้าง MINI App แล้ว; Developing Channel ID `2011829684`, LIFF ID `2011829684-nZbaL7lP`, [ลิงก์ทดสอบบน LINE](https://miniapp.line.me/2011829684-nZbaL7lP). ตั้ง Endpoint ของ Developing และ scopes แล้ว. Worker version `51870282-3a89-4be2-ae84-07d8d06a59cb` ตอบ `connected: true`, `lineConfigured: true`; ไม่มี token หรือ token ปลอมได้ 401; booking POST ได้ 503. ลิงก์ MINI App บน desktop แสดง QR สำหรับมือถือ. ผู้ใช้รายงานว่าล็อกอินได้แล้ว แต่ยังไม่ยืนยันการบันทึกโปรไฟล์ผ่านมือถือหลังแก้ไข และยังไม่ได้เชื่อม Endpoint ของ Review/Published.

1. ในแท็บ Web app settings ตั้ง Endpoint URL ของ Developing เป็น `https://chick-pick-tidb-staging.nuibhr1.workers.dev/miniapp` และตรวจ scopes `openid` กับ `profile`.
2. คัดลอก Channel ID **ของ Developing** และ LIFF ID **ของ Developing** มาตั้ง Worker vars `LINE_CHANNEL_ID` และ `VITE_LIFF_ID` ใน `wrangler.tidb.jsonc`. ทั้งคู่เป็น public identifiers; ห้ามใส่ Channel secret หรือ access token ในไฟล์นี้. Worker ตรวจ ID token ผ่าน LINE โดยไม่ต้องใช้ Channel secret.
3. Deploy แล้วตรวจ `/api/player/config`: `connected: true`, LIFF ID ตรงกับ Console และ `profileEditingEnabled: true`, `bookingEnabled: false`. `/api/health` ต้องแสดง `lineConfigured: true`. เรียก `/api/player/me` โดยไม่มี token หรือใช้ token ปลอมต้องได้ 401.
4. เปิด Developing LIFF URL จาก Console บนมือถือด้วยบัญชีที่เป็นผู้ทดสอบที่ตอบรับคำเชิญแล้ว หรือมีสิทธิ์ใน channel. ตรวจชื่อ/ภาพของบัญชีจริงและรายการจองเฉพาะเจ้าของบัญชี.
5. ก่อนเปิดให้ผู้เล่นทั่วไป ใช้ Published Channel ID/LIFF ID คู่ใหม่และตั้ง Endpoint URL ของ Published ให้ตรงกับ deployment. อย่าสลับ Channel ID ของ Developing กับ LIFF ID ของ Published เพราะ ID token จะไม่ผ่านการตรวจ audience.

LINE MINI App มี Developing, Review และ Published แยก Channel ID/LIFF ID. MINI App ที่ยังไม่ verified ใช้ทดสอบได้ แต่ Developing จำกัดบัญชีที่มีสิทธิ์ และความสามารถบางรายการต้องผ่าน review. ดู [LINE MINI App Console guide](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/).

## ปรับหน้า Mini App วันที่ 2 ตุลาคม 2026

Worker version `361a0da2-27a5-46dd-a069-b1fe8633b6ae` เปิดแก้โปรไฟล์แยกจากการจอง. เปลี่ยนตัวกรองเป็น เบา–กลาง / สูง โดยแบ่งตามระดับต่ำสุดของก๊วนที่ 3.5; รูปที่ผู้ใช้ส่งแสดงครบโดยไม่ตัดข้อความ. เพิ่มภาพปกหมวดสนาม, เมนูล่าง 5 หน้า, การจำตำแหน่งเลื่อน, parallax บนภาพตกแต่ง และธีมตามมือถือพร้อมตัวเลือกสว่าง/มืด. เคารพการตั้งค่าลดการเคลื่อนไหว.

ตรวจ UI ที่ความกว้าง 320/390 px, ตัวกรองสองระดับ, เมนูทั้งห้า, การจำธีมหลัง reload และ profile save ใน fixture ที่เปิดแก้โปรไฟล์แต่ปิด booking. ตรวจ TiDB transaction/audit insert ด้วย rollback โดยไม่ทิ้งข้อมูลทดสอบ. Live config แสดง profileEditingEnabled true, bookingEnabled false; token หาย/ปลอมได้ 401, foreign origin ได้ 403, booking/receipt POST ได้ 503. การบันทึกโปรไฟล์ด้วยบัญชีจริงบน LINE มือถือยังต้องให้เจ้าของบัญชีตรวจ.
