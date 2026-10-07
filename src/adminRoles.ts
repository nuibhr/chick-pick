export const staffRoles = ['operator', 'finance', 'viewer'] as const;
export type StaffRole = typeof staffRoles[number];
export type AdminRole = 'owner' | StaffRole;
export const roleLabels: Record<AdminRole, string> = { owner: 'เจ้าของ', operator: 'ผู้จัดก๊วน', finance: 'ฝ่ายการเงิน', viewer: 'ดูรายงานเท่านั้น' };
export const roleDescriptions: Record<StaffRole, string> = {
  operator: 'สร้างก๊วน ตรวจสลิป เลือกคนเข้าสนาม · ไม่เห็น Monitor และเปลี่ยนสูตรไม่ได้',
  finance: 'ตรวจสลิป ดูบัญชี บันทึกรายรับรายจ่ายและปิดยอด · เปลี่ยนสูตรหรือสิทธิ์ไม่ได้',
  viewer: 'ดูรายงานรายได้และส่วนแบ่ง · ไม่แก้บัญชี ไม่เห็นสลิปหรือบัญชีรับโอน',
};
export const isStaffRole = (value: unknown): value is StaffRole => staffRoles.includes(value as StaffRole);
// Keep legacy single-role records readable; a present but invalid roles array fails closed.
export function memberRoles(value: { role?: unknown; roles?: unknown }): StaffRole[] {
  const roles = value.roles === undefined ? [value.role] : value.roles;
  return Array.isArray(roles) && roles.length > 0 && roles.length <= staffRoles.length && roles.every(isStaffRole)
    ? staffRoles.filter(role => roles.includes(role)) : [];
}
export type RoleSelection = AdminRole | readonly AdminRole[];
export const permissions = (selection: RoleSelection) => {
  const roles = typeof selection === 'string' ? [selection] : selection;
  const has = (role: AdminRole) => roles.includes('owner') || roles.includes(role);
  return { operations: has('operator'), receipts: has('operator') || has('finance'), financeRead: has('finance') || has('viewer'), financeWrite: has('finance'), configure: roles.includes('owner') };
};
export const describeRoles = (selection: RoleSelection) => (typeof selection === 'string' ? [selection] : selection).map(role => roleLabels[role]).join(' + ');
