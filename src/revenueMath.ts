import type { FinanceRow } from './financeTypes';
import type { PlatformAllocation, RevenueConfig, RevenueRule, RevenueUnit } from './revenueTypes';
export const defaultRevenueConfig: RevenueConfig = { version: 0, confirmed: false, game: { basis: 'margin', platformBps: 2500, processingBps: 0 }, coaching: { basis: 'margin', platformBps: 2500, processingBps: 0 }, updatedAt: null };
export function splitRevenue(gross: number, refunds: number, directCosts: number, rule: RevenueRule) {
  const sales = Math.max(0, gross - refunds);
  const processing = Math.round(gross * rule.processingBps / 10000);
  const rawMargin = sales - directCosts - processing;
  const distributable = Math.max(0, rawMargin);
  const calculatedPlatform = rule.platformFixedSatang ?? Math.round((rule.basis === 'gross' ? sales : distributable) * rule.platformBps / 10000);
  const platform = Math.min(distributable, calculatedPlatform);
  return { processing, distributable, deficit: Math.max(0, -rawMargin) + Math.max(0, refunds - gross), platform, partner: distributable - platform };
}
export function buildRevenueUnits(rows: FinanceRow[], config: RevenueConfig, fingerprintOf: (source: string) => string, fixedFees: Record<string, number> = {}): RevenueUnit[] {
  const groups = new Map<string, FinanceRow[]>();
  for (const row of rows.filter(r => r.type === 'income' && r.status === 'settled' && (r.source === 'game' || r.source === 'coaching'))) {
    const key = row.source === 'game' ? 'game:' + row.reference.split(':')[0] : 'coaching:' + row.reference;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups].map(([key, sales]) => {
    const kind = key.startsWith('game:') ? 'game' : 'coaching';
    const expenses = rows.filter(r => r.type === 'expense' && r.status !== 'void' && r.allocationKey === key);
    const sum = (items: FinanceRow[]) => items.reduce((s, r) => s + r.amount, 0);
    const payouts = expenses.filter(r => ['coach_payout', 'organizer'].includes(r.category));
    const direct = expenses.filter(r => !['coach_payout', 'organizer', 'refund'].includes(r.category));
    const gross = sum(sales), refunds = sum(expenses.filter(r => r.category === 'refund')), directCosts = sum(direct);
    const rule = fixedFees[key] === undefined ? config[kind] : { ...config[kind], platformFixedSatang: fixedFees[key] };
    const split = splitRevenue(gross, refunds, directCosts, rule);
    const paidPartner = sum(payouts.filter(r => r.status === 'settled')), pendingPartner = sum(payouts.filter(r => r.status === 'pending'));
    // Payout status changes don't alter the split, but linked cost/refund changes do.
    const fingerprint = fingerprintOf(JSON.stringify([...sales, ...expenses.filter(r => !payouts.includes(r))].map(r => [r.id, r.amount, r.type === 'expense' ? 'reserved' : r.status, r.category]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
    return { key, kind, title: sales[0].description, lastDate: sales.map(r => r.settledOn || r.date).sort().at(-1)!, gross, refunds, directCosts, ...split, rule, paidPartner, pendingPartner, remainingPartner: Math.max(0, split.partner - paidPartner - pendingPartner), overpaid: Math.max(0, paidPartner + pendingPartner - split.partner), sourceIds: sales.map(r => r.id), fingerprint, changed: false };
  });
}

export type PlatformDistribution = { developer: number; marketing: number; retained: number; unconfigured: number };
export function platformDistribution(platform: number, rule?: PlatformAllocation): PlatformDistribution {
  if (!rule?.confirmed) return { developer: 0, marketing: 0, retained: platform, unconfigured: platform };
  const developer = Math.floor(platform * rule.developerBps / 10000), marketing = Math.floor(platform * rule.marketingBps / 10000);
  return { developer, marketing, retained: platform - developer - marketing, unconfigured: 0 };
}
