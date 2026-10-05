export const categories = {
  coaching: 'ค่าเรียนโค้ช', game: 'ค่าร่วมก๊วน', other_income: 'รายรับอื่น',
  venue: 'ค่าเช่าสนาม', coach_payout: 'จ่ายให้โค้ช', organizer: 'จ่ายผู้จัดก๊วน', equipment: 'อุปกรณ์', marketing: 'การตลาด', refund: 'คืนเงินลูกค้า', other_expense: 'รายจ่ายอื่น',
} as const;
export type FinanceCategory = keyof typeof categories;
export type FinanceRow = {
  id: string; type: 'income' | 'expense'; category: FinanceCategory; amount: number;
  description: string; counterparty: string; date: string; settledOn?: string;
  method: 'cash' | 'transfer' | 'card'; status: 'pending' | 'settled' | 'void';
  source: 'manual' | 'coaching' | 'game'; reference: string; createdAt: string;
  history: { at: string; action: string; reason?: string }[];
  allocationKey?: string;
};
export type FinanceReport = { pilot?: boolean; rows: FinanceRow[]; summary: { income: number; expense: number; net: number; pendingIncome: number; pendingExpense: number }; daily: { date: string; income: number; expense: number }[]; breakdown: { category: FinanceCategory; amount: number; type: 'income' | 'expense' }[] };
