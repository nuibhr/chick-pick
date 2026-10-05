import type { PublicSession } from './marketplaceTypes';

export type PlayStyle = 'casual' | 'high';
export const playStyles: { id: PlayStyle; label: string; description: string; image: string }[] = [
  { id: 'casual', label: 'เบา–กลาง', description: 'ระดับเริ่มต้นต่ำกว่า 3.5', image: '/categories/play-casual.jpg' },
  { id: 'high', label: 'สูง', description: 'ระดับเริ่มต้น 3.5 ขึ้นไป', image: '/categories/play-high.jpg' },
];

// Keep existing session records searchable without rewriting historical data.
export function sessionPlayStyle(session: Pick<PublicSession, 'title' | 'dupr' | 'vibe' | 'tags'>): PlayStyle {
  if (/^\s*</.test(session.dupr)) return 'casual';
  const numeric = session.dupr.match(/\d+(?:\.\d+)?/);
  if (numeric) return Number(numeric[0]) >= 3.5 ? 'high' : 'casual';
  const description = [session.title, session.vibe, ...session.tags].join(' ').toLowerCase();
  return session.dupr.trim() === 'สูง' || session.vibe.trim() === 'สูง' || session.tags.includes('สูง') || /เข้ม|แข่งขัน|จริงจัง|ระดับสูง|competitive|advanced/.test(description) ? 'high' : 'casual';
}
