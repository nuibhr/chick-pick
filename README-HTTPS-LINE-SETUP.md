# เริ่ม HTTPS และ LINE LIFF แบบดูหน้าแอปก่อน

> แผน Render ด้านล่างเป็นทางเลือกเดิม. ขณะนี้มี Cloudflare Workers Free staging ที่อ่านก๊วนจาก TiDB จริงแล้ว: ดู [README-CLOUDFLARE-FREE.md](README-CLOUDFLARE-FREE.md). ยังไม่เปิด LINE Login, การจอง หรือสลิปบน staging.

ไฟล์ `render.yaml` เตรียมเว็บพรีวิวบน Render จาก private repo `nuibhr/chick-pick` ไว้แล้ว เว็บพรีวิวนี้ตั้ง `NODE_ENV=production` จึงเปิดดูหน้า Open Play และทดสอบการยืนยันบัญชี LINE ได้ แต่ API จอง ส่งสลิป แอดมิน และการเงินยังปิดไว้ ไม่มีการรับเงินจริง

1. เข้าบัญชี Render ของตัวเองและเชื่อม GitHub ให้เข้าถึง private repo `nuibhr/chick-pick` เฉพาะเท่าที่จำเป็น สร้าง Blueprint จาก `render.yaml` หลังดูแผนและค่าใช้จ่ายในหน้าสรุป Render แล้ว หน้าเว็บจะมี HTTPS URL ของตัวเองในรูปแบบ `https://<service>.onrender.com`
2. เปิด URL นั้นและตรวจ `/api/health` ว่าได้ `status: ok` และ `paymentMode: disabled`; เปิด `/miniapp` ว่าหน้าผู้เล่นขึ้นได้ ยังไม่ควรกดรับโอนหรือสร้างผู้จัดบนเว็บนี้
3. ใน LINE Developers สร้าง **LINE Login channel** ของคุณ แล้วเพิ่ม **LIFF app** โดยตั้ง Endpoint URL เป็น `https://<service>.onrender.com/miniapp` เปิด scope `openid` และ `profile` และเลือกขนาดหน้าตามต้องการ เก็บ Channel ID และ LIFF ID จากหน้า settings; ไม่ต้องส่ง Channel Secret ในแชตหรือใส่ตัวแปร `VITE_`
4. ใส่ `LINE_CHANNEL_ID` และ `VITE_LIFF_ID` ใน Environment ของ Render แล้วกด deploy ใหม่ เปิด LIFF URL ที่ LINE ให้ในมือถือ (`https://liff.line.me/<LIFF_ID>`) และกดเชื่อมบัญชี ตรวจว่าหน้าโปรไฟล์แสดงชื่อ/รูปที่ยืนยันแล้ว ส่วนการจองต้องยังปิดอยู่
5. หลังย้ายข้อมูลลง PostgreSQL, ที่เก็บสลิปแบบ private และสิทธิ์ผู้จัด/ขั้นตอนตรวจเงินผ่านครบ จึงเตรียม deployment แยกสำหรับก๊วนทดลองที่รับเงินได้ ห้ามเพียงสลับค่า `NODE_ENV` เป็น `development` บนเว็บสาธารณะ

หากมีเซิร์ฟเวอร์ HTTPS ของตัวเอง ใช้ `npm ci`, `npm run build`, `NODE_ENV=production npm start` และ reverse proxy ที่ส่ง HTTPS ให้แอป ขั้นตอน LINE เหมือนกัน ตั้ง Endpoint URL ให้ตรงกับโดเมนจริง ค่า `LINE_CHANNEL_ID` และ `VITE_LIFF_ID` อยู่ฝั่ง runtime ของเซิร์ฟเวอร์; `HF_OCR_TOKEN`, `LINE_CHANNEL_SECRET` และข้อมูลบัญชีธนาคารต้องไม่ใส่ใน repo

Render แผนฟรีอาจพักบริการเมื่อไม่มีคนใช้ จึงเหมาะกับการตั้งค่าและทดสอบตัวตนก่อน ยังไม่ใช่โฮสต์ที่พร้อมรับรายการจองเงินจริง ดู [รายการก่อนเปิดจริง](READINESS-REVIEW.md)
