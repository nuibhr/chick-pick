import React, { useState, useEffect } from 'react';
import { TransactionRecord, PaymentSlip, AdminUser, EventSession, SquadPlayer, DuprMatchBatch } from '../types';
import { retroAudio } from '../audio/retroAudio';

interface AdminLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminUser: AdminUser | null;
  onLogout: () => void;
  currentSessions: EventSession[];
  onDeploySquadToCourts?: (balancedBatch: DuprMatchBatch) => void;
}

export const AdminLedgerModal: React.FC<AdminLedgerModalProps> = ({
  isOpen,
  onClose,
  adminUser,
  onLogout,
  currentSessions,
  onDeploySquadToCourts
}) => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'slips' | 'dupr_squad' | 'gateway'>('ledger');
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [slips, setSlips] = useState<PaymentSlip[]>([]);
  const [summary, setSummary] = useState({
    totalInflow: 4080,
    totalOutflow: 1160,
    netProfit: 2920,
    profitMargin: 72,
    pendingSlipsCount: 1
  });

  // Filter states
  const [txFilter, setTxFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add Expense form modal state
  const [isAddingExpense, setIsAddingExpense] = useState<boolean>(false);
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<'court_rental' | 'equipment' | 'refreshment' | 'other'>('court_rental');
  const [expenseDescription, setExpenseDescription] = useState<string>('');
  const [expenseMethod, setExpenseMethod] = useState<'transfer' | 'cash' | 'promptpay'>('transfer');

  // DUPR Auto-Balancer state
  const [isBalancing, setIsBalancing] = useState<boolean>(false);
  const [balancedResult, setBalancedResult] = useState<DuprMatchBatch | null>(null);

  // Stripe status state
  const [stripeConfig, setStripeConfig] = useState<{ isConfigured: boolean; currency: string }>({
    isConfigured: false,
    currency: 'thb'
  });

  // Fetch data on open
  useEffect(() => {
    if (isOpen) {
      fetchLedger();
      fetchSlips();
      fetchStripeConfig();
    }
  }, [isOpen]);

  const fetchLedger = async () => {
    try {
      const res = await fetch('/api/ledger');
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions);
        setSummary(data.summary);
      }
    } catch (e) {
      console.error('Failed to fetch ledger:', e);
    }
  };

  const fetchSlips = async () => {
    try {
      const res = await fetch('/api/slips');
      const data = await res.json();
      if (data.success) {
        setSlips(data.slips);
      }
    } catch (e) {
      console.error('Failed to fetch slips:', e);
    }
  };

  const fetchStripeConfig = async () => {
    try {
      const res = await fetch('/api/stripe/config');
      const data = await res.json();
      setStripeConfig(data);
    } catch (e) {
      console.error('Failed to fetch stripe config:', e);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseAmount || Number(expenseAmount) <= 0 || !expenseDescription) return;

    try {
      const res = await fetch('/api/ledger/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'expense',
          category: expenseCategory,
          amount: Number(expenseAmount),
          description: expenseDescription,
          paymentMethod: expenseMethod,
          sessionId: currentSessions[0]?.id,
          sessionTitle: currentSessions[0]?.title
        })
      });

      const data = await res.json();
      if (data.success) {
        retroAudio.playLevelUp();
        setIsAddingExpense(false);
        setExpenseAmount('');
        setExpenseDescription('');
        fetchLedger();
      }
    } catch (err) {
      console.error('Error adding expense:', err);
    }
  };

  const handleVerifySlip = async (slipId: string, status: 'verified' | 'rejected') => {
    retroAudio.playSelect();
    try {
      const res = await fetch('/api/slips/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slipId, status })
      });
      const data = await res.json();
      if (data.success) {
        retroAudio.playLevelUp();
        fetchSlips();
        fetchLedger();
      }
    } catch (err) {
      console.error('Error verifying slip:', err);
    }
  };

  const handleRunDuprBalancing = async () => {
    const activeSession = currentSessions[0];
    if (!activeSession || activeSession.registeredPlayers.length < 8) {
      alert('ต้องการผู้เล่นอย่างน้อย 8 คนในการคำนวณจับคู่ DUPR');
      return;
    }

    setIsBalancing(true);
    retroAudio.playSelect();

    try {
      const res = await fetch('/api/squad/auto-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: activeSession.registeredPlayers })
      });
      const data = await res.json();
      if (data.success) {
        retroAudio.playLevelUp();
        setBalancedResult(data.balancedBatch);
      }
    } catch (err) {
      console.error('DUPR balancing error:', err);
    } finally {
      setIsBalancing(false);
    }
  };

  const handleExportCsv = () => {
    retroAudio.playSelect();
    const headers = ['ID', 'Date', 'Type', 'Category', 'Amount (THB)', 'Payment Method', 'Description', 'Status'];
    const rows = transactions.map((t) => [
      t.id,
      t.timestamp,
      t.type,
      t.category,
      t.amount,
      t.paymentMethod,
      `"${t.description.replace(/"/g, '""')}"`,
      t.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Pickleball_Cashflow_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  const filteredTransactions = transactions.filter((t) => {
    if (txFilter !== 'all' && t.type !== txFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.description.toLowerCase().includes(q) ||
        (t.playerName && t.playerName.toLowerCase().includes(q)) ||
        (t.slipRef && t.slipRef.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-5xl h-[92vh] bg-slate-900 border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white relative">
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 border-b border-white/10 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 to-yellow-500 text-slate-950 flex items-center justify-center font-pixel text-lg shadow-md">
              👑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-white">ระบบแอดมิน & การเงินก๊วนพิเคิลบอล</h2>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-400/30">
                  Full-Stack Organizer Mode
                </span>
              </div>
              <p className="text-xs text-white/60">
                ผู้จัด: {adminUser?.name || 'แอดมินคุณหนุ่ย'} • ติดตามเงินเข้า-เงินออก ตรวจสลิป & ผูก Stripe
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Net Profit Live Pill */}
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5">
              <span>📈 กำไรสุทธิ:</span>
              <span className="text-[#B8F23A] text-sm">+฿{summary.netProfit.toLocaleString()}</span>
              <span className="text-[10px] text-white/50">({summary.profitMargin}%)</span>
            </div>

            <button
              onClick={() => {
                retroAudio.playSelect();
                onLogout();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white/70 hover:text-rose-300 border border-white/10 text-xs transition"
              title="ออกจากระบบแอดมิน"
            >
              ออกจากระบบ
            </button>

            <button
              onClick={() => {
                retroAudio.playSelect();
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white/70 hover:text-white flex items-center justify-center text-sm transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-2 border-b border-white/10 bg-slate-950/40 flex items-center gap-2 overflow-x-auto text-xs">
          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('ledger');
            }}
            className={`px-4 py-2.5 font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'ledger'
                ? 'border-[#B8F23A] text-[#B8F23A]'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <span>💰</span>
            <span>บันทึกเงินเข้า-ออก (Cashflow & P&L)</span>
          </button>

          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('slips');
            }}
            className={`px-4 py-2.5 font-bold border-b-2 transition flex items-center gap-1.5 relative ${
              activeTab === 'slips'
                ? 'border-[#B8F23A] text-[#B8F23A]'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <span>🧾</span>
            <span>ศูนย์ตรวจสลิปโอนเงิน (Slip Inbox)</span>
            {summary.pendingSlipsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold animate-pulse">
                {summary.pendingSlipsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('dupr_squad');
            }}
            className={`px-4 py-2.5 font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'dupr_squad'
                ? 'border-[#B8F23A] text-[#B8F23A]'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <span>⚡</span>
            <span>จัดก๊วนขั้นเทพ (DUPR Auto-Balancer)</span>
          </button>

          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('gateway');
            }}
            className={`px-4 py-2.5 font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'gateway'
                ? 'border-[#B8F23A] text-[#B8F23A]'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <span>💳</span>
            <span>ผูกบัญชี Stripe & PromptPay</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/60">
          {/* ============================================================ */}
          {/* TAB 1: LEDGER & P&L (เงินเข้า-เงินออก) */}
          {/* ============================================================ */}
          {activeTab === 'ledger' && (
            <div className="space-y-5">
              {/* Financial KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/30">
                  <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <span>📥</span> ยอดเงินเข้า (Total Inflow)
                  </div>
                  <div className="text-2xl font-bold font-mono text-[#B8F23A] mt-1">
                    ฿{summary.totalInflow.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-white/50 mt-0.5">ค่าหัวคิวผู้เล่น 12-16 คน</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-rose-500/30">
                  <div className="text-xs text-rose-400 font-semibold flex items-center gap-1">
                    <span>📤</span> ยอดเงินออก (Total Outflow)
                  </div>
                  <div className="text-2xl font-bold font-mono text-rose-300 mt-1">
                    ฿{summary.totalOutflow.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-white/50 mt-0.5">ค่าเช่าคอร์ต, ลูกบอล, น้ำดื่ม</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-amber-500/30">
                  <div className="text-xs text-amber-300 font-semibold flex items-center gap-1">
                    <span>💎</span> กำไรสุทธิของโฮสต์
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
                    +฿{summary.netProfit.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-white/50 mt-0.5">อัตรากำไร (Margin) {summary.profitMargin}%</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-sky-500/30">
                  <div className="text-xs text-sky-400 font-semibold flex items-center gap-1">
                    <span>⚡</span> ธุรกรรมทั้งหมด
                  </div>
                  <div className="text-2xl font-bold font-mono text-white mt-1">
                    {transactions.length} รายการ
                  </div>
                  <div className="text-[11px] text-sky-300/70 mt-0.5">PromptPay, Stripe, Cash</div>
                </div>
              </div>

              {/* Action Bar & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      retroAudio.playSelect();
                      setIsAddingExpense(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold text-xs hover:brightness-105 active:scale-98 transition flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <span>➕</span>
                    <span>บันทึกรายจ่าย (ค่าสนาม / ลูกบอล)</span>
                  </button>

                  <button
                    onClick={handleExportCsv}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-white/80 hover:text-white text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <span>📥</span>
                    <span>ส่งออกรายงาน CSV</span>
                  </button>
                </div>

                {/* Filter and Search */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-white/10 text-xs">
                    {(['all', 'income', 'expense'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => {
                          retroAudio.playSelect();
                          setTxFilter(filter);
                        }}
                        className={`px-3 py-1 rounded-lg text-[11px] font-medium transition capitalize ${
                          txFilter === filter
                            ? 'bg-[#B8F23A] text-slate-950 font-bold'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {filter === 'all' ? 'ทั้งหมด' : filter === 'income' ? 'เงินเข้า (+)' : 'เงินออก (-)'}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาชื่อ / รายการ..."
                    className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs text-white focus:outline-none focus:border-[#B8F23A] w-36 sm:w-48"
                  />
                </div>
              </div>

              {/* Transactions Table */}
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/90 text-white/60 font-semibold border-b border-white/10">
                      <tr>
                        <th className="py-3 px-4">วัน-เวลา</th>
                        <th className="py-3 px-4">ประเภท</th>
                        <th className="py-3 px-4">รายการ / ผู้เล่น</th>
                        <th className="py-3 px-4">ช่องทาง</th>
                        <th className="py-3 px-4 text-right">จำนวนเงิน</th>
                        <th className="py-3 px-4">เลขอ้างอิง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredTransactions.map((tx) => {
                        const isIncome = tx.type === 'income';
                        return (
                          <tr key={tx.id} className="hover:bg-white/5 transition">
                            <td className="py-3 px-4 text-white/60 font-mono text-[11px]">{tx.timestamp}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isIncome
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                }`}
                              >
                                {isIncome ? 'เงินเข้า (Income)' : 'เงินออก (Expense)'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-white">{tx.description}</div>
                              {tx.sessionTitle && (
                                <div className="text-[10px] text-white/40">{tx.sessionTitle}</div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-white/80 capitalize">
                              <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-[10px] font-mono">
                                {tx.paymentMethod === 'promptpay'
                                  ? 'PromptPay QR'
                                  : tx.paymentMethod === 'stripe'
                                  ? 'Stripe Gateway'
                                  : tx.paymentMethod === 'cash'
                                  ? 'เงินสด'
                                  : 'โอนเงิน'}
                              </span>
                            </td>
                            <td className={`py-3 px-4 text-right font-mono font-bold ${isIncome ? 'text-[#B8F23A]' : 'text-rose-400'}`}>
                              {isIncome ? `+฿${tx.amount.toLocaleString()}` : `-฿${tx.amount.toLocaleString()}`}
                            </td>
                            <td className="py-3 px-4 text-white/40 font-mono text-[10px] truncate max-w-[120px]">
                              {tx.slipRef || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: SLIP VERIFICATION INBOX */}
          {/* ============================================================ */}
          {activeTab === 'slips' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <span>🧾 คลังสลิปโอนเงิน (PromptPay & Bank Slip Audit)</span>
                  </h3>
                  <p className="text-xs text-white/60">
                    ตรวจยอดเงินที่ผู้เล่นโอนเข้ามา หากยอดตรงกับค่าหัวคิว ระบบจะตรวจสอบและอนุมัติอัตโนมัติ
                  </p>
                </div>
                <button
                  onClick={fetchSlips}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white/80 transition"
                >
                  🔄 รีเฟรชสลิป
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {slips.map((slip) => (
                  <div
                    key={slip.id}
                    className={`p-4 rounded-2xl border transition relative bg-slate-950/80 ${
                      slip.status === 'verified'
                        ? 'border-emerald-500/30'
                        : slip.status === 'pending'
                        ? 'border-amber-500/50 shadow-lg shadow-amber-500/10'
                        : 'border-rose-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="font-bold text-sm text-white flex items-center gap-1.5">
                          <span>👤</span>
                          <span>{slip.playerName}</span>
                        </div>
                        <div className="text-[11px] text-white/60">{slip.sessionTitle}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          slip.status === 'verified'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : slip.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {slip.status === 'verified'
                          ? '✅ อนุมัติแล้ว'
                          : slip.status === 'pending'
                          ? '⏳ รอยืนยัน'
                          : '❌ ปฏิเสธ'}
                      </span>
                    </div>

                    {/* Slip Details Box */}
                    <div className="my-2.5 p-2.5 rounded-xl bg-slate-900 border border-white/5 space-y-1 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/50">ยอดเงินโอน:</span>
                        <span className="font-bold text-[#B8F23A] text-sm">฿{slip.amount}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/50">ธนาคาร:</span>
                        <span className="text-white/80">{slip.bank}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/50">เวลาโอน:</span>
                        <span className="text-white/80">{slip.transferTime}</span>
                      </div>
                      {slip.verificationNotes && (
                        <div className="text-[10px] text-amber-300/80 pt-1 border-t border-white/5">
                          {slip.verificationNotes}
                        </div>
                      )}
                    </div>

                    {/* Actions if pending */}
                    {slip.status === 'pending' && (
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-white/10">
                        <button
                          onClick={() => handleVerifySlip(slip.id, 'verified')}
                          className="py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition active:scale-95 cursor-pointer"
                        >
                          ✅ อนุมัติยอด
                        </button>
                        <button
                          onClick={() => handleVerifySlip(slip.id, 'rejected')}
                          className="py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition active:scale-95 cursor-pointer"
                        >
                          ❌ ปฏิเสธ
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: PRO SQUAD ORGANIZER & DUPR AUTO-BALANCER */}
          {/* ============================================================ */}
          {activeTab === 'dupr_squad' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border border-indigo-500/30">
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <span>⚡ อัลกอริทึมจัดก๊วนขั้นเทพ (DUPR Match Auto-Balancer)</span>
                  </h3>
                  <p className="text-xs text-white/70 mt-1 max-w-xl">
                    คำนวณเกลี่ยระดับฝีมือ (DUPR 2.0 - 4.5) อัจฉริยะ ให้คะแนนเฉลี่ยระหว่างคู่ในคอร์ต 1 และคอร์ต 2 สมดุลที่สุด ดวลสูสีไม่มีทีมแบก
                  </p>
                </div>

                <button
                  onClick={handleRunDuprBalancing}
                  disabled={isBalancing}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#B8F23A] to-emerald-400 text-slate-950 font-bold text-xs hover:brightness-105 active:scale-98 transition shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  {isBalancing ? (
                    <span>กำลังคำนวณคู่...</span>
                  ) : (
                    <>
                      <span>🤖</span>
                      <span>คำนวณจัดคู่สมดุล DUPR</span>
                    </>
                  )}
                </button>
              </div>

              {balancedResult ? (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300">
                      ผลการจัดคู่สมดุล: รอบที่ {balancedResult.roundNumber} (ความต่างฝีมือระหว่างทีมต่ำมาก)
                    </span>
                    {onDeploySquadToCourts && (
                      <button
                        onClick={() => {
                          retroAudio.playLevelUp();
                          onDeploySquadToCourts(balancedResult);
                          alert('ส่งคู่ที่จัดสมดุลลงสู่สนาม 3D เรียบร้อยแล้ว!');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <span>🚀</span>
                        <span>นำคู่นี้ขึ้นสนาม 3D ทันที</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Court 1 Balanced Pair */}
                    <div className="p-4 rounded-2xl bg-slate-950/90 border border-sky-500/30">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-sky-400 text-xs uppercase tracking-wider">
                          คอร์ต 1 (Court 1 Balanced Doubles)
                        </h4>
                        <span className="text-[11px] font-mono text-white/50">
                          ΔDUPR = {balancedResult.court1.deltaDupr} (สมดุลสูง)
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-white">
                              {balancedResult.court1.teamA.map((p) => p.name).join(' + ')}
                            </span>
                            <div className="text-[10px] text-white/50">Team A</div>
                          </div>
                          <span className="font-mono font-bold text-[#B8F23A]">
                            avg DUPR {balancedResult.court1.avgDuprA}
                          </span>
                        </div>

                        <div className="text-center font-pixel text-[10px] text-amber-400">VS</div>

                        <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-white">
                              {balancedResult.court1.teamB.map((p) => p.name).join(' + ')}
                            </span>
                            <div className="text-[10px] text-white/50">Team B</div>
                          </div>
                          <span className="font-mono font-bold text-[#B8F23A]">
                            avg DUPR {balancedResult.court1.avgDuprB}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Court 2 Balanced Pair */}
                    <div className="p-4 rounded-2xl bg-slate-950/90 border border-indigo-500/30">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-indigo-400 text-xs uppercase tracking-wider">
                          คอร์ต 2 (Court 2 Balanced Doubles)
                        </h4>
                        <span className="text-[11px] font-mono text-white/50">
                          ΔDUPR = {balancedResult.court2.deltaDupr} (สมดุลสูง)
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-white">
                              {balancedResult.court2.teamA.map((p) => p.name).join(' + ')}
                            </span>
                            <div className="text-[10px] text-white/50">Team A</div>
                          </div>
                          <span className="font-mono font-bold text-[#B8F23A]">
                            avg DUPR {balancedResult.court2.avgDuprA}
                          </span>
                        </div>

                        <div className="text-center font-pixel text-[10px] text-amber-400">VS</div>

                        <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-white">
                              {balancedResult.court2.teamB.map((p) => p.name).join(' + ')}
                            </span>
                            <div className="text-[10px] text-white/50">Team B</div>
                          </div>
                          <span className="font-mono font-bold text-[#B8F23A]">
                            avg DUPR {balancedResult.court2.avgDuprB}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resting Bench Squad */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10">
                    <span className="text-xs font-bold text-white/70">
                      🥤 พักดื่มน้ำที่ม้านั่งพัก (เตรียมผลัดลงเซ็ตถัดไป):
                    </span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {balancedResult.bench.map((p) => (
                        <span
                          key={p.id}
                          className="px-2.5 py-1 rounded-xl bg-slate-800 text-xs text-white/80 border border-white/10"
                        >
                          {p.avatarIcon} {p.name} (DUPR {p.dupr})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl border border-dashed border-white/15 text-center text-white/50 text-xs">
                  คลิกปุ่ม &quot;คำนวณจัดคู่สมดุล DUPR&quot; ด้านบนเพื่อให้อัลกอริทึมประมวลผลจับคู่
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 4: STRIPE & PROMPTPAY GATEWAY SETTINGS */}
          {/* ============================================================ */}
          {activeTab === 'gateway' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span>💳 ช่องทางการรับชำระเงินค่าหัวคิว (Stripe & PromptPay)</span>
                </h3>
                <p className="text-xs text-white/60">
                  ระบบรองรับทั้งการตัดบัตรเครดิต/เดบิต/Apple Pay ผ่าน Stripe และการสแกนจ่าย PromptPay พร้อมแนบสลิป
                </p>
              </div>

              {/* Stripe Connection Box */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-indigo-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">⚡</span>
                    <div>
                      <h4 className="font-bold text-sm text-white">Stripe Payment Gateway</h4>
                      <p className="text-xs text-white/60">รับชำระค่าหัวคิวผ่านบัตร Visa / Mastercard / Apple Pay</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      stripeConfig.isConfigured
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    }`}
                  >
                    {stripeConfig.isConfigured ? '🟢 เชื่อมต่อแล้ว (Live/Key Set)' : '🟣 โหมดจำลองพร้อมใช้งาน (Sandbox)'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-white/5 text-xs space-y-1.5 text-white/70">
                  <div className="flex justify-between">
                    <span>สกุลเงินที่เรียกเก็บ:</span>
                    <strong className="text-[#B8F23A]">THB (บาทไทย)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Webhook Listener:</span>
                    <span className="font-mono text-[11px] text-white/50">/api/stripe/create-payment</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ค่าธรรมเนียมต่อรายการ:</span>
                    <span>3.65% + ฿10 (ผู้เล่นชำระเงินโฮสต์ได้รับยอดทันที)</span>
                  </div>
                </div>
              </div>

              {/* PromptPay Config Box */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-sky-500/30 space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">📱</span>
                  <div>
                    <h4 className="font-bold text-sm text-white">PromptPay QR & บัญชีธนาคารของโฮสต์</h4>
                    <p className="text-xs text-white/60">สำหรับแสดง QR ให้ผู้เล่นสแกนจ่ายและแนบสลิปมาตรวจ</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-white/5 text-xs space-y-2 text-white/80">
                  <div className="flex justify-between">
                    <span className="text-white/50">ชื่อบัญชีผู้จัดก๊วน:</span>
                    <strong className="text-white">ชมรมพิเคิลบอลขอนแก่น (Khon Kaen Pickleball Club)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">หมายเลข PromptPay:</span>
                    <strong className="font-mono text-[#B8F23A]">089-888-8888 (พร้อมเพย์)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">ธนาคาร:</span>
                    <span>กสิกรไทย (KBANK) เลขที่ 123-4-56789-0</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Add Expense Form */}
        {isAddingExpense && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <form
              onSubmit={handleAddExpense}
              className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-3xl p-6 shadow-2xl text-white space-y-4 animate-fade-in"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <span>➕ บันทึกรายจ่ายก๊วน (Cash Outflow)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddingExpense(false)}
                  className="text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">หมวดหมู่รายจ่าย</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-xs"
                >
                  <option value="court_rental">🏟️ ค่าเช่าสนาม / คอร์ตยิม</option>
                  <option value="equipment">🎾 ค่าลูกพิเคิลบอล / อุปกรณ์</option>
                  <option value="refreshment">🥤 ค่าน้ำดื่ม / เครื่องดื่มเกลือแร่</option>
                  <option value="other">📦 ค่าใช้จ่ายเบ็ดเตล็ด</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">จำนวนเงิน (บาท)</label>
                <input
                  type="number"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="เช่น 800"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-rose-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">รายละเอียด</label>
                <input
                  type="text"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="เช่น ค่าเช่า 2 คอร์ต 18:00-20:00 จ่ายยิม"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-xs focus:outline-none focus:border-rose-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">ช่องทางการจ่าย</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {(['transfer', 'cash', 'promptpay'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setExpenseMethod(m)}
                      className={`py-1.5 rounded-xl border text-center font-medium transition ${
                        expenseMethod === m
                          ? 'bg-rose-500/30 border-rose-400 text-rose-200 font-bold'
                          : 'bg-slate-800 border-white/10 text-white/60'
                      }`}
                    >
                      {m === 'transfer' ? 'โอนเงิน' : m === 'cash' ? 'เงินสด' : 'PromptPay'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingExpense(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white/70 text-xs font-bold hover:bg-slate-700 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition shadow-md"
                >
                  บันทึกเงินออก
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
