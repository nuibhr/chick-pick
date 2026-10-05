import { createHash } from 'node:crypto';
import type { FinanceRow } from '../src/financeTypes';
import type { RevenueConfig } from '../src/revenueTypes';
import { buildRevenueUnits } from '../src/revenueMath';
export { defaultRevenueConfig, splitRevenue } from '../src/revenueMath';
export function revenueUnits(rows: FinanceRow[], config: RevenueConfig) { return buildRevenueUnits(rows, config, source => createHash('sha256').update(source).digest('hex')); }
