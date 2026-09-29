import React from 'react';
import { Player } from '../types';
import { retroAudio } from '../audio/retroAudio';

interface TrainerCardModalProps {
  player: Player | null;
  onClose: () => void;
  onSelectAsUser: (player: Player) => void;
}

export const TrainerCardModal: React.FC<TrainerCardModalProps> = ({
  player,
  onClose,
  onSelectAsUser
}) => {
  if (!player) return null;

  const signatureMoves: Record<string, string> = {
    หนุ่ย: 'Phantom Kitchen Drop (หยอดมุมอับลวงตา)',
    พลอย: 'Lightning Fast Volley (สวนกลับหน้าเน็ต)',
    เอก: 'Thunder Carbon Drive (ไดรฟ์เรียดเน็ตความเร็วสูง)',
    บอย: 'Iron Shield Dink (หยอดนิ่งลดสปีดคู่แข่ง)',
    พี่ต้น: 'Master Spin Lob (โยนข้ามหัวแม่นยำระดับตำนาน)',
    นุช: 'Precision Crosscourt Dink (หยอดฉีกมุมคอร์ด)',
    แชมป์: 'Fireball ATP Around-The-Post (สอดลูกอ้อมเสาเน็ต)',
    กอล์ฟ: 'Counter Attack Punch (เคาน์เตอร์บล็อกปัดซอก)'
  };

  const currentMove = signatureMoves[player.name] || 'Power Smash & Control';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-sm bg-[#111827] rounded-3xl border-3 border-[#B8F23A] shadow-2xl p-5 text-white pokemon-window-dark">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
          <div className="flex items-center gap-1.5">
            <span className="font-pixel text-xs text-[#B8F23A]">POKÉMON TRAINER CARD</span>
          </div>
          <button
            onClick={() => {
              retroAudio.playSelect();
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs"
          >
            ✕
          </button>
        </div>

        {/* Trainer Portrait & Level */}
        <div className="flex items-center gap-3.5 mb-4 bg-black/40 p-3 rounded-2xl border border-white/10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 flex items-center justify-center text-3xl shadow-lg border-2 border-white/30">
            {player.avatarIcon}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-white">{player.name}</h3>
              <span className="font-pixel text-[9px] bg-[#B8F23A] text-slate-950 px-2 py-0.5 rounded font-bold">
                Lv.{player.level}
              </span>
            </div>
            <p className="text-xs text-emerald-300 font-mono">DUPR Rating: {player.dupr.toFixed(2)}</p>
            <p className="text-[10px] text-white/50">
              สังกัด: คอร์ต {player.courtId} • ฝ่าย {player.side}
            </p>
          </div>
        </div>

        {/* HP Bar */}
        <div className="space-y-1 mb-3 bg-black/30 p-2.5 rounded-xl border border-white/5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-white/60">HP ENERGY</span>
            <span className="text-emerald-400 font-bold">{player.hp} / {player.maxHp}</span>
          </div>
          <div className="hp-bar-bg w-full">
            <div className="hp-bar-fill" style={{ width: `${(player.hp / player.maxHp) * 100}%` }}></div>
          </div>
        </div>

        {/* Signature Move */}
        <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-400/30 mb-3">
          <span className="font-pixel text-[8px] text-amber-300 block mb-0.5">SIGNATURE MOVE</span>
          <span className="text-xs font-bold text-white block">⚡ {currentMove}</span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-4">
          <div className="bg-slate-900/80 p-2 rounded-xl border border-white/10 flex justify-between items-center">
            <span className="text-white/60">Dink/Soft</span>
            <span className="font-mono text-emerald-300 font-bold">{player.stats.dink}%</span>
          </div>
          <div className="bg-slate-900/80 p-2 rounded-xl border border-white/10 flex justify-between items-center">
            <span className="text-white/60">Smash/Drive</span>
            <span className="font-mono text-rose-300 font-bold">{player.stats.smash}%</span>
          </div>
          <div className="bg-slate-900/80 p-2 rounded-xl border border-white/10 flex justify-between items-center">
            <span className="text-white/60">Serve</span>
            <span className="font-mono text-yellow-300 font-bold">{player.stats.serve}%</span>
          </div>
          <div className="bg-slate-900/80 p-2 rounded-xl border border-white/10 flex justify-between items-center">
            <span className="text-white/60">Stamina</span>
            <span className="font-mono text-blue-300 font-bold">{player.stats.stamina}%</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => {
            retroAudio.playLevelUp();
            onSelectAsUser(player);
            onClose();
          }}
          className="w-full py-2.5 bg-[#B8F23A] text-slate-950 font-bold text-xs rounded-xl hover:brightness-110 transition flex items-center justify-center gap-1.5 shadow-md"
        >
          <span>📱</span>
          <span>สลับเป็นผู้เล่นหลักในโทรศัพท์</span>
        </button>
      </div>
    </div>
  );
};
