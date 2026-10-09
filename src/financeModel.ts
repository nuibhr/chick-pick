import { categories, type FinanceRow, type FinanceReport } from './financeTypes';
import type { Enrollment } from './coachingTypes';
import { lessonHoldExpired } from './coachingTypes';
import type { MarketplaceData } from './marketplaceTypes';
import { bookingHoldExpired } from './marketplaceTypes';
export const thaiDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const validDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export function summarize(rows: FinanceRow[]): FinanceReport {
  const sum = (type: string, status: string) => rows.filter(r => r.type === type && r.status === status).reduce((a, r) => a + r.amount, 0);
  const income = sum('income', 'settled'), expense = sum('expense', 'settled');
  const daily = new Map<string, { date: string; income: number; expense: number }>();
  const breakdown = new Map<string, FinanceReport['breakdown'][number]>();
  for (const row of rows.filter(r => r.status === 'settled')) {
    const date = row.settledOn || row.date;
    const point = daily.get(date) || { date, income: 0, expense: 0 }; point[row.type] += row.amount; daily.set(date, point);
    const group = breakdown.get(row.category) || { category: row.category, amount: 0, type: row.type }; group.amount += row.amount; breakdown.set(row.category, group);
  }
  return { rows, summary: { income, expense, net: income - expense, pendingIncome: sum('income', 'pending'), pendingExpense: sum('expense', 'pending') }, daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)), breakdown: [...breakdown.values()].sort((a, b) => b.amount - a.amount) };
}


export function financeRows(manual: FinanceRow[], enrollments: Enrollment[], marketplace: MarketplaceData): FinanceRow[] {
  const coaching: FinanceRow[] = enrollments.map(e => ({ id: 'coach_' + e.id, type: 'income', category: 'coaching', amount: e.refund?.receivedAmount ?? Math.round(e.amount * 100), description: e.title, counterparty: e.student, date: thaiDate(new Date(e.createdAt)), settledOn: e.refund?.receivedAt || e.paidAt ? thaiDate(new Date(e.refund?.receivedAt || e.paidAt!)) : undefined, method: e.paymentMethod === 'cash' ? 'cash' : 'transfer', status: e.stripe?.mode === 'test' ? 'void' : e.payment === 'paid' || e.refund?.receivedAt ? 'settled' : e.cancelledAt || lessonHoldExpired(e) ? 'void' : 'pending', source: 'coaching', reference: e.id, createdAt: e.createdAt, history: [{ at: e.createdAt, action: 'สมัครเรียน' }, ...(e.paidAt ? [{ at: e.paidAt, action: 'ยืนยันรับเงิน' }] : [])] }));
  const games: FinanceRow[] = marketplace.bookings.filter(b => !manual.some(r => r.source === 'game' && r.reference === `${b.sessionId}:${b.playerId}`)).map(b => ({ id: 'booking_' + b.id, type: 'income', category: 'game', amount: b.refund?.receivedAmount ?? b.amount, description: b.title, counterparty: b.playerName, date: thaiDate(new Date(b.createdAt)), settledOn: b.refund?.receivedAt || b.paidAt ? thaiDate(new Date(b.refund?.receivedAt || b.paidAt!)) : undefined, method: b.paymentMethod || 'transfer', status: b.stripe?.mode === 'test' ? 'void' : b.paidAt || b.refund?.receivedAt ? 'settled' : b.cancelledAt || bookingHoldExpired(b) ? 'void' : 'pending', source: 'game', reference: `${b.sessionId}:${b.playerId}`, createdAt: b.createdAt, history: [{ at: b.createdAt, action: 'บันทึกการจอง · รอตรวจเงิน' }, ...(b.paidAt ? [{ at: b.paidAt, action: 'ผู้จัดยืนยันรับเงิน' }] : []), ...(b.cancelledAt ? [{ at: b.cancelledAt, action: 'ยกเลิกการจอง · เก็บประวัติรับเงิน' }] : [])] }));
  // Refunds are derived from their booking, so retries cannot create a second expense.
  const refunds: FinanceRow[] = [...marketplace.bookings, ...enrollments].flatMap(row => {
    const refund = row.refund;
    if (!refund?.receivedAmount || !refund.receivedAt || !['pending', 'completed'].includes(refund.status)) return [];
    const game = 'sessionId' in row;
    return [{ id: 'refund_' + (game ? 'game_' : 'coaching_') + row.id, type: 'expense', category: 'refund', amount: refund.receivedAmount, description: 'คืนเงิน · ' + row.title, counterparty: game ? row.playerName : row.student, date: thaiDate(new Date(refund.receivedAt)), settledOn: refund.completedAt ? thaiDate(new Date(refund.completedAt)) : undefined, method: 'transfer', status: refund.status === 'completed' ? 'settled' : 'pending', source: game ? 'game' : 'coaching', allocationKey: game ? 'game:' + row.sessionId : 'coaching:' + row.id, reference: refund.refundReference || row.id, createdAt: refund.requestedAt, history: [{ at: refund.requestedAt, action: 'ยกเลิกและติดตามคืนเงิน', reason: refund.reason }, { at: refund.receivedAt, action: 'ตรวจเงินเข้าจริงแล้ว' }, ...(refund.completedAt ? [{ at: refund.completedAt, action: 'แอดมินบันทึกโอนคืนแล้ว' }] : [])] } satisfies FinanceRow];
  });
  return [...manual, ...coaching, ...games, ...refunds];
}
