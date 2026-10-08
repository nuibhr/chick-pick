import type { StripePayment } from './paymentTypes';

const labels: Record<StripePayment['status'], string> = {
  creating: 'กำลังสร้าง QR · ห้ามรับเงินซ้ำ', pending: 'รอชำระหรือรอ Stripe ยืนยัน',
  expired: 'Stripe ยืนยันว่า QR หมดอายุแล้ว', paid: 'Stripe ยืนยันเงินจริงแล้ว',
  test_paid: 'ทดสอบผ่าน · ไม่มีรายรับเงินจริง', requires_review: 'รับเงินแล้ว · ต้องตรวจและจัดการคืนเงิน',
};
export default function StripePaymentReview({ rows }: { rows: { id: string; name: string; title: string; stripe?: StripePayment }[] }) {
  const payments = rows.filter(row => row.stripe).sort((a, b) => Number(b.stripe!.status === 'requires_review') - Number(a.stripe!.status === 'requires_review'));
  if (!payments.length) return null;
  const needsAction = payments.some(row => ['creating','pending','requires_review'].includes(row.stripe!.status));
  const content = <><h2>ประวัติการชำระ Stripe เดิม {payments.length} รายการ</h2><p>ยืนยันเงินจาก Stripe แยกจากการเลือกคนเข้าสนาม รายการทดสอบไม่นับรายได้</p>{payments.map(row => <article key={row.id} className="wp-player"><div><strong>{row.name} · {row.title}</strong><p>{labels[row.stripe!.status]} · ฿{(row.stripe!.amount / 100).toFixed(2)}</p><small>โหมด{row.stripe!.mode === 'live' ? 'เงินจริง' : 'ทดสอบ'} · เลขจอง {row.id}</small>{row.stripe!.paymentIntentId && <small>อ้างอิง Stripe: {row.stripe!.paymentIntentId}</small>}{row.stripe!.fee !== undefined && <small>ค่าธรรมเนียมจริง ฿{(row.stripe!.fee / 100).toFixed(2)}</small>}{row.stripe!.issue && <p className="wp-alert" role="alert">{row.stripe!.issue} เมื่อคืนเงินจริงแล้ว ให้บันทึกรายการคืนเงินในบัญชีด้วย</p>}</div></article>)}</>;
  return needsAction ? <section className="wp-section">{content}</section> : <details className="wp-section"><summary>ประวัติ Stripe เดิม {payments.length} รายการ · เปิดดูเพื่อกระทบยอด</summary>{content}</details>;
}
