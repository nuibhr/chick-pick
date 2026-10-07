# Stripe PromptPay บน Chick&Pick

> Retired for new payments on 7 October 2026. Use [README-SLIPOK.md](README-SLIPOK.md) for the current receipt flow. The instructions below describe the earlier integration; keep existing keys/webhooks only to reconcile old records. New Stripe Checkout and Stripe selection in settings are disabled.

ใช้แทน OCR สำหรับการชำระใหม่บน Cloudflare Worker `chick-pick-tidb-staging` เท่านั้น ยังเก็บประวัติสลิปเดิมและการตรวจสลิปด้วยคนไว้ โค้ด backend Node ใน `server.marketplace.ts` ไม่ได้เปลี่ยนเป็น Stripe ในรอบนี้

## ตั้งบัญชีและ webhook

1. บัญชี Stripe ต้องรองรับ PromptPay (บัญชีประเทศไทยและสกุล THB) ตรวจและเปิด PromptPay ใน Payment methods ของบัญชี Stripe ก่อน เริ่มใน test mode
2. สร้าง **snapshot event webhook** ที่ `https://chick-pick-tidb-staging.nuibhr1.workers.dev/api/stripe/webhook` ในบัญชีและโหมดเดียวกับ secret key เลือก `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` ใช้ API version `2026-08-26.dahlia` ของ SDK ที่ติดตั้งไว้
3. ตั้ง Worker secrets `STRIPE_SECRET_KEY` และ `STRIPE_WEBHOOK_SECRET` ใน Cloudflare Settings > Variables and Secrets ชนิด Secret หรือรันคำสั่งด้านล่าง คีย์ต้องอยู่บนเซิร์ฟเวอร์เท่านั้น ไม่ใส่ใน VITE vars, Git หรือแชต `PUBLIC_APP_URL` อยู่ใน `wrangler.tidb.jsonc` แล้ว

```powershell
# รันจากโฟลเดอร์โปรเจกต์ รับคีย์แบบซ่อนตัวอักษร ไม่เขียนคีย์ลงไฟล์
./scripts/configureStripe.ps1
# หลังทดสอบครบเท่านั้น จึงเปลี่ยนทั้ง key และ webhook เป็น live mode
./scripts/configureStripe.ps1 -Live
```

สคริปต์ใช้บัญชี Cloudflare ที่ล็อกอินใน Wrangler และเป้าหมายตามไฟล์ config จะอัปเดตเฉพาะสอง Stripe secrets โดยไม่แตะ TiDB หรือ LINE หากบันทึกได้เพียงคีย์เดียว ให้ปิดการจอง Stripe ไว้แล้วรันอีกครั้ง คีย์คนละบัญชีหรือ webhook คนละโหมดจะรับชำระไม่สำเร็จ

4. เจ้าของเข้าแอดมินแพลตฟอร์ม > บัญชีและการเปิดรับ > เลือก **Stripe PromptPay QR** การเปลี่ยนช่องทางจะปิดรับจองใหม่ จากนั้นตรวจสนาม ราคา ตาราง แล้วเปิดรับจองอีกครั้ง สถานะ "ตั้งค่าคีย์แล้ว" ตรวจเพียงว่าคีย์อยู่ครบ ไม่ได้ยืนยันว่า Stripe อนุมัติบัญชีหรือเปิด PromptPay แล้ว

## ทดสอบก่อนเปิดเงินจริง

- ให้บัญชี LINE ของผู้เล่นจริงจอง Open Play และนัดโค้ช เปิดรายการจอง > PromptPay QR ต้องไป `checkout.stripe.com` พร้อมยอดตามราคาบนเซิร์ฟเวอร์ ในมือถือเดียวกันตรวจการเปิดแอปธนาคาร/การเลือกรูป QR ตามวิธีที่ธนาคารรองรับ
- ใน test mode ใช้การจำลองชำระของ Stripe เท่านั้น ต้องได้ `test_paid` และข้อความ "ไม่มีรายรับเงินจริง" ยอด Monitor และรายชื่อเข้าสนามต้องไม่เพิ่ม ยกเลิกการจองทดสอบแล้วสร้างรายการใหม่เมื่อสลับไป live mode ห้ามสแกน QR ทดสอบด้วยเงินจริง
- เช็ก event delivery ใน Stripe ว่า HTTP 200 ไม่ใช่แค่หน้า success URL ผู้เล่นมีปุ่ม "ตรวจสถานะกับ Stripe" เป็นทางสำรอง ระบบใช้ API ฝั่งเซิร์ฟเวอร์ตรวจยอดและ PaymentIntent ก่อนเปลี่ยนสถานะ
- เมื่อเจ้าของพร้อม ให้เจ้าของกำหนดยอดทดลองเงินจริงและดำเนินการเอง ตรวจ Checkout, webhook, ยอดใน Stripe, บัญชีแอป และการเลือกคนเข้าสนาม เงินอาจยังไม่เข้าบัญชีธนาคารทันทีที่ Checkout สำเร็จ การรับเงินกับ payout ของ Stripe เป็นคนละขั้นตอน

