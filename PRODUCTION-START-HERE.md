# เริ่มเปิด Chick&Pick ให้ทดลองผ่าน LINE

เอกสารนี้เป็นแผนเริ่มต้นสำหรับกรณีที่ยังไม่มีโดเมน/URL, LINE Developers channel หรือ OCR endpoint

## สถานะตอนนี้

- Chick&Pick มีหน้า Mini App, flow จอง, แนบภาพสลิป และหน้าแอดมินตรวจสลิปแล้ว แต่ยังเป็นต้นแบบบนเครื่อง: ข้อมูลหลักยังเก็บในไฟล์ JSON และภาพเก็บในโฟลเดอร์ของเซิร์ฟเวอร์
- API สำหรับการจองและบัญชียังปิดใน production โดยตั้งใจ จึงยังไม่ควรเปิด URL สาธารณะให้คนจองหรือส่งสลิป
- LINE Login/LIFF ยังไม่มี Channel ID, LIFF ID หรือ URL แบบ HTTPS
- OCR adapter ใน Chick&Pick เตรียมไว้แล้ว แต่ยังไม่มีโมเดล/endpoint ที่อ่านสลิปธนาคารไทยได้
- ข้อมูลใน `data/` เป็นข้อมูลท้องถิ่น อย่าลบหรือเขียนทับระหว่างเตรียมระบบ

- หน้า Open Play ดูผู้ที่จองจริงได้แล้วเมื่อผู้เล่นเปิดเผยโปรไฟล์เอง หน้า Workspace ตั้งบัญชีรับโอนสำหรับรายการจองทดลองได้ แต่ยังไม่ควรแสดงข้อมูลนี้ให้คนทั่วไปโอนเงิน เพราะไม่มีฐานข้อมูลธุรกรรมและการตรวจยอดเงินเข้าธนาคารแบบถาวร

## Repo `line-bill-scanner`

Repo ที่ให้มา (`https://github.com/nuibhr/line-bill-scanner`) มี `server.js` ขนาดเล็กที่เปิด CORS ให้ทุก origin และ `/api/scan-bill` ส่งค่าตัวอย่างคงที่ `{ store: "7-11", total: 125 }`; ยังไม่มีการอ่านข้อความจากภาพ, LINE auth, การตรวจสลิป หรือฐานข้อมูล จึงไม่ควรนำไป deploy หรือใช้ตัดสินว่ามีการชำระเงินจริง

สำหรับ Chick&Pick ให้ใช้ flow ตรวจสลิปที่มีอยู่ในแอป แล้วเพิ่ม OCR endpoint เป็นบริการเสริมภายหลัง โดยให้ OCR ช่วยกรอกข้อมูลเพื่อแอดมินตรวจเท่านั้น การอนุมัติยังต้องเทียบกับยอดเงินเข้าบัญชีจริง

## ลำดับงานที่แนะนำ

1. **เตรียม source repo ส่วนตัวสำหรับ Chick&Pick** — เก็บ source ของแอปหลักใน private GitHub repository แยกจาก `line-bill-scanner`; อย่า commit `.env`, `data/`, ภาพสลิป หรือไฟล์ credential
2. **ทำ backend ให้พร้อม production ก่อน deploy ให้คนใช้** — ย้าย bookings, sessions, finance และ admin identity จาก JSON ไป PostgreSQL; เพิ่ม role/ownership checks; เก็บสลิปใน private durable storage; จัดการ migration, backup, retention และ audit log; เปิด API production ต่อเมื่อสิ่งเหล่านี้ผ่านการทบทวน
3. **สร้าง HTTPS deployment** — ใช้ web service สำหรับแอป/API และ PostgreSQL แบบมี backup; เก็บ server secrets ในหน้า Environment ของโฮสต์; URL ที่ได้จะใช้ตั้ง LINE endpoint
4. **สร้าง LINE Login channel และ LIFF app** — ตั้ง endpoint เป็น `https://<app-host>/miniapp`; กำหนด callback/allowed domains ตามหน้าตั้งค่า LINE; ใส่ Channel ID และ LIFF ID ในค่าคอนฟิกที่ถูกต้อง ห้ามใส่ Channel Secret ใน `VITE_` หรือ client bundle
5. **ทดลอง workflow แบบวงปิด** — ทดสอบสมาชิก, จอง/ยกเลิก, อัปโหลดสลิป, แอดมินอนุมัติ/ปฏิเสธ, รายรับ/ค่าคอม, log, backup และการ restore ก่อนให้ผู้เล่นทั่วไปใช้
6. **เพิ่ม OCR หลัง flow หลักนิ่ง** — เลือกโมเดล/endpoint ที่รองรับสลิปไทย, วัดความแม่นยำกับหลายธนาคารและภาพจริง, ตรวจนโยบายการเก็บ/ส่งข้อมูล; ตั้ง endpoint/token ฝั่ง server เท่านั้น

