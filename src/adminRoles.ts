export const staffRoles = ['operator', 'finance', 'viewer'] as const;
export type StaffRole = typeof staffRoles[number];
export type AdminRole = 'owner' | StaffRole;
export const roleLabels: Record<AdminRole, string> = { owner: 'เจ้าของ', operator: 'ผู้จัดก๊วน', finance: 'ฝ่ายการเงิน', viewer: 'ดูรายงานเท่านั้น' };
export const roleDescriptions: Record<StaffRole, string> = {
  operator: 'สร้างก๊วน ตรวจสลิป เลือกคนเข้าสนาม · ไม่เห็น Monitor และเปลี่ยนสูตรไม่ได้',
  finance: 'ตรวจสลิป ดูบัญชี บันทึกรายรับรายจ่ายและปิดยอด · เปลี่ยนสูตรหรือสิทธิ์ไม่ได้',
  viewer: 'ดูรายงานรายได้และส่วนแบ่ง · ไม่แก้บัญชี ไม่เห็นสลิปหรือบัญชีรับโอน',
};
export const permissions = (role: AdminRole) => ({
  operations: role === 'owner' || role === 'operator',
  receipts: role === 'owner' || role === 'operator' || role === 'finance',
  financeRead: role === 'owner' || role === 'finance' || role === 'viewer',
  financeWrite: role === 'owner' || role === 'finance',
  configure: role === 'owner',
});
export const isStaffRole = (value: unknown): value is StaffRole => staffRoles.includes(value as StaffRole);