## พฤติกรรมและข้อจำกัด

- ราคาคำนวณบนเซิร์ฟเวอร์ ไม่ใช้ยอดหรือ LINE user ID ที่ผู้เล่นส่งมา Checkout มี idempotency key ต่อ attempt; webhook ตรวจลายเซ็นจาก raw body และอ่าน session/PaymentIntent ซ้ำจาก Stripe ก่อนลงเงิน ยอดต้องเป็น THB และชนิดชำระ PromptPay
- เฉพาะ live mode ที่ยืนยันยอดและค่าธรรมเนียมจริงครบจึงเป็นรายรับ ทดสอบไม่เพิ่ม paidAt/รายรับ/ค่าคอม Open Play ที่จ่ายแล้วก็ยังรอผู้จัดรับเข้าสนาม
- ค่าธรรมเนียมจริงถูกบันทึกเป็นรายจ่ายผูกก๊วนหรือนัดเรียน ครั้งเดียวต่อ PaymentIntent และหักก่อนคำนวณฐานกำไร/ส่วนแบ่ง ห้ามหักค่าธรรมเนียมประมาณซ้ำกับค่าจริง: เจ้าของควรตั้ง processingBps เป็น 0 ถ้าใช้ค่าจริงแล้ว สูตรและอัตราของเดิมไม่ได้ถูกเปลี่ยนให้โดยอัตโนมัติ
- QR ใหม่เปิดได้เมื่อเหลือก่อนเริ่มอย่างน้อย 35 นาที Checkout กำหนดหมดอายุ 31 นาที สามารถเปิด QR เดิมและตรวจสถานะต่อได้ ก่อน Stripe ยืนยันว่า session หมดอายุ ระบบไม่ปล่อยเวลาโค้ชและไม่ให้จ่ายช่องทางอื่นหรือยกเลิก เพื่อกันจ่ายแล้วเสียที่นั่ง หากการสร้าง QR ขาดตอนต้องลองคำขอเดิมเพื่อรับ session เดิม อย่าสร้างรายการรับเงินอีกทาง
- หาก Stripe รับเงินหลังยกเลิก รับเงินช่องทางอื่น ปิดยอด หรือเวลาสอนชนกัน จะแสดง `requires_review` ในเมนูตรวจชำระเงิน ไม่เพิ่มรายรับปกติหรือคอม ต้องให้เจ้าของตรวจ PaymentIntent ใน Stripe จัดการคืนเงินจริงและบันทึกปรับบัญชีเอง รายการเหล่านี้เป็นเงินที่ต้องกระทบยอด ไม่มีบัญชีเงินพักอัตโนมัติ
- ยังไม่มีการคืนเงินอัตโนมัติ, webhook refund/dispute, split payout หรือ Stripe Connect การคืนเงินที่ทำใน Stripe ต้องบันทึกในสมุดบัญชีแอปด้วย การจ่ายส่วนแบ่งให้ผู้จัด/โค้ช/ผู้พัฒนา/การตลาดยังต้องทำและบันทึกเอง
- การตั้ง secrets ไม่ได้เปิด Stripe หรือเปิดรับจองให้เอง ต้องให้เจ้าของเลือกช่องทางและตรวจผลก่อนเปิดรับ หากสลับ test/live ขณะมี QR ค้าง ระบบจะไม่ยืนยันรายการคนละโหมด ให้เคลียร์ QR เดิมก่อนสลับ
- งานนี้ยังไม่ใช่หลักฐานว่า LINE บนมือถือของเพื่อน, Stripe account capability, QR จริง หรือ payout จริงผ่านแล้ว

อ้างอิง: [Stripe PromptPay](https://docs.stripe.com/payments/promptpay), [Stripe webhooks](https://docs.stripe.com/webhooks), [Stripe Checkout sessions](https://docs.stripe.com/api/checkout/sessions/create)