## ค่าที่จะต้องสร้างและที่เก็บ

| ค่า | สร้างจาก | เก็บที่ | ความลับ |
|---|---|---|---|
| `DATABASE_URL` | หน้ารายละเอียด PostgreSQL ของผู้ให้บริการ | Environment ของ web service; local `.env` เฉพาะเมื่อต้องรันกับ DB จริง | ใช่ |
| `LINE_CHANNEL_ID` | LINE Developers Console | Environment ของ web service/ตัวแปร build เฉพาะ public ID | ไม่ใช่ |
| `VITE_LIFF_ID` | LIFF app settings ใน LINE Developers | ค่าตอน build frontend | ไม่ใช่ |
| `LINE_CHANNEL_SECRET` (ถ้าใช้ server-side OAuth flow) | LINE Developers Console | Environment ของ web service เท่านั้น | ใช่ |
| `HF_OCR_ENDPOINT_URL` | endpoint ที่สร้างหลังเลือกโมเดล | Environment ของ web service | URL อาจเป็นข้อมูลภายใน |
| `HF_OCR_TOKEN` | Hugging Face access token ที่จำกัดสิทธิ์ | Environment ของ web service เท่านั้น | ใช่ |
| Storage credentials | ผู้ให้บริการ storage หลังเลือกแบบ private | Environment ของ web service เท่านั้น | ใช่ |
| Production admin bootstrap secret | สร้างเฉพาะในขั้นเปิดระบบ | Secret manager/environment; ใช้สร้างบัญชี admin แล้วหมุน/ปิดตามแบบที่กำหนด | ใช่ |

อย่าส่งค่าเหล่านี้ในแชต และอย่า commit ลง GitHub. ยังไม่ต้องสร้าง OCR token จนกว่าจะมี endpoint ที่ใช้งานจริง

## เงื่อนไขก่อนเปิดรับผู้เล่น

- มีบัญชีผู้จัด/แอดมินที่ยืนยันตัวตนและตรวจสิทธิ์ทุก endpoint ฝั่ง server
- การจองและการอนุมัติสลิปใช้ transaction ที่ป้องกันจองเกินจำนวน/อนุมัติซ้ำ
- รูปสลิปเป็น private, เข้าถึงได้เฉพาะผู้มีสิทธิ์, มี retention period และขั้นตอนลบ/สำรองที่ชัดเจน
- รายการที่ยังไม่อนุมัติไม่เข้ารายรับหรือค่าคอม; OCR ไม่มีสิทธิ์อนุมัติแทนคน
- ยืนยัน URL, LINE callback, logging, backup/restore และตรวจการใช้งานจริงจากมือถือ

## ขั้นตอนถัดไป

เริ่มจากเตรียม Chick&Pick ให้ใช้ PostgreSQL และที่เก็บสลิปแบบถาวร พร้อมระบบผู้จัดที่ตรวจสิทธิ์ได้ จากนั้นจึงสร้าง private GitHub repo/deploy และได้ HTTPS URL สำหรับ LINE. ขั้นตอนสร้างบริการบน cloud อาจมีค่าใช้จ่าย; ยังไม่มีการสร้างบัญชีหรือเปิดบริการใด ๆ ในเอกสารนี้.
