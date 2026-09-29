import React, { useState, useEffect, useRef } from 'react';
import { Player, CourtMatch, EventSession, SquadPlayer } from '../types';
import { retroAudio } from '../audio/retroAudio';
import { drawQrCode } from '../utils/qrGenerator';

interface MobileSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlayer: Player;
  players: Player[];
  matches: Record<number, CourtMatch>;
  sessions: EventSession[];
  activeSessionId: string;
  onRegisterSoloSession: (sessionId: string, soloPlayer: SquadPlayer) => void;
  onRotateBatch: () => void;
}

type MobileTab = 'matchmaking' | 'squad' | 'pass' | 'coach';

export const MobileSimulatorModal: React.FC<MobileSimulatorModalProps> = ({
  isOpen,
  onClose,
  currentPlayer,
  players,
  matches,
  sessions,
  activeSessionId,
  onRegisterSoloSession,
  onRotateBatch
}) => {
  const [activeTab, setActiveTab] = useState<MobileTab>('matchmaking');
  const [selectedSessionId, setSelectedSessionId] = useState<string>(activeSessionId || sessions[0]?.id || 'sess_1');

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || sessions[0];

  // Solo Registration form state
  const [joinName, setJoinName] = useState(currentPlayer.name.replace(' (มาเดี่ยว)', ''));
  const [joinDupr, setJoinDupr] = useState(currentPlayer.dupr.toString());
  const [joinPlayStyle, setJoinPlayStyle] = useState('All-Rounder ครบเครื่อง');
  const [joinBio, setJoinBio] = useState('มาคนเดียวครับ อยากมีเพื่อนเล่นพิเคิลบอล');
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [selectedPayMethod, setSelectedPayMethod] = useState<'promptpay' | 'stripe' | 'cash'>('promptpay');
  const [slipBank, setSlipBank] = useState<string>('KBANK (กสิกรไทย)');
  const [slipTime, setSlipTime] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string>('');

  // QR Code refs
  const passCanvasRef = useRef<HTMLCanvasElement>(null);
  const payCanvasRef = useRef<HTMLCanvasElement>(null);

  // AI Team Coach
  const [coachMessages, setCoachMessages] = useState<Array<{ sender: 'user' | 'coach'; text: string }>>([
    {
      sender: 'coach',
      text: `สวัสดีคุณ ${currentPlayer.name}! โค้ช AI ยินดีให้คำแนะนำเทคนิคการเล่นคู่กับเพื่อนใหม่ เช่น การเรียกบอล, แบ่งโซน Kitchen, หรือการแก้เกมสาย Smash ครับ!`
    }
  ]);
  const [coachInput, setCoachInput] = useState('');
  const [isCoachThinking, setIsCoachThinking] = useState(false);

  // Draw QR code for pass
  useEffect(() => {
    if (activeTab === 'pass' && passCanvasRef.current) {
      drawQrCode(passCanvasRef.current, `SOLO_PASS_${currentPlayer.id}_${currentPlayer.name}`, 140);
    }
  }, [activeTab, currentPlayer]);

  // Draw QR code for head fee payment
  useEffect(() => {
    if (showPaymentSheet && payCanvasRef.current && selectedSession) {
      drawQrCode(
        payCanvasRef.current,
        `PROMPTPAY_HEADFEE_${selectedSession.headFee}_${selectedSession.id}_${joinName}`,
        150
      );
    }
  }, [showPaymentSheet, selectedSession, joinName]);

  if (!isOpen || !selectedSession) return null;

  const handleConfirmPayAndJoin = async () => {
    setIsSubmittingPayment(true);
    retroAudio.playSelect();

    const soloId = `solo_${Date.now()}`;
    const newSolo: SquadPlayer = {
      id: soloId,
      name: joinName.trim() || 'ผู้เล่นมาเดี่ยว',
      dupr: parseFloat(joinDupr) || 3.5,
      avatarIcon: '🧢',
      playStyle: joinPlayStyle,
      bio: joinBio,
      paidStatus: selectedPayMethod === 'cash' ? 'pending' : 'paid',
      joinedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      isSolo: true,
      isBench: true
    };

    try {
      if (selectedPayMethod === 'stripe') {
        // Stripe API integration
        const res = await fetch('/api/stripe/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: selectedSession.id,
            playerId: soloId,
            playerName: newSolo.name,
            amount: selectedSession.headFee
          })
        });
        const data = await res.json();
        setPaymentSuccessMessage(data.message || `ชำระเงินสำเร็จผ่านระบบ Stripe ฿${selectedSession.headFee}`);
      } else if (selectedPayMethod === 'promptpay') {
        // Bank Slip Submission API
        const res = await fetch('/api/slips/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: selectedSession.id,
            playerId: soloId,
            playerName: newSolo.name,
            amount: selectedSession.headFee,
            bank: slipBank,
            transferTime: slipTime || new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
          })
        });
        const data = await res.json();
        if (data.autoVerified) {
          setPaymentSuccessMessage(`ส่งสลิป ${slipBank} ยอด ฿${selectedSession.headFee} ตรวจผ่านอัตโนมัติ!`);
        } else {
          setPaymentSuccessMessage(`ส่งสลิปให้แอดมินเรียบร้อย รออนุมัติยอด`);
        }
      } else {
        setPaymentSuccessMessage(`ลงชื่อเข้าร่วมก๊วนเรียบร้อย ชำระเงินสดหน้าสนาม`);
      }

      retroAudio.playLevelUp();
      setPaymentDone(true);
      onRegisterSoloSession(selectedSession.id, newSolo);

      setTimeout(() => {
        setShowPaymentSheet(false);
        setPaymentDone(false);
        setIsSubmittingPayment(false);
        setActiveTab('squad');
      }, 1500);
    } catch {
      // Fallback
      retroAudio.playLevelUp();
      setPaymentDone(true);
      onRegisterSoloSession(selectedSession.id, newSolo);
      setTimeout(() => {
        setShowPaymentSheet(false);
        setPaymentDone(false);
        setIsSubmittingPayment(false);
        setActiveTab('squad');
      }, 1500);
    }
  };

  const handleSendCoach = () => {
    if (!coachInput.trim()) return;
    const userMsg = coachInput.trim();
    setCoachMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setCoachInput('');
    setIsCoachThinking(true);
    retroAudio.playSelect();

    setTimeout(() => {
      let reply = '';
      const lower = userMsg.toLowerCase();
      if (lower.includes('เพื่อน') || lower.includes('คู่') || lower.includes('สื่อสาร') || lower.includes('เรียก')) {
        reply = 'การเล่นกับเพื่อนใหม่ที่เพิ่งเจอในก๊วน: ก่อนเริ่มเกมให้ตกลงกันว่า "ใครถนัดโฟร์แฮนด์ตรงกลางคอร์ดให้เรียก Mine/ได้!" และคอยให้กำลังใจหลังจบแต้มด้วยการแตะไม้ (Paddle Tap) จะช่วยให้ฟอร์มไหลลื่นขึ้นมากครับ!';
      } else if (lower.includes('kitchen') || lower.includes('nvz') || lower.includes('เส้น')) {
        reply = 'กฎ Non-Volley Zone (Kitchen): ห้ามเหยียบเส้นหรือก้าวเข้าพื้นที่ขณะตบลูกกลางอากาศ แต่ถ้าลูกเด้งแล้วก้าวเข้าไปดิงก์ได้ และต้องรีบถอยกลับมาคุมเส้นครับ!';
      } else if (lower.includes('drop') || lower.includes('third shot') || lower.includes('ลูกสาม')) {
        reply = 'เทคนิค Third Shot Drop: ผ่อนแรงข้อมือ ย่อเข่า สัมผัสใต้ลูกให้วิถีบอลย้อยข้ามเน็ตไปตกใน Kitchen ของคู่แข่ง เพื่อให้เราและเพื่อนร่วมทีมมีเวลาวิ่งขึ้นมาคุมเส้นตาข่ายพร้อมกัน!';
      } else if (lower.includes('banger') || lower.includes('ตีแรง') || lower.includes('ตบ')) {
        reply = 'วิธีรับมือกับสายทุบแรง: ตั้งไม้ระดับอกรอไว้ล่วงหน้า ผ่อนแรงมือทำ Soft Block หยอดคืนหน้าเน็ต ลูกจะหยุดแรงกระแทกทันทีครับ!';
      } else {
        reply = 'สำหรับแมตช์นี้ โค้ชแนะนำให้เน้นการวางบอลกระจายไปที่เท้าของคู่แข่ง (Feet Target) และรักษาการยืนขนานเส้นกับเพื่อนร่วมคู่ครับ!';
      }

      setCoachMessages((prev) => [...prev, { sender: 'coach', text: reply }]);
      setIsCoachThinking(false);
      retroAudio.playSelect();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fadeIn">
      {/* Smartphone Frame Container */}
      <div className="relative w-full max-w-[395px] h-[790px] max-h-[92vh] bg-[#0c1322] rounded-[44px] border-[6px] border-[#222f3e] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden text-slate-100">
        {/* Dynamic Island / Speaker Notch */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-40 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1e293b] mr-2" />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {/* Mobile Status Bar */}
        <div className="pt-3 px-6 pb-2 flex items-center justify-between text-[11px] font-mono text-white/70 z-30 select-none">
          <span>18:45</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]">5G</span>
            <span>⚡ 98%</span>
          </div>
        </div>

        {/* App Bar */}
        <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-950 border-b border-white/10 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#B8F23A] to-emerald-400 text-slate-950 font-bold flex items-center justify-center text-sm shadow">
              🎾
            </div>
            <div>
              <h1 className="font-pixel text-[10px] text-[#B8F23A] tracking-wider leading-none">
                PICKLE-SQUAD
              </h1>
              <p className="text-[9px] text-white/50 mt-0.5">ก๊วนหาเพื่อนเล่น & จัดรอบค่าหัวคิว</p>
            </div>
          </div>
          <button
            onClick={() => {
              retroAudio.playSelect();
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs font-bold transition"
          >
            ✕
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* TAB 1: SOLO MATCHMAKING (FIND FRIENDS & PAY HEAD FEE) */}
          {activeTab === 'matchmaking' && (
            <div className="space-y-3 animate-fadeIn">
              {/* Value Proposition Hero Banner */}
              <div className="p-3.5 bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent rounded-2xl border border-emerald-400/40 relative overflow-hidden">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base">🤝</span>
                  <span className="font-pixel text-[9px] text-[#B8F23A]">SOLO TO SQUAD MATCHMAKER</span>
                </div>
                <h3 className="font-bold text-xs text-white">อยากเล่นแต่ไม่มีเพื่อน? มาเดี่ยวได้เลย!</h3>
                <p className="text-[10px] text-white/70 mt-1 leading-relaxed">
                  โฮสต์เหมาสนามจัดรอบให้ 2 ชั่วโมงเต็ม รวม 12 คน สลับคู่หมุนเวียน ได้ตีครบทุกคน จ่ายแค่ค่าหัวคิวเฉลี่ย ฿160 - ฿200 เท่านั้น!
                </p>
              </div>

              {/* Sessions Selector */}
              <div>
                <span className="text-[11px] font-bold text-white/80 block mb-2">เลือกรอบก๊วนที่ต้องการลงตี</span>
                <div className="space-y-2">
                  {sessions.map((sess) => {
                    const isSelected = sess.id === selectedSession.id;
                    const isFull = sess.registeredPlayers.length >= sess.targetPlayers;
                    return (
                      <div
                        key={sess.id}
                        onClick={() => {
                          retroAudio.playSelect();
                          setSelectedSessionId(sess.id);
                        }}
                        className={`p-3 rounded-2xl border transition cursor-pointer relative ${
                          isSelected
                            ? 'bg-amber-400/10 border-amber-400 shadow-md'
                            : 'bg-black/30 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-pixel text-[10px] text-amber-300">{sess.timeSlot}</span>
                            <span className="text-[9px] text-white/50">({sess.dateLabel})</span>
                          </div>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                              isFull
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {isFull ? 'เต็ม 12/12 คน' : `รับเพิ่ม ${sess.targetPlayers - sess.registeredPlayers.length} คน`}
                          </span>
                        </div>

                        <h4 className="font-bold text-xs text-white mb-0.5">{sess.title}</h4>
                        <p className="text-[10px] text-white/60 line-clamp-1">{sess.tagline}</p>

                        <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[10px]">
                          <span className="text-white/60">ค่าหัวคิว: <strong className="text-amber-300">฿{sess.headFee}</strong> (2 ชม. เต็ม)</span>
                          <span className="text-emerald-400 font-bold">{sess.registeredPlayers.length}/{sess.targetPlayers} คนในตี้</span>
                        </div>

                        {/* Avatars of solo players who joined */}
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-[9px] text-white/40 mr-1">เพื่อนในตี้:</span>
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {sess.registeredPlayers.slice(0, 6).map((p, idx) => (
                              <div
                                key={idx}
                                title={p.name}
                                className="w-5 h-5 rounded-full bg-white/15 border border-black flex items-center justify-center text-[10px]"
                              >
                                {p.avatarIcon}
                              </div>
                            ))}
                            {sess.registeredPlayers.length > 6 && (
                              <div className="w-5 h-5 rounded-full bg-amber-400/20 border border-black flex items-center justify-center text-[8px] font-bold text-amber-300">
                                +{sess.registeredPlayers.length - 6}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Button: Join Solo */}
              <button
                onClick={() => {
                  retroAudio.playSelect();
                  setShowPaymentSheet(true);
                }}
                className="w-full py-3 bg-gradient-to-r from-[#B8F23A] to-emerald-400 hover:from-[#a6dc32] hover:to-emerald-300 text-slate-950 font-bold text-xs rounded-2xl shadow-lg transition flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
              >
                <span>⚡</span>
                <span>ลงตี้เดี่ยวรอบนี้ (จ่ายค่าหัวคิว ฿{selectedSession.headFee})</span>
              </button>
            </div>
          )}

          {/* TAB 2: MY SQUAD & ROTATION BATCH (ตี้ของฉัน & ตารางสลับชุด) */}
          {activeTab === 'squad' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="p-3 bg-slate-900/90 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-pixel text-[9px] text-amber-300">CURRENT SESSION</span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    กำลังดวลชุด {selectedSession.currentMatchIndex}/{selectedSession.totalMatchesInSession}
                  </span>
                </div>
                <h3 className="font-bold text-xs text-white">{selectedSession.title}</h3>
                <p className="text-[10px] text-white/60 mt-0.5">เวลา {selectedSession.timeSlot} • ผู้เล่น 12 คน สลับกันเล่น 2 คอร์ต</p>
              </div>

              {/* Your Personal Status Card */}
              <div className="p-3 bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-2xl border border-purple-400/30">
                <span className="text-[9px] font-pixel text-purple-300 block mb-1">YOUR ROTATION STATUS</span>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🪑</span>
                  <div>
                    <h4 className="text-xs font-bold text-white">เซ็ตนี้พักดื่มน้ำ (Bench Rest)</h4>
                    <p className="text-[10px] text-purple-200 mt-0.5">
                      แมตช์ต่อไปจะได้ลง <strong>คอร์ต 2</strong> คู่กับ <strong>พี่ต้น</strong> ดวลกับ แชมป์ + กอล์ฟ!
                    </p>
                  </div>
                </div>
              </div>

              {/* Current Active Batch on Courts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-white/80">ผู้เล่นในสนามตอนนี้ (ชุดที่ 2)</span>
                  <button
                    onClick={() => {
                      retroAudio.playLevelUp();
                      onRotateBatch();
                    }}
                    className="text-[10px] text-[#B8F23A] hover:underline flex items-center gap-1 font-bold"
                  >
                    <span>🔄</span>
                    <span>สลับชุดถัดไป</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {/* Court 1 */}
                  <div className="p-2.5 bg-black/40 rounded-xl border border-white/10 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-white/50 mb-1">
                      <span>🎾 คอร์ต 1 (Court 1)</span>
                      <span className="text-amber-300 font-pixel">9 - 7</span>
                    </div>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-emerald-400">หนุ่ย + พลอย (มาเดี่ยว)</span>
                      <span className="text-white/40 text-[10px]">vs</span>
                      <span className="text-orange-400">เอก + บอย (มาเดี่ยว)</span>
                    </div>
                  </div>

                  {/* Court 2 */}
                  <div className="p-2.5 bg-black/40 rounded-xl border border-white/10 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-white/50 mb-1">
                      <span>🎾 คอร์ต 2 (Court 2)</span>
                      <span className="text-amber-300 font-pixel">6 - 5</span>
                    </div>
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-emerald-400">พี่ต้น + นุช (มาเดี่ยว)</span>
                      <span className="text-white/40 text-[10px]">vs</span>
                      <span className="text-orange-400">แชมป์ + กอล์ฟ (มาเดี่ยว)</span>
                    </div>
                  </div>

                  {/* Bench */}
                  <div className="p-2.5 bg-black/20 rounded-xl border border-white/5 text-[11px]">
                    <div className="text-[10px] text-white/40 mb-1">🪑 ม้านั่งพักรอสลับเข้าชุด 3 (Bench Rotation):</div>
                    <div className="flex flex-wrap gap-1.5">
                      {['เบิร์ด', 'ฝน', 'เต้', 'แนน'].map((name, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white/10 rounded-full text-white/80 text-[10px]">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SOLO PASS (บัตรสมาชิกคนมาเดี่ยว & QR สแกนเข้าสนาม) */}
          {activeTab === 'pass' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="p-4 bg-gradient-to-b from-[#162032] to-[#0d1522] rounded-3xl border-2 border-[#B8F23A]/40 shadow-xl flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-2 right-3 font-pixel text-[8px] text-[#B8F23A] bg-[#B8F23A]/10 px-2 py-0.5 rounded border border-[#B8F23A]/30">
                  SOLO PASS
                </div>

                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500 to-emerald-400 flex items-center justify-center text-2xl shadow-lg mt-2 mb-2">
                  {currentPlayer.avatarIcon}
                </div>

                <h3 className="font-bold text-sm text-white">{currentPlayer.name}</h3>
                <span className="text-[10px] text-[#B8F23A] font-pixel mt-0.5">DUPR {currentPlayer.dupr.toFixed(2)}</span>

                <div className="my-3 p-2 bg-white rounded-xl shadow">
                  <canvas ref={passCanvasRef} className="rounded" />
                  <span className="text-[9px] text-slate-800 font-mono block mt-1">สแกนเช็คอินหน้าเคาน์เตอร์</span>
                </div>

                <div className="w-full grid grid-cols-2 gap-2 text-left pt-2 border-t border-white/10 text-[10px]">
                  <div>
                    <span className="text-white/50 block">สไตล์การเล่น:</span>
                    <span className="font-bold text-white">{currentPlayer.playStyle || 'Dinker เน้นหยอด'}</span>
                  </div>
                  <div>
                    <span className="text-white/50 block">ไม้ประจำตัว:</span>
                    <span className="font-bold text-white truncate block">{currentPlayer.paddle}</span>
                  </div>
                </div>
              </div>

              {/* Community Milestone */}
              <div className="p-3 bg-black/40 rounded-2xl border border-white/10 text-xs">
                <span className="text-[10px] text-white/50 block mb-1">สถิติการมาแจมคนเดียว</span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-1.5 bg-white/5 rounded-xl">
                    <span className="font-pixel text-xs text-[#B8F23A] block">7</span>
                    <span className="text-[9px] text-white/50">ก๊วนที่เข้าร่วม</span>
                  </div>
                  <div className="p-1.5 bg-white/5 rounded-xl">
                    <span className="font-pixel text-xs text-amber-300 block">28</span>
                    <span className="text-[9px] text-white/50">เพื่อนใหม่ที่พบ</span>
                  </div>
                  <div className="p-1.5 bg-white/5 rounded-xl">
                    <span className="font-pixel text-xs text-sky-400 block">94%</span>
                    <span className="text-[9px] text-white/50">ความพึงพอใจ</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AI TEAM COACH */}
          {activeTab === 'coach' && (
            <div className="h-full flex flex-col justify-between space-y-2 animate-fadeIn">
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {coachMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.sender === 'coach'
                        ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-100 mr-4'
                        : 'bg-blue-600 text-white ml-6 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1 text-[10px] font-bold text-white/60">
                      <span>{msg.sender === 'coach' ? '🤖 โค้ช AI ประจำก๊วน' : '👤 คุณ'}</span>
                    </div>
                    {msg.text}
                  </div>
                ))}
                {isCoachThinking && (
                  <div className="p-2.5 bg-white/5 rounded-xl text-xs text-white/50 animate-pulse">
                    กำลังวิเคราะห์แท็กติกคู่...
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="pt-2 border-t border-white/10 flex gap-1.5">
                <input
                  type="text"
                  placeholder="ถามเทคนิค เช่น วิธีเรียกบอลกับเพื่อนใหม่..."
                  value={coachInput}
                  onChange={(e) => setCoachInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendCoach()}
                  className="flex-1 px-3 py-2 bg-black/50 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#B8F23A]"
                />
                <button
                  onClick={handleSendCoach}
                  className="px-3 py-2 bg-[#B8F23A] hover:bg-[#a6dc32] text-slate-950 font-bold rounded-xl text-xs shadow cursor-pointer transition"
                >
                  ส่ง
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Payment Bottom Sheet Modal */}
        {showPaymentSheet && (
          <div className="absolute inset-0 bg-black/90 z-50 flex flex-col justify-end animate-fadeIn">
            <div className="bg-[#0f172a] rounded-t-[32px] border-t-2 border-amber-400 p-4 sm:p-5 space-y-3 max-h-[90%] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-xs text-white">ชำระค่าหัวคิวลงตี้คนเดียว</h3>
                  <p className="text-[10px] text-white/60">รอบ {selectedSession.timeSlot} • ฿{selectedSession.headFee} (รวม 2 ชม.)</p>
                </div>
                <button
                  onClick={() => setShowPaymentSheet(false)}
                  className="w-7 h-7 rounded-full bg-white/10 text-white flex items-center justify-center text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Payment Method Switcher Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-2xl border border-white/10 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    retroAudio.playSelect();
                    setSelectedPayMethod('promptpay');
                  }}
                  className={`py-1.5 rounded-xl font-bold transition flex items-center justify-center gap-1 ${
                    selectedPayMethod === 'promptpay'
                      ? 'bg-[#B8F23A] text-slate-950 shadow'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <span>📱</span>
                  <span>พร้อมเพย์/สลิป</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    retroAudio.playSelect();
                    setSelectedPayMethod('stripe');
                  }}
                  className={`py-1.5 rounded-xl font-bold transition flex items-center justify-center gap-1 ${
                    selectedPayMethod === 'stripe'
                      ? 'bg-indigo-500 text-white shadow'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <span>⚡</span>
                  <span>Stripe บัตร</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    retroAudio.playSelect();
                    setSelectedPayMethod('cash');
                  }}
                  className={`py-1.5 rounded-xl font-bold transition flex items-center justify-center gap-1 ${
                    selectedPayMethod === 'cash'
                      ? 'bg-amber-400 text-slate-950 shadow'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <span>💵</span>
                  <span>เงินสดสนาม</span>
                </button>
              </div>

              {/* PromptPay QR & Slip Option */}
              {selectedPayMethod === 'promptpay' && (
                <div className="space-y-2">
                  <div className="flex flex-col items-center text-center">
                    <div className="bg-white p-2.5 rounded-2xl shadow my-0.5">
                      <canvas ref={payCanvasRef} className="rounded" />
                      <p className="font-pixel text-[9px] text-slate-900 mt-1 font-bold">
                        PROMPTPAY • ฿{selectedSession.headFee}
                      </p>
                    </div>
                    <span className="text-[10px] text-white/60">
                      สแกนจ่าย ฿{selectedSession.headFee} ไปยัง 089-888-8888 (ชมรมพิเคิลบอล)
                    </span>
                  </div>

                  <div className="p-2.5 bg-black/40 rounded-2xl border border-white/10 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">ธนาคารที่โอน:</span>
                      <select
                        value={slipBank}
                        onChange={(e) => setSlipBank(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-2 py-0.5 text-[10px] text-white"
                      >
                        <option value="KBANK (กสิกรไทย)">KBANK (กสิกรไทย)</option>
                        <option value="SCB (ไทยพาณิชย์)">SCB (ไทยพาณิชย์)</option>
                        <option value="BBL (กรุงเทพ)">BBL (กรุงเทพ)</option>
                        <option value="KTB (กรุงไทย)">KTB (กรุงไทย)</option>
                        <option value="TTB (ทหารไทยธนชาต)">TTB (ทหารไทยธนชาต)</option>
                        <option value="GSB (ออมสิน)">GSB (ออมสิน)</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">เวลาที่โอนในสลิป:</span>
                      <input
                        type="text"
                        placeholder="เช่น 18:30 น."
                        value={slipTime}
                        onChange={(e) => setSlipTime(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-2 py-0.5 text-[10px] text-white w-24 text-right"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Stripe Payment Option */}
              {selectedPayMethod === 'stripe' && (
                <div className="p-3 bg-indigo-950/60 rounded-2xl border border-indigo-500/30 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💳</span>
                    <div>
                      <div className="font-bold text-white text-xs">Stripe Fast Checkout</div>
                      <div className="text-[10px] text-white/60">ตัดบัตรเครดิต, เดบิต หรือ Apple Pay ทันที</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/90 border border-white/10 font-mono text-[11px] text-white/80 space-y-1">
                    <div className="flex justify-between">
                      <span>ยอดชำระ:</span>
                      <strong className="text-[#B8F23A]">฿{selectedSession.headFee}.00 THB</strong>
                    </div>
                    <div className="flex justify-between text-[10px] text-white/50">
                      <span>Gateway:</span>
                      <span>Stripe Express Direct</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Cash at Counter Option */}
              {selectedPayMethod === 'cash' && (
                <div className="p-3 bg-amber-950/50 rounded-2xl border border-amber-400/30 text-xs space-y-1 text-white/80">
                  <div className="font-bold text-amber-300">💵 ชำระเงินสดหน้าเคาน์เตอร์</div>
                  <p className="text-[10px] text-white/60">
                    ลงชื่อเข้าร่วมก๊วนไว้ก่อน และยื่นเงินสด ฿{selectedSession.headFee} ให้แอดมินคุณหนุ่ยตอนเช็คอินหน้าสนาม
                  </p>
                </div>
              )}

              {paymentDone ? (
                <div className="py-2.5 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl text-center shadow animate-pulse">
                  {paymentSuccessMessage || '✓ ชำระเงินสำเร็จ! เข้าสู่ตี้เรียบร้อย'}
                </div>
              ) : (
                <button
                  disabled={isSubmittingPayment}
                  onClick={handleConfirmPayAndJoin}
                  className={`w-full py-2.5 font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedPayMethod === 'stripe'
                      ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                      : selectedPayMethod === 'cash'
                      ? 'bg-amber-400 hover:bg-amber-500 text-slate-950'
                      : 'bg-[#B8F23A] hover:bg-[#a6dc32] text-slate-950'
                  }`}
                >
                  {isSubmittingPayment ? (
                    <span>กำลังดำเนินการ...</span>
                  ) : (
                    <>
                      <span>{selectedPayMethod === 'stripe' ? '⚡' : selectedPayMethod === 'cash' ? '💵' : '📤'}</span>
                      <span>
                        {selectedPayMethod === 'stripe'
                          ? `ชำระ ฿${selectedSession.headFee} ผ่าน Stripe`
                          : selectedPayMethod === 'cash'
                          ? `ยืนยันลงชื่อจ่ายเงินสด ฿${selectedSession.headFee}`
                          : `ส่งสลิป & ยืนยันชำระเงิน ฿${selectedSession.headFee}`}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bottom Tab Navigation Bar */}
        <div className="px-3 py-2.5 bg-[#080d16] border-t border-white/10 grid grid-cols-4 gap-1 select-none z-30">
          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('matchmaking');
            }}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition ${
              activeTab === 'matchmaking' ? 'text-[#B8F23A] font-bold bg-white/5' : 'text-white/50 hover:text-white'
            }`}
          >
            <span className="text-base leading-none mb-1">🤝</span>
            <span className="text-[9px] tracking-tight">หาเพื่อนเล่น</span>
          </button>

          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('squad');
            }}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition ${
              activeTab === 'squad' ? 'text-[#B8F23A] font-bold bg-white/5' : 'text-white/50 hover:text-white'
            }`}
          >
            <span className="text-base leading-none mb-1">👥</span>
            <span className="text-[9px] tracking-tight">ตี้ของฉัน</span>
          </button>

          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('pass');
            }}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition ${
              activeTab === 'pass' ? 'text-[#B8F23A] font-bold bg-white/5' : 'text-white/50 hover:text-white'
            }`}
          >
            <span className="text-base leading-none mb-1">💳</span>
            <span className="text-[9px] tracking-tight">Solo Pass</span>
          </button>

          <button
            onClick={() => {
              retroAudio.playSelect();
              setActiveTab('coach');
            }}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition ${
              activeTab === 'coach' ? 'text-[#B8F23A] font-bold bg-white/5' : 'text-white/50 hover:text-white'
            }`}
          >
            <span className="text-base leading-none mb-1">🤖</span>
            <span className="text-[9px] tracking-tight">โค้ช AI</span>
          </button>
        </div>
      </div>
    </div>
  );
};
