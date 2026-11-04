import { fail } from './pilotDomain';
import { digest } from './pilotAuth';

export const notificationReadKey = async (subject: string) => 'notification-read:' + await digest(subject);
export function markNotificationsRead(saved: { readAt?: string }, value: Record<string, unknown>, now = Date.now()) {
  const stamp = typeof value.readThrough === 'string' ? Date.parse(value.readThrough) : NaN;
  if (!Number.isFinite(stamp) || stamp > now || stamp < 0) fail(400, 'เวลาอ่านแจ้งเตือนไม่ถูกต้อง');
  if (stamp > (Date.parse(saved.readAt || '') || 0)) saved.readAt = new Date(stamp).toISOString();
  return { readAt: saved.readAt || new Date(0).toISOString() };
}
