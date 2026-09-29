import React, { useState, useRef, useEffect } from 'react';
import { Player, CourtMatch, EventSession, SquadPlayer } from '../types';
import { retroAudio } from '../audio/retroAudio';
import { drawQrCode } from '../utils/qrGenerator';

interface CashierModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: Record<number, CourtMatch>;
  players: Player[];
  sessions: EventSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onRotateBatch: () => void;
  onAddSoloPlayer: (newPlayer: SquadPlayer, courtTarget?: number) => void;
  onTogglePlayerPayment: (sessionId: string, playerId: string) => void;
}

export const CashierModal: React.FC<CashierModalProps> = ({
  isOpen,
  onClose,
  matches,
  players,
  sessions,
  activeSessionId,
  onSelectSession,
  onRotateBatch,
  onAddSoloPlayer,
  onTogglePlayerPayment
}) => {
  const currentSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  // Walk-in Solo Player form
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerDupr, setNewPlayerDupr] = useState('3.50');
  const [newPlayStyle, setNewPlayStyle] = useState('All-Rounder ครบเครื่อง');
  const [newPlayerBio, setNewPlayerBio] = useState('มาคนเดียวครับ พร้อมลุยทุกเซ็ต');

  // Head fee billing state
  const [headFeeAmount, setHeadFeeAmount] = useState(currentSession ? currentSession.headFee.toString() : '190');
  const [billNote, setBillNote] = useState(`ค่าหัวคิวก๊วนเดี่ยวรอบ ${currentSession?.timeSlot || '18:00 - 20:00'}`);
  const qrRef = useRef<HTMLCanvasElement>(null);

  // Tab inside modal
  const [activeTab, setActiveTab] = useState<'sessions' | 'roster' | 'walkin'>('sessions');

  useEffect(() => {
    if (currentSession) {
      setHeadFeeAmount(currentSession.headFee.toString());
      setBillNote(`ค่าหัวคิวก๊วนเดี่ยวรอบ ${currentSession.timeSlot}`);
    }
  }, [currentSession]);

  useEffect(() => {
    if (isOpen && qrRef.current) {
      drawQrCode(qrRef.current, `PROMPTPAY_HEADFEE_${headFeeAmount}_${billNote}`, 130);
    }
  }, [isOpen, headFeeAmount, billNote, activeTab]);

  if (!isOpen || !currentSession) return null;

  // Calculate financials for active session
  const totalRegistered = currentSession.registeredPlayers.length;
  const totalRevenue = totalRegistered * currentSession.headFee;
  const courtRental = currentSession.courtRentalCost;
  const netProfit = totalRevenue - courtRental;

  // Grand total financials across all sessions today
  const grandTotalRevenue = sessions.reduce((sum, s) => sum + (s.registeredPlayers.length * s.headFee), 0);
  const grandTotalRental = sessions.reduce((sum, s) => sum + s.courtRentalCost, 0);
  const grandNetProfit = grandTotalRevenue - grandTotalRental;

  const handleRegisterSolo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    const newSolo: SquadPlayer = {
      id: `solo_${Date.now()}`,
      name: newPlayerName.trim(),
      dupr: parseFloat(newPlayerDupr) || 3.5,
      avatarIcon: ['🧢', '⚡', '👧', '👑', '🔥', '⭐', '🎯'][Math.floor(Math.random() * 7)],
      playStyle: newPlayStyle,
      bio: newPlayerBio,
      paidStatus: 'paid',
      joinedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      isSolo: true,
      isBench: true
    };

    onAddSoloPlayer(newSolo);
    setNewPlayerName('');
    retroAudio.playLevelUp();
    alert(`รับผู้เล่น ${newSolo.name} เข้าก๊วนรอบ ${currentSession.timeSlot} เรียบร้อยแล้ว! ได้รับค่าหัวคิว ฿${currentSession.headFee}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-[#0b1320] rounded-3xl border-2 border-amber-400/40 shadow-2xl p-4 md:p-6 text-slate-100 max-h-[92vh] overflow-y-auto pokemon-window-dark">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center text-xl font-bold shadow-lg">
              💼
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-pixel text-xs text-amber-300 tracking-wider">EVENT ORGANIZER & HEAD-FEE CASHIER</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Business Model: จัดตี้คนเดี่ยว เก็บค่าหัวคิว
                </span>
              </div>
              <p className="text-xs text-white/60">
                ไม่ต้องเช็คสนามว่าง! รวมคนที่อยากมีเพื่อนเล่น จัดลงสนามเป็นชุดตลอด 2 ชั่วโมง หักค่าเช่าสนาม = กำไรสุทธิของโฮสต์
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              retroAudio.playSelect();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm font-bold text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Business KPI Dashboard (Financials) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="p-3 bg-black/40 rounded-2xl border border-white/10">
            <span className="text-[10px] text-white/50 block">รายรับค่าหัวคิว (วันนี้)</span>
            <span className="text-base sm:text-lg font-pixel text-[#B8F23A]">฿{grandTotalRevenue.toLocaleString()}</span>
            <span className="text-[10px] text-emerald-400 block mt-0.5">รวม {sessions.reduce((acc, s) => acc + s.registeredPlayers.length, 0)} คนมาเดี่ยว</span>
          </div>

          <div className="p-3 bg-black/40 rounded-2xl border border-white/10">
            <span className="text-[10px] text-white/50 block">ต้นทุนค่าเช่าสนาม (เหมา 2 คอร์ต)</span>
            <span className="text-base sm:text-lg font-pixel text-rose-400">-฿{grandTotalRental.toLocaleString()}</span>
            <span className="text-[10px] text-rose-300/80 block mt-0.5">จ่ายเหมาสนามของยิม</span>
          </div>

          <div className="p-3 bg-gradient-to-br from-amber-500/20 to-emerald-500/10 rounded-2xl border border-amber-400/40">
            <span className="text-[10px] text-amber-300 font-bold block">กำไรสุทธิผู้จัด (Net Profit)</span>
            <span className="text-base sm:text-lg font-pixel text-amber-300">+฿{grandNetProfit.toLocaleString()}</span>
            <span className="text-[10px] text-emerald-300 block mt-0.5">Margin กำไร {(grandNetProfit / Math.max(1, grandTotalRevenue) * 100).toFixed(0)}%</span>
          </div>

          <div className="p-3 bg-black/40 rounded-2xl border border-white/10 flex flex-col justify-between">
            <span className="text-[10px] text-white/50 block">รอบปัจจุบัน ({currentSession.timeSlot})</span>
            <div className="flex items-center justify-between">
              <span className="text-base font-pixel text-sky-400">{currentSession.registeredPlayers.length}/{currentSession.targetPlayers} คน</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${currentSession.status === 'in_progress' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                {currentSession.status === 'in_progress' ? 'กำลังตีชุด 2' : 'เปิดรับ'}
              </span>
            </div>
            <span className="text-[10px] text-white/50 block">ค่าหัว ฿{currentSession.headFee}/คน</span>
          </div>
        </div>

        {/* 1-Click Fast Action Bar: Batch Rotation */}
        <div className="mb-5 p-3.5 bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-slate-900 rounded-2xl border border-blue-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl animate-bounce">⚡</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-pixel text-[10px] text-sky-300">AUTO-DISPATCH SQUAD BATCH</h3>
                <span className="text-[10px] bg-sky-500/20 text-sky-200 px-2 py-0.2 rounded border border-sky-400/30">
                  รอบ {currentSession.timeSlot} • ชุดที่ {currentSession.currentMatchIndex}/{currentSession.totalMatchesInSession}
                </span>
              </div>
              <p className="text-xs text-white/70">
                ระบบจัด 12 คนลง 2 คอร์ต (4 คนต่อคอร์ต) และอีก 4 คนพักดื่มน้ำ เมื่อจบแมตช์กดสลับชุดทันที ทุกคนได้เล่นครบ 2 ชม.!
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              retroAudio.playLevelUp();
              onRotateBatch();
            }}
            className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <span>🔄</span>
            <span>สลับชุดผู้เล่นลงสนาม (Rotate Batch)</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 mb-4 text-xs font-bold gap-2">
          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('sessions');
            }}
            className={`pb-2 px-3 transition border-b-2 ${
              activeTab === 'sessions'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            📅 ตารางรอบก๊วน & กำไรรายรอบ ({sessions.length})
          </button>
          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('roster');
            }}
            className={`pb-2 px-3 transition border-b-2 ${
              activeTab === 'roster'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            👥 รายชื่อคนมาเดี่ยวในรอบนี้ ({currentSession.registeredPlayers.length} คน)
          </button>
          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('walkin');
            }}
            className={`pb-2 px-3 transition border-b-2 ${
              activeTab === 'walkin'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            ➕ รับคนมาเดี่ยวหน้างาน & เก็บค่าหัวคิว (฿{currentSession.headFee})
          </button>
        </div>

        {/* TAB 1: SESSIONS & REVENUE PER SESSION */}
        {activeTab === 'sessions' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {sessions.map((sess) => {
                const isSelected = sess.id === activeSessionId;
                const sessRevenue = sess.registeredPlayers.length * sess.headFee;
                const sessProfit = sessRevenue - sess.courtRentalCost;
                const isFull = sess.registeredPlayers.length >= sess.targetPlayers;

                return (
                  <div
                    key={sess.id}
                    onClick={() => {
                      retroAudio.playSelect();
                      onSelectSession(sess.id);
                    }}
                    className={`p-4 rounded-2xl border transition cursor-pointer relative ${
                      isSelected
                        ? 'bg-amber-400/10 border-amber-400 shadow-lg'
                        : 'bg-black/30 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-pixel text-[10px] text-amber-300">{sess.timeSlot}</span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                          isFull
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {isFull ? '🔥 ตี้เต็ม 12/12' : `รับเพิ่ม ${sess.targetPlayers - sess.registeredPlayers.length} คน`}
                      </span>
                    </div>

                    <h4 className="font-bold text-xs text-white line-clamp-1 mb-1">{sess.title}</h4>
                    <p className="text-[11px] text-white/60 line-clamp-2 mb-3">{sess.tagline}</p>

                    <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-1 text-[10px]">
                      <div>
                        <span className="text-white/50 block">ค่าหัวคิว:</span>
                        <span className="font-bold text-white">฿{sess.headFee} / คน</span>
                      </div>
                      <div>
                        <span className="text-white/50 block">กำไรสุทธิรอบนี้:</span>
                        <span className="font-bold text-[#B8F23A]">+฿{sessProfit.toLocaleString()}</span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-3 py-1 bg-amber-400 text-slate-950 font-bold text-[10px] rounded-lg text-center">
                        ✓ รอบที่เลือกจัดการอยู่
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-slate-900/60 rounded-2xl border border-white/10 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white">ต้องการเปิดรอบก๊วนเพิ่มในวันถัดไป?</h4>
                <p className="text-[11px] text-white/60">สร้างรอบชั่วโมงใหม่ กำหนดค่าหัวคิว และแชร์ลิงก์ให้คนมาเดี่ยวจองลงตี้ได้ทันที</p>
              </div>
              <button
                onClick={() => {
                  retroAudio.playLevelUp();
                  alert('เปิดฟอร์มสร้างรอบก๊วนใหม่: โฮสต์สามารถกำหนดเวลา 2 ชม. และตั้งราคาค่าหัวคิว 160-250 บาท!');
                }}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition"
              >
                + เปิดรอบก๊วนใหม่
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: ROSTER & SQUAD MANAGEMENT */}
        {activeTab === 'roster' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-white/70 px-1">
              <span>ผู้เล่นที่ลงทะเบียนรอบ {currentSession.timeSlot} ({currentSession.registeredPlayers.length} คน)</span>
              <span className="text-emerald-400">ชำระค่าหัวคิวครบ {currentSession.registeredPlayers.filter(p => p.paidStatus === 'paid').length} / {currentSession.registeredPlayers.length} คน</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
              {currentSession.registeredPlayers.map((player) => {
                const isPaid = player.paidStatus === 'paid';
                return (
                  <div
                    key={player.id}
                    className="p-3 bg-black/40 rounded-xl border border-white/10 flex items-start justify-between gap-2 hover:border-white/20 transition"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-lg">
                        {player.avatarIcon}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-white">{player.name}</span>
                          <span className="text-[9px] bg-amber-400/20 text-amber-300 px-1.5 py-0.2 rounded font-mono font-bold">
                            {player.dupr.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/50 block">{player.playStyle}</span>
                        <p className="text-[10px] text-white/70 italic mt-0.5 line-clamp-1">"{player.bio}"</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={() => {
                          retroAudio.playSelect();
                          onTogglePlayerPayment(currentSession.id, player.id);
                        }}
                        className={`text-[9px] px-2 py-0.5 rounded font-bold transition ${
                          isPaid
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {isPaid ? '✓ จ่ายแล้ว ฿' + currentSession.headFee : 'รอเก็บเงิน'}
                      </button>
                      <span className="text-[9px] text-white/40 font-mono">
                        {player.isBench ? 'พักรอบนี้' : `คอร์ต ${player.assignedCourt || 1}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: WALK-IN REGISTRATION & QR HEAD FEE BILL */}
        {activeTab === 'walkin' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Form */}
            <div className="p-4 bg-slate-900/90 rounded-2xl border border-white/10 space-y-3">
              <h3 className="font-bold text-xs text-white flex items-center gap-1.5">
                <span>➕</span>
                <span>ลงทะเบียนคนมาเดี่ยวหน้างาน (Walk-in Solo)</span>
              </h3>

              <form onSubmit={handleRegisterSolo} className="space-y-2.5 text-xs">
                <div>
                  <label className="text-[11px] text-white/70 block mb-1">ชื่อผู้เล่น (หรือชื่อเล่น)</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น โอ๊ต (มาเดี่ยว), แป้ง..."
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-black/50 border border-white/15 rounded-xl text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-white/70 block mb-1">คะแนน DUPR ประเมิน</label>
                    <input
                      type="number"
                      step="0.05"
                      value={newPlayerDupr}
                      onChange={(e) => setNewPlayerDupr(e.target.value)}
                      className="w-full px-3 py-1.5 bg-black/50 border border-white/15 rounded-xl text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-white/70 block mb-1">สไตล์การเล่น</label>
                    <select
                      value={newPlayStyle}
                      onChange={(e) => setNewPlayStyle(e.target.value)}
                      className="w-full px-2 py-1.5 bg-black/50 border border-white/15 rounded-xl text-white focus:outline-none focus:border-amber-400 text-xs"
                    >
                      <option value="Dinker เน้นหยอด">Dinker เน้นหยอด</option>
                      <option value="Banger สายสแมช">Banger สายสแมช</option>
                      <option value="All-Rounder ครบเครื่อง">All-Rounder ครบเครื่อง</option>
                      <option value="Beginner มือใหม่อยากลอง">Beginner มือใหม่อยากลอง</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-white/70 block mb-1">ข้อความแนะนำตัวสั้นๆ</label>
                  <input
                    type="text"
                    value={newPlayerBio}
                    onChange={(e) => setNewPlayerBio(e.target.value)}
                    className="w-full px-3 py-1.5 bg-black/50 border border-white/15 rounded-xl text-white focus:outline-none focus:border-amber-400 text-xs"
                  />
                </div>

                <div className="p-2.5 bg-amber-400/10 rounded-xl border border-amber-400/20 text-[11px] text-amber-200">
                  ⚡ <strong>ค่าหัวคิวรอบนี้: ฿{currentSession.headFee}</strong> (ได้สิทธิ์เล่นตลอดรอบ 2 ชั่วโมงเต็ม พร้อมสลับหมุนคู่)
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 font-bold rounded-xl hover:brightness-110 transition flex items-center justify-center gap-1.5 shadow-md mt-1 cursor-pointer"
                >
                  <span>✅</span>
                  <span>บันทึก & เพิ่มเข้าก๊วนรอบ {currentSession.timeSlot}</span>
                </button>
              </form>
            </div>

            {/* Instant PromptPay Head-Fee QR */}
            <div className="p-4 bg-slate-900/90 rounded-2xl border border-white/10 flex flex-col justify-between items-center text-center">
              <div>
                <h3 className="font-bold text-xs text-white mb-1">💳 สแกนจ่ายค่าหัวคิว (PromptPay QR)</h3>
                <p className="text-[11px] text-white/60">ให้ผู้เล่นสแกนจ่ายหน้าเคาน์เตอร์ได้ทันที ยอดเข้าบัญชีโฮสต์</p>
              </div>

              <div className="bg-white p-3 rounded-2xl shadow-lg my-2">
                <canvas ref={qrRef} className="rounded" />
                <p className="font-pixel text-[10px] text-slate-900 mt-1 font-bold">
                  THAI QR PAYMENT • ฿{headFeeAmount}
                </p>
                <span className="text-[9px] text-slate-600 block">{billNote}</span>
              </div>

              <div className="w-full text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 py-1.5 px-3 rounded-xl">
                ✓ ชำระค่าหัวคิวแล้ว • ได้สิทธิ์ลงตี้ 2 ชั่วโมงเต็ม
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
