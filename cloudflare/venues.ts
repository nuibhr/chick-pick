import type { Venue } from '../src/venueTypes';
import { fail } from './pilotDomain';
export function saveVenue(rows: Venue[], v: Record<string, unknown>, id?: string) {
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 120 || typeof v.area !== 'string' || !v.area.trim() || v.area.length > 120 || typeof v.address !== 'string' || v.address.length > 300 || typeof v.active !== 'boolean') fail(400, 'ระบุชื่อสนาม พื้นที่ ที่อยู่ และสถานะให้ครบ');
  const existing = id ? rows.find(r => r.id === id) : null;
  if (id && !existing) fail(404, 'ไม่พบสนาม');
  if (rows.some(r => r.id !== id && r.name.toLowerCase() === String(v.name).trim().toLowerCase())) fail(409, 'มีชื่อสนามนี้แล้ว');
  if (!existing && rows.length >= 200) fail(409, 'จำนวนสนามมากเกินกำหนด');
  const row: Venue = { id: existing?.id || crypto.randomUUID(), name: v.name as string, area: v.area as string, address: v.address as string, active: v.active as boolean };
  row.name = row.name.trim(); row.area = row.area.trim(); row.address = row.address.trim();
  if (existing) Object.assign(existing, row); else rows.push(row); return row;
}
