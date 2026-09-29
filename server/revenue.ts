import { createHash } from 'node:crypto';
import type { FinanceRow } from '../src/financeTypes';
import type { RevenueConfig, RevenueRule, RevenueUnit } from '../src/revenueTypes';
export const defaultRevenueConfig: RevenueConfig = { version: 0, confirmed: false, game: { basis: 'margin', platformBps: 2500, processingBps: 0 }, coaching: { basis: 'margin', platformBps: 2500, processingBps: 0 }, updatedAt: null };
export function splitRevenue(gross: number, refunds: number, directCosts: number, rule: RevenueRule) {
  const sales = Math.max(0, gross - refunds);
  const processing = Math.round(gross * rule.processingBps / 10000);
  const rawMargin = sales - directCosts - processing;
  const distributable = Math.max(0, rawMargin);
  const calculatedPlatform = Math.round((rule.basis === 'gross' ? sales : distributable) * rule.platformBps / 10000);
  const platform = Math.min(distributable, calculatedPlatform);
  return { processing, distributable, deficit: Math.max(0, -rawMargin) + Math.max(0, refunds - gross), platform, partner: distributable - platform };
}
export function revenueUnits(rows: FinanceRow[], config: RevenueConfig): RevenueUnit[] {
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
    const rule = config[kind], split = splitRevenue(gross, refunds, directCosts, rule);
    const paidPartner = sum(payouts.filter(r => r.status === 'settled')), pendingPartner = sum(payouts.filter(r => r.status === 'pending'));
    // Payout status changes don't alter the split, but linked cost/refund changes do.
    const fingerprint = createHash('sha256').update(JSON.stringify([...sales, ...expenses.filter(r => !payouts.includes(r))].map(r => [r.id, r.amount, r.type === 'expense' ? 'reserved' : r.status, r.category]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest('hex');
    return { key, kind, title: sales[0].description, lastDate: sales.map(r => r.settledOn || r.date).sort().at(-1)!, gross, refunds, directCosts, ...split, rule, paidPartner, pendingPartner, remainingPartner: Math.max(0, split.partner - paidPartner - pendingPartner), overpaid: Math.max(0, paidPartner + pendingPartner - split.partner), sourceIds: sales.map(r => r.id), fingerprint, changed: false };
  });
}
