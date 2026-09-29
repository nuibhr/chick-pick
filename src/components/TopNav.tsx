import React from 'react';
import { ArenaLightingMode, EventSession } from '../types';
import { retroAudio } from '../audio/retroAudio';

interface TopNavProps {
  onToggleSimulator: () => void;
  isSimulatorOpen: boolean;
  onOpenCashier: () => void;
  onOpenAdmin: () => void;
  isAdminLoggedIn: boolean;
  adminName?: string;
  sfxEnabled: boolean;
  onToggleSfx: () => void;
  cameraPreset: 'isometric' | 'topdown' | 'action';
  onChangeCamera: (preset: 'isometric' | 'topdown' | 'action') => void;
  lightingMode: ArenaLightingMode;
  onChangeLighting: (mode: ArenaLightingMode) => void;
  currentSession?: EventSession;
  onRotateBatch: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onToggleSimulator,
  isSimulatorOpen,
  onOpenCashier,
  onOpenAdmin,
  isAdminLoggedIn,
  adminName,
  sfxEnabled,
  onToggleSfx,
  cameraPreset,
  onChangeCamera,
  lightingMode,
  onChangeLighting,
  currentSession,
  onRotateBatch
}) => {
  const headFeeRevenue = currentSession ? currentSession.registeredPlayers.length * currentSession.headFee : 2280;
  const netProfit = currentSession ? headFeeRevenue - currentSession.courtRentalCost : 1480;

  return (
    <header className="absolute top-0 left-0 right-0 z-30 px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
      {/* Brand / Logo & Business Model Value */}
      <div className="flex items-center gap-2.5 pointer-events-auto bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/10 shadow-lg">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#B8F23A] to-emerald-400 text-slate-950 flex items-center justify-center font-pixel text-xs shadow-inner">
          ⚡
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-pixel text-[10px] sm:text-[11px] text-[#B8F23A] tracking-wider">
              PICKLE-ARENA 2.5D
            </h1>
            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold border border-amber-500/30">
              จัดก๊วนคนมาเดี่ยว & คิดค่าหัวคิว
            </span>
          </div>
          <p className="text-[10px] text-white/60 hidden md:block">
            จัดรอบลงสนามเป็นชุด ไม่ต้องดูคอร์ตว่าง • รวมคนอยากมีเพื่อนเล่น
          </p>
        </div>
      </div>

      {/* Active Session Status Ribbon */}
      {currentSession && (
        <div className="hidden lg:flex items-center gap-3 pointer-events-auto bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-emerald-500/30 shadow-md text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-pixel text-[9px] text-emerald-300">รอบ {currentSession.timeSlot}:</span>
            <span className="text-white font-bold text-[11px]">12/12 คนเต็ม</span>
          </div>
          <span className="text-white/30">|</span>
          <div className="text-[11px] text-amber-300 font-mono">
            ค่าหัว ฿{currentSession.headFee} • กำไรสุทธิ <strong className="text-[#B8F23A]">+฿{netProfit.toLocaleString()}</strong>
          </div>
          <button
            onClick={() => {
              retroAudio.playLevelUp();
              onRotateBatch();
            }}
            className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
            title="สลับผู้เล่น 4 คนจากม้านั่งพักลงสนามทันที"
          >
            <span>🔄</span>
            <span>สลับชุด ({currentSession.currentMatchIndex}/6)</span>
          </button>
        </div>
      )}

      {/* Action Buttons Group */}
      <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        {/* Camera Views Selector */}
        <div className="hidden xl:flex items-center bg-slate-900/80 backdrop-blur-md p-1 rounded-xl border border-white/10 text-xs">
          <button
            onClick={() => {
              retroAudio.playSelect();
              onChangeCamera('isometric');
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
              cameraPreset === 'isometric'
                ? 'bg-[#B8F23A] text-slate-950 font-bold'
                : 'text-white/70 hover:text-white'
            }`}
          >
            ไอโซเมตริก
          </button>
          <button
            onClick={() => {
              retroAudio.playSelect();
              onChangeCamera('topdown');
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
              cameraPreset === 'topdown'
                ? 'bg-[#B8F23A] text-slate-950 font-bold'
                : 'text-white/70 hover:text-white'
            }`}
          >
            มุมสูง (Top-Down)
          </button>
          <button
            onClick={() => {
              retroAudio.playSelect();
              onChangeCamera('action');
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
              cameraPreset === 'action'
                ? 'bg-[#B8F23A] text-slate-950 font-bold'
                : 'text-white/70 hover:text-white'
            }`}
          >
            มุมสนาม
          </button>
        </div>

        {/* Lighting Mode Picker */}
        <div className="hidden 2xl:flex items-center bg-slate-900/80 backdrop-blur-md p-1 rounded-xl border border-white/10 text-xs">
          <button
            onClick={() => {
              retroAudio.playSelect();
              onChangeLighting('day');
            }}
            className={`px-2 py-1 rounded-lg text-xs transition ${
              lightingMode === 'day' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-white/60 hover:text-white'
            }`}
            title="กลางวัน แดดสดใส"
          >
            ☀️ กลางวัน
          </button>
          <button
            onClick={() => {
              retroAudio.playSelect();
              onChangeLighting('sunset');
            }}
            className={`px-2 py-1 rounded-lg text-xs transition ${
              lightingMode === 'sunset' ? 'bg-orange-500 text-white font-bold' : 'text-white/60 hover:text-white'
            }`}
            title="อาทิตย์อัสดง"
          >
            🌅 สนธยา
          </button>
          <button
            onClick={() => {
              retroAudio.playSelect();
              onChangeLighting('night_cyber');
            }}
            className={`px-2 py-1 rounded-lg text-xs transition ${
              lightingMode === 'night_cyber' ? 'bg-indigo-600 text-white font-bold' : 'text-white/60 hover:text-white'
            }`}
            title="ไซเบอร์พังค์ ไนท์"
          >
            🌙 ไซเบอร์
          </button>
        </div>

        {/* 8-Bit Retro Sound Toggle */}
        <button
          id="btn-toggle-sfx"
          onClick={onToggleSfx}
          className={`px-2.5 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1 border shadow-sm ${
            sfxEnabled
              ? 'bg-purple-500/20 text-purple-300 border-purple-400/40 hover:bg-purple-500/30'
              : 'bg-slate-800 text-white/40 border-white/10'
          }`}
          title="เปิด/ปิด เสียงเรโทร 8 บิต"
        >
          <span>{sfxEnabled ? '🔊' : '🔇'}</span>
          <span className="font-pixel text-[9px] hidden sm:inline">{sfxEnabled ? '8-BIT' : 'MUTE'}</span>
        </button>

        {/* Admin & Ledger Full-Stack Dashboard Button */}
        <button
          id="btn-open-admin-ledger"
          onClick={() => {
            retroAudio.playSelect();
            onOpenAdmin();
          }}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer border ${
            isAdminLoggedIn
              ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 border-amber-300 shadow-amber-500/20'
              : 'bg-slate-850 hover:bg-slate-800 text-amber-300 border-amber-400/40'
          }`}
          title="เข้าสู่ระบบแอดมิน: ดูยอดเงินเข้า-ออก บัญชีรายได้ ตรวจสลิป & ผูก Stripe"
        >
          <span>👑</span>
          <span className="hidden sm:inline">
            {isAdminLoggedIn ? `${adminName || 'แอดมิน'} (ดูบัญชีก๊วน)` : 'แอดมิน & ดูยอดรายได้'}
          </span>
          <span className="sm:hidden">แอดมิน</span>
        </button>

        {/* Host / Cashier Quick Access */}
        <button
          id="btn-open-cashier"
          onClick={() => {
            retroAudio.playSelect();
            onOpenCashier();
          }}
          className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white/80 border border-white/10 hover:border-white/20 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          <span>📋</span>
          <span className="hidden sm:inline">คอร์ตก๊วน (฿{headFeeRevenue})</span>
          <span className="sm:hidden">คอร์ต</span>
        </button>

        {/* Toggle Mobile Simulator (Solo Player App) */}
        <button
          id="btn-toggle-simulator"
          onClick={() => {
            retroAudio.playSelect();
            onToggleSimulator();
          }}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer ${
            isSimulatorOpen
              ? 'bg-rose-500 text-white hover:bg-rose-600'
              : 'bg-gradient-to-r from-[#B8F23A] to-emerald-400 text-slate-950 hover:brightness-105'
          }`}
        >
          <span>📱</span>
          <span id="btn-simulator-text" className="hidden sm:inline">
            {isSimulatorOpen ? 'ปิดแอปผู้เล่น' : '📱 หาเพื่อนเล่น (แอปคนมาเดี่ยว)'}
          </span>
          <span className="sm:hidden">แอปผู้เล่น</span>
        </button>
      </div>
    </header>
  );
};
