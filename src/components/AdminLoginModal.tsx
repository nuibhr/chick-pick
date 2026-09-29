import React, { useState } from 'react';
import { AdminUser } from '../types';
import { retroAudio } from '../audio/retroAudio';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AdminUser) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess
}) => {
  const [authMode, setAuthMode] = useState<'pin' | 'password'>('pin');
  const [pin, setPin] = useState<string>('');
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handlePinInput = (num: string) => {
    retroAudio.playSelect();
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4) {
        attemptLogin({ pin: nextPin });
      }
    }
  };

  const handleBackspace = () => {
    retroAudio.playSelect();
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const attemptLogin = async (payload: { pin?: string; username?: string; password?: string }) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        retroAudio.playLevelUp();
        onLoginSuccess(data.user);
        onClose();
      } else {
        retroAudio.playFault();
        setErrorMsg(data.message || 'รหัสผ่านหรือ PIN ไม่ถูกต้อง');
        setPin('');
      }
    } catch {
      // Fallback offline / direct check for seamless demo resilience
      if (payload.pin === '8888' || payload.password === 'admin123') {
        retroAudio.playLevelUp();
        onLoginSuccess({
          id: 'adm_1',
          username: 'admin',
          name: 'แอดมินคุณหนุ่ย (Head Organizer)',
          role: 'super_admin',
          avatar: '👑',
          email: 'nuibhr1@gmail.com'
        });
        onClose();
      } else {
        retroAudio.playFault();
        setErrorMsg('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใช้ PIN 8888');
        setPin('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    attemptLogin({ username, password });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-[#B8F23A]/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden text-white">
        {/* Ambient Top Glow */}
        <div className="absolute -top-16 -left-16 w-36 h-36 bg-[#B8F23A]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={() => {
            retroAudio.playSelect();
            onClose();
          }}
          className="absolute top-4 right-4 text-white/50 hover:text-white text-lg w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-[#B8F23A] to-emerald-400 text-slate-950 flex items-center justify-center text-2xl shadow-lg font-pixel">
            👑
          </div>
          <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
            <span>เข้าสู่ระบบแอดมิน & โฮสต์ก๊วน</span>
          </h2>
          <p className="text-xs text-white/60 mt-1">
            ดูยอดเงินเข้า-ออก บัญชีรายรับรายจ่าย อนุมัติสลิป และจัดการก๊วนขั้นเทพ
          </p>
        </div>

        {/* Tab Selection: Quick PIN vs Password */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-1.5 rounded-2xl border border-white/10 mb-6">
          <button
            type="button"
            onClick={() => {
              retroAudio.playSelect();
              setAuthMode('pin');
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition ${
              authMode === 'pin'
                ? 'bg-[#B8F23A] text-slate-950 shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            ⚡ รหัส PIN ด่วน (Quick PIN)
          </button>
          <button
            type="button"
            onClick={() => {
              retroAudio.playSelect();
              setAuthMode('password');
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition ${
              authMode === 'password'
                ? 'bg-[#B8F23A] text-slate-950 shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            🔒 บัญชี & รหัสผ่าน
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs text-center flex items-center justify-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {authMode === 'pin' ? (
          <div>
            {/* PIN Dots Indicator */}
            <div className="flex justify-center items-center gap-4 my-6">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    pin.length > idx
                      ? 'bg-[#B8F23A] border-[#B8F23A] scale-110 shadow-md shadow-[#B8F23A]/40'
                      : 'border-white/30 bg-slate-800/80'
                  }`}
                />
              ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinInput(digit)}
                  disabled={isLoading}
                  className="h-12 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 active:scale-95 text-lg font-bold text-white transition flex items-center justify-center"
                >
                  {digit}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handlePinInput('0')}
                disabled={isLoading}
                className="h-12 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 active:scale-95 text-lg font-bold text-white transition flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="h-12 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 active:scale-95 text-sm text-white/70 hover:text-white transition flex items-center justify-center"
              >
                ⌫ ลบ
              </button>
            </div>

            <div className="text-center mt-4">
              <span className="text-[11px] text-white/50 bg-slate-950/60 px-3 py-1 rounded-full border border-white/10">
                💡 PIN ทดสอบด่วนสำหรับผู้จัดก๊วน: <strong className="text-[#B8F23A]">8888</strong>
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1.5">ชื่อผู้ใช้ / อีเมล</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-white/15 text-white text-sm focus:outline-none focus:border-[#B8F23A]"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1.5">รหัสผ่าน</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-white/15 text-white text-sm focus:outline-none focus:border-[#B8F23A]"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-[#B8F23A] to-emerald-400 text-slate-950 font-bold text-sm hover:brightness-105 active:scale-98 transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <span>กำลังตรวจสอบ...</span>
              ) : (
                <>
                  <span>🔐</span>
                  <span>เข้าสู่ระบบแดชบอร์ด</span>
                </>
              )}
            </button>

            <div className="text-center mt-2">
              <span className="text-[11px] text-white/50">
                ค่าเริ่มต้น: บัญชี <strong>admin</strong> รหัสผ่าน <strong>admin123</strong>
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
