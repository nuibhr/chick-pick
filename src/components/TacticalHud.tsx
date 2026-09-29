import React, { useState } from 'react';
import { CourtMatch } from '../types';
import { retroAudio } from '../audio/retroAudio';
import confetti from 'canvas-confetti';

interface TacticalHudProps {
  match: CourtMatch;
  onUpdateScore: (courtId: number, team: 'A' | 'B', delta: number) => void;
  onNextRound: (courtId: number) => void;
  onSwitchServingSide: (courtId: number) => void;
  onResetMatch: (courtId: number) => void;
  onAnalyzeTactics: (courtId: number) => void;
  onRotateBatch?: () => void;
  isAiAnalyzing?: boolean;
}

export const TacticalHud: React.FC<TacticalHudProps> = ({
  match,
  onUpdateScore,
  onNextRound,
  onSwitchServingSide,
  onResetMatch,
  onAnalyzeTactics,
  onRotateBatch,
  isAiAnalyzing = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const teamAPercent = Math.min(100, Math.max(10, (match.teamAPlayers[0]?.hp ?? 100)));
  const teamBPercent = Math.min(100, Math.max(10, (match.teamBPlayers[0]?.hp ?? 82)));

  const handleScoreTeamA = () => {
    retroAudio.playScorePoint();
    if (match.scoreA + 1 >= 11 && match.scoreA + 1 - match.scoreB >= 2) {
      retroAudio.playLevelUp();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8, x: 0.8 }
      });
    }
    onUpdateScore(match.courtId, 'A', 1);
  };

  const handleScoreTeamB = () => {
    retroAudio.playScorePoint();
    if (match.scoreB + 1 >= 11 && match.scoreB + 1 - match.scoreA >= 2) {
      retroAudio.playLevelUp();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8, x: 0.8 }
      });
    }
    onUpdateScore(match.courtId, 'B', 1);
  };

  return (
    <div
      id="spatial-match-hud"
      className="absolute bottom-6 right-4 md:right-8 z-20 transition-all duration-300 select-none"
    >
      <div className="glass-panel p-4 rounded-3xl w-80 md:w-88 shadow-2xl pokemon-window-dark">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm animate-pulse">⚡</span>
            <div>
              <h3 className="font-pixel text-[9px] text-[#B8F23A] tracking-wider uppercase">
                {match.sessionTitle ? 'EVENT BATCH MATCH' : 'POKÉ-BATTLE ARENA'}
              </h3>
              <p className="text-[10px] text-white/60 truncate max-w-[170px]">
                {match.sessionTitle || 'ก๊วนรอบ 18:00 - 20:00 (ชุดคนมาเดี่ยว)'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              id="match-hud-round"
              className="font-pixel text-[9px] text-[#FF8A3D] bg-orange-500/20 px-2 py-0.5 rounded border border-orange-400/30"
            >
              RND {match.currentRound}/{match.totalRounds}
            </span>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-xs text-white/60 hover:text-white px-1"
              title="ย่อ/ขยาย"
            >
              {isCollapsed ? '🔼' : '🔽'}
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <>
            {/* Scoreboard Bar */}
            <div className="bg-black/40 rounded-xl p-2.5 mb-3 border border-white/10 flex items-center justify-between">
              <div className="text-center">
                <span className="text-[10px] text-white/50 block font-mono">SIDE A</span>
                <span className="font-pixel text-2xl text-[#B8F23A]">{match.scoreA}</span>
              </div>

              <div className="text-center">
                <span className="font-pixel text-[8px] text-white/40 block">SERVER</span>
                <span className="font-pixel text-[11px] text-yellow-400">
                  {match.servingSide}#{match.serverNumber}
                </span>
                <span className="text-[9px] text-emerald-400 block font-medium mt-0.5">
                  {match.scoreA >= 10 || match.scoreB >= 10 ? 'MATCH POINT!' : 'GAME ON'}
                </span>
              </div>

              <div className="text-center">
                <span className="text-[10px] text-white/50 block font-mono">SIDE B</span>
                <span className="font-pixel text-2xl text-orange-400">{match.scoreB}</span>
              </div>
            </div>

            {/* Quick Score Action Buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={handleScoreTeamA}
                className="py-1.5 px-2 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 rounded-lg text-[11px] font-bold text-emerald-200 transition flex items-center justify-center gap-1"
              >
                <span>+1 Pt</span>
                <span className="truncate">{match.teamAName.split('+')[0]}</span>
              </button>

              <button
                onClick={handleScoreTeamB}
                className="py-1.5 px-2 bg-orange-600/30 hover:bg-orange-600/50 border border-orange-500/40 rounded-lg text-[11px] font-bold text-orange-200 transition flex items-center justify-center gap-1"
              >
                <span>+1 Pt</span>
                <span className="truncate">{match.teamBName.split('+')[0]}</span>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {/* Team A Pokémon Style Card */}
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 hover:border-[#B8F23A]/40 transition">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🔴</span>
                    <span className="text-white font-bold" id="team-a-names">
                      {match.teamAName}
                    </span>
                  </div>
                  <span className="font-pixel text-[8px] text-[#B8F23A]">
                    Lv.{match.teamAPlayers[0]?.level ?? 25}
                  </span>
                </div>
                <div className="hp-bar-bg w-full">
                  <div className="hp-bar-fill" style={{ width: `${teamAPercent}%` }}></div>
                </div>
                <div className="flex justify-between text-[9px] text-white/50 mt-1">
                  <span>HP {teamAPercent}/100</span>
                  <span className="text-emerald-300 font-semibold">Side A • Court {match.courtId}</span>
                </div>
              </div>

              <div className="text-center font-pixel text-[9px] text-yellow-400 tracking-widest py-0.5">VS</div>

              {/* Team B Pokémon Style Card */}
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 hover:border-orange-400/40 transition">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🔵</span>
                    <span className="text-white font-bold" id="team-b-names">
                      {match.teamBName}
                    </span>
                  </div>
                  <span className="font-pixel text-[8px] text-orange-400">
                    Lv.{match.teamBPlayers[0]?.level ?? 28}
                  </span>
                </div>
                <div className="hp-bar-bg w-full">
                  <div className="hp-bar-fill" style={{ width: `${teamBPercent}%` }}></div>
                </div>
                <div className="flex justify-between text-[9px] text-white/50 mt-1">
                  <span>HP {teamBPercent}/100</span>
                  <span className="text-orange-300 font-semibold">Side B • Court {match.courtId}</span>
                </div>
              </div>
            </div>

            {/* AI Tactical Advice Display */}
            <div className="mt-3 p-2.5 rounded-xl bg-[#081510] border border-[#B8F23A]/30">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-pixel text-[8px] text-[#B8F23A] flex items-center gap-1">
                  <span>🤖</span>
                  <span>AI TACTICAL ADVICE</span>
                </span>
                <button
                  onClick={() => onAnalyzeTactics(match.courtId)}
                  disabled={isAiAnalyzing}
                  className="text-[9px] text-amber-300 hover:text-amber-200 underline font-medium"
                >
                  {isAiAnalyzing ? 'วิเคราะห์อยู่...' : '🔄 แท็กติกใหม่'}
                </button>
              </div>
              <p className="text-[11px] text-white/80 leading-relaxed">
                {isAiAnalyzing ? 'กำลังประมวลผลแท็กติกการตีและจุดอ่อนของคู่แข่ง...' : match.tacticalTip}
              </p>
            </div>

            {/* Bottom Actions (Round, Rotate Batch & Server Switch) */}
            <div className="mt-3 pt-2 border-t border-white/10 space-y-2">
              {onRotateBatch && (
                <button
                  onClick={() => {
                    retroAudio.playLevelUp();
                    onRotateBatch();
                  }}
                  className="w-full py-1.5 px-2 bg-gradient-to-r from-emerald-500/30 to-sky-500/30 hover:from-emerald-500/50 hover:to-sky-500/50 border border-emerald-400/40 rounded-xl text-[11px] font-bold text-emerald-200 transition flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
                >
                  <span>🔄</span>
                  <span>สลับชุดผู้เล่นในก๊วน (Rotate Squad Batch)</span>
                </button>
              )}

              <div className="flex items-center justify-between text-[10px] text-white/60">
                <button
                  onClick={() => {
                    retroAudio.playSelect();
                    onSwitchServingSide(match.courtId);
                  }}
                  className="hover:text-white transition underline"
                >
                  สลับมือเสิร์ฟ
                </button>
                <button
                  onClick={() => {
                    retroAudio.playLevelUp();
                    onNextRound(match.courtId);
                  }}
                  className="hover:text-white transition underline"
                >
                  เซ็ตถัดไป
                </button>
                <button
                  onClick={() => {
                    retroAudio.playSelect();
                    onResetMatch(match.courtId);
                  }}
                  className="hover:text-rose-400 transition"
                >
                  รีเซ็ตแต้ม
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
