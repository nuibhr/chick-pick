export type ClubFeatures = { championship: boolean; rewards: boolean };
export const featureKey = 'chicken-features-v1';
export function parseFeatures(value: unknown): ClubFeatures {
  const flags = value as Partial<ClubFeatures> | null;
  return { championship: flags?.championship === true, rewards: flags?.rewards === true };
}
export function requireFeature(flags: ClubFeatures, action: 'contribute' | 'award' | 'redeem') {
  if (!flags.rewards) throw Error('ปิดระบบแต้มอยู่ ยอดและประวัติเดิมยังเก็บไว้');
  if (action === 'award' && !flags.championship) throw Error('เปิดโหมดแชมป์ก่อนมอบแต้มรางวัล');
}
