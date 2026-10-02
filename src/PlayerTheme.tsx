import { useEffect, useState } from 'react';
import { MonitorSmartphone, Moon, Sun } from 'lucide-react';

export type ThemePreference = 'system' | 'light' | 'dark';
const storageKey = 'chick-pick:player-theme';
const choices = [
  { id: 'system', label: 'ตามมือถือ', Icon: MonitorSmartphone },
  { id: 'light', label: 'สว่าง', Icon: Sun },
  { id: 'dark', label: 'มืด', Icon: Moon },
] as const;

export function usePlayerTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    try { const saved = localStorage.getItem(storageKey); return saved === 'light' || saved === 'dark' ? saved : 'system'; }
    catch { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setSystemDark(media.matches);
    changed(); media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  const theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    const previous = document.documentElement.dataset.playerTheme;
    document.documentElement.dataset.playerTheme = theme;
    return () => {
      if (previous) document.documentElement.dataset.playerTheme = previous;
      else delete document.documentElement.dataset.playerTheme;
    };
  }, [theme]);
  const choose = (next: ThemePreference) => {
    setPreference(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Theme still works for this visit. */ }
  };
  return { theme, preference, choose };
}

export function PlayerThemeSettings({ preference, choose }: { preference: ThemePreference; choose: (next: ThemePreference) => void }) {
  return <section className="pa-theme-settings" aria-label="ตั้งค่าธีม">
    <div><h2>หน้าจอที่เป็นคุณ</h2><p>เลือกธีม หรือให้แอปเปลี่ยนตามการตั้งค่ามือถือ</p></div>
    <div className="pa-theme-choices" role="group" aria-label="ธีมของแอป">{choices.map(({ id, label, Icon }) =>
      <button key={id} type="button" aria-pressed={preference === id} onClick={() => choose(id)}><Icon size={18} /><span>{label}</span></button>
    )}</div>
  </section>;
}
