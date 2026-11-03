# Chick&Pick — Automated Tests & Isolated UAT (11 ต.ค. 2569)

เอกสารนี้ใช้กับ repository `nuibhr/chick-pick` และการแก้ไขสลิปย้อนหลังใน PR #1 ระบบ **ยังไม่ Deploy การแก้ไขขึ้น Worker เดิม** การเปลี่ยนแปลง Source บน `main` ในชุดนี้จำกัดอยู่ที่เครื่องมือทดสอบและการเตรียม Preview/UAT

## 1) ระบบ CI อัตโนมัติ

GitHub Actions: [Chick&Pick CI](https://github.com/nuibhr/chick-pick/actions/workflows/ci.yml)

ทุกครั้งที่ Push ไปยัง `main`, `fix/**`, `feat/**`, `chore/**` หรือมี PR เข้าสู่ `main` ระบบจะ:

1. `npm ci` ตาม `package-lock.json` บน Node.js 22
2. `npm run lint` ตรวจ TypeScript ของระบบปัจจุบัน (ไม่รวม `server.ts` ซึ่งเป็น entry point รุ่นเก่าที่ต้องพึ่งไฟล์ mock ซึ่งไม่ได้อยู่ใน Git)
3. `npm test` รัน Cloudflare + Server + React/logic + UAT isolation guard regression tests
4. `npm run build:cloudflare` ตรวจ public assets และ build frontend
5. แสดง PASS/FAIL ผ่านหน้า Actions / Pull Request; ถ้าไม่ผ่าน ห้าม Deploy เวอร์ชันนั้น

ทุก Test ใช้ fixtures/mocks ไม่ใช้ TiDB จริง ไม่โอนเงิน ไม่ส่งสลิปให้ SlipOK จริง และไม่ Deploy อัตโนมัติ

## 2) มี Preview สองระดับ

| ประเภท | Cloudflare Worker | ฐานข้อมูล/การรับเงินจริง | เปิดด้วย |
| --- | --- | --- | --- |
| UI-only | `chick-pick-ui-sandbox` | ไม่เชื่อม DB, **ปิด API จอง/ชำระเงิน/แอดมินทั้งหมด** | `wrangler.uat-preview.jsonc` |
| Functional UAT | `chick-pick-uat-isolated` | **TiDB schema แยก + Cloudflare KV แยก + LINE channel แยก** | `scripts/prepareUatDeployment.mjs` |

ทั้งสองต้องกด Deploy ด้วยตัวเองใน [Chick&Pick Test Deploy](https://github.com/nuibhr/chick-pick/actions/workflows/deploy-test.yml) และ **ไม่มี workflow อัตโนมัติใด Deploy ขึ้น Worker เดิม** (`chick-pick-tidb-staging`)

> UI-only ดูหน้าเว็บ/ดีไซน์ได้ แต่เพราะ API ด้านธุรกรรมถูกปิด จึงไม่สามารถยืนยันขั้นตอนการจองจริงผ่าน UI-only ได้ ต้องใช้ Functional UAT พร้อมข้อมูลทดสอบที่แยกทั้งหมด

## 3) เปิด UI-only Preview ครั้งแรก (ง่ายที่สุด)

1. ไป GitHub → Repository → **Settings → Environments** → เพิ่ม Environment ชื่อ `chick-pick-uat`. แนะนำเปิด Required reviewers และ จำกัด deployment branches เป็น `main` กับ `fix/late-slip-evidence-20261010`.
2. เพิ่ม Secrets ภายใต้ Environment เดียวกัน:
   - `UAT_CLOUDFLARE_API_TOKEN` — Token Cloudflare ที่มีสิทธิ์แก้ไข Workers ของบัญชีที่เลือกเท่านั้น
   - `UAT_CLOUDFLARE_ACCOUNT_ID` — Account ID ของบัญชี Cloudflare
3. เปิด [Chick&Pick Test Deploy](https://github.com/nuibhr/chick-pick/actions/workflows/deploy-test.yml) → **Run workflow** → เลือก Branch `fix/late-slip-evidence-20261010` → `target = ui-only` → Run.
4. รอขั้นตอน `npm test` และ Build ผ่าน แล้วดู URL `workers.dev` ใน log ของขั้น Deploy. URL นี้เปิดบน iPhone ได้ และไม่เชื่อมฐานข้อมูลหรือบัญชีรับโอน

อย่าส่ง Token, Pairing Token หรือ Database URL มาใน Chat หรือ Commit ใส่ Git

## 4) เพิ่ม Functional UAT สำหรับการจองและทดสอบสลิปจริง

ก่อนกด `target = isolated-uat` ต้องสร้าง Resource **สำหรับทดสอบเท่านั้น**:

- **TiDB**: สร้างฐานข้อมูลแยก เช่น `chick_pick_uat` และ DB user ที่มีสิทธิ์เฉพาะ schema นี้ ห้ามใช้ database URL production ระบบจะตรวจชื่อฐานข้อมูลต้องมี segment `uat`. Workflow จะ Run migration เฉพาะ URL ของ UAT โดยอัตโนมัติ
- **Cloudflare KV**: สร้าง Namespace ใหม่สำหรับ Receipt ของ UAT แล้วคัดลอก Namespace ID (32 หลัก hex) คนละตัวกับ `wrangler.tidb.jsonc`; ระบบจะตรวจและปฏิเสธการใช้ KV ID ของ Worker เดิม
- **LINE Developers**: สร้าง LINE Login Channel และ LIFF App สำหรับ UAT แยกจากของจริง ตั้ง LIFF Endpoint เป็น `https://chick-pick-uat-isolated.<workers-subdomain>.workers.dev/miniapp` และอนุญาต LINE test accounts ตามเงื่อนไข channel
- **Cloudflare Worker URL**: ใช้ Worker ชื่อ `chick-pick-uat-isolated` เท่านั้น ไม่ใช้ชื่อ `chick-pick-tidb-staging` และห้าม map route/โดเมน production ไปยัง UAT
- **SlipOK**: เริ่ม UAT โดย **ไม่ใส่** `UAT_SLIPOK_API_KEY` และ `UAT_SLIPOK_BRANCH_ID` ได้ จะเป็นการแนบหลักฐานและตรวจแบบ manual. ถ้าต้องทดสอบ SlipOK จริง ให้กำหนดคู่ค่าเหล่านี้ใน UAT ด้วยความระมัดระวัง การเรียกตรวจสลิปอาจใช้โควตาจริง และควรใช้บัญชีรับโอนที่จัดไว้สำหรับทดสอบ

เพิ่มค่าต่อไปนี้ที่ GitHub Environment `chick-pick-uat`:

**Secrets (ห้ามใส่ในไฟล์ Git หรือส่งใน Chat)**

| ชื่อ | ความหมาย |
| --- | --- |
| `UAT_CLOUDFLARE_API_TOKEN` | Cloudflare API Token สำหรับ Deploy Worker ทดสอบ |
| `UAT_CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `UAT_TIDB_DATABASE_URL` | URL ฐานข้อมูล schema `*_uat` พร้อม DB user แยก |
| `UAT_ADMIN_SESSION_SECRET` | สตริงสุ่มใหม่อย่างน้อย 32 ตัวอักษร |
| `UAT_ADMIN_PAIRING_TOKEN` | รหัสผูกเจ้าของใหม่สำหรับ UAT อย่างน้อย 12 ตัวอักษร |
| `UAT_SLIPOK_API_KEY` (ไม่บังคับ) | API key สำหรับทดลอง SlipOK เท่านั้น |

**Variables**

| ชื่อ | ความหมาย |
| --- | --- |
| `UAT_KV_NAMESPACE_ID` | Namespace ID ของ KV ทดสอบเท่านั้น |
| `UAT_LINE_CHANNEL_ID` | Channel ID ของ LINE UAT |
| `UAT_LIFF_ID` | LIFF ID ของ UAT Channel |
| `UAT_PUBLIC_APP_URL` | `https://chick-pick-uat-isolated.<workers-subdomain>.workers.dev` |
| `UAT_SLIPOK_BRANCH_ID` (ไม่บังคับ) | Branch ID ของ SlipOK UAT ต้องมีคู่กับ API key |

จากนั้นเปิด Test Deploy → เลือก Branch ที่ต้องการ → เลือก `isolated-uat` → Run. Workflow จะ **ตรวจโค้ด → Test → Build → ตรวจแยก resource → Migrate UAT DB → Deploy Worker UAT → HTTP smoke test** โดยไม่แก้ Worker เดิม

ไฟล์ `.wrangler-uat.jsonc` และ `.wrangler-uat.secrets.json` เกิดเพียงชั่วคราวใน GitHub runner, ถูก ignore จาก Git และถูกลบท้าย workflow

## 5) ขั้นตอน Acceptance Test ก่อนพิจารณา Merge PR #1

1. สร้าง Open Play รอบทดลองใน UAT ให้เหลือที่นั่งสุดท้าย 1 ที่ ด้วย LINE A และ LINE B ซึ่งเป็น **test accounts คนละบัญชี**
2. A จองก่อนเวลา 5 นาที, จำลองว่าโอนในเวลาที่กำหนด, ให้เวลาล็อกหมด แล้ว B จองที่นั่งสุดท้าย ตรวจว่า B ได้ที่นั่ง แต่ A ยังส่ง **หลักฐานย้อนหลัง** ได้
3. ฝั่งแอดมินต้องเห็นสลิป A แม้ที่นั่งหมด แต่ห้ามอนุมัติคืนที่นั่ง A อัตโนมัติ; ต้องแจ้งว่าต้องตรวจสอบ/ประสานคืนเงิน
4. หลังคืนที่ว่างแบบทดสอบ ให้ฝ่ายการเงินอนุมัติ A ได้ก็ต่อเมื่อตรวจเวลาธุรกรรมจริงจาก SlipOK ว่าอยู่ในช่วงเดิม, ยอดตรง, ผู้รับตรง, รายการไม่ซ้ำ และยืนยันเงินเข้าจริง
5. สลิปที่โอนหลังเวลา, สลิปซ้ำ, ส่งเกิน 24 ชั่วโมง และสลิปที่อัปโหลดระหว่างมีคนแย่งที่นั่ง ต้องไม่ทำให้เกิด **overbooking** หรือบันทึกรายรับซ้ำ
6. ทดสอบหน้า iPhone ผ่าน LINE LIFF และแอดมิน รวมถึงประวัติการจอง, สถานะคืนเงิน, สิทธิ์แสดงหลักฐาน และการปิดยอดเมื่อมีเรื่องรอตรวจ

อย่าโอนเงินจริงใน UAT โดยไม่ตกลงกับผู้ดูแลบัญชีและฝ่ายการเงินล่วงหน้า; Unit Tests ไม่จำเป็นต้องใช้เงินจริง

## 6) ข้อจำกัด

- โค้ดและ Workflow อยู่ใน GitHub แล้ว **แต่การ Deploy จะเกิดขึ้นต่อเมื่อมี Cloudflare credentials และผู้มีสิทธิ์กด Run**; ไม่สามารถรับรองว่ามี URL ใหม่ใช้งานได้ก่อนรันสำเร็จ
- ค่าของ GitHub Environment Secrets และ Resource ของผู้ใช้ไม่สามารถอ่าน/สร้างจาก GitHub connector นี้ได้ จึงต้องตั้งผ่าน Cloudflare, TiDB, LINE Developers และ GitHub Settings ด้วยบัญชีเจ้าของ
- GitHub Actions ตรวจ fixture และ API แบบจำลองได้ แต่ **ไม่แทนการทดสอบ LINE mobile + SlipOK + ธนาคารจริง**
- PR #1 ยังต้องผ่านการตรวจสอบโค้ดและทดสอบทั้งหมดก่อน Merge; ห้ามเปลี่ยน endpoint production จนกว่าจะลงนามรับผล UAT
