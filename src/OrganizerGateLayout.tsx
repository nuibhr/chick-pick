import type { ReactNode } from 'react';
import { ArrowUpRight, CalendarDays, ClipboardCheck, UsersRound } from 'lucide-react';

export default function OrganizerGateLayout({ children }: { children: ReactNode }) {
  return <div className="wg-page">
    <header className="wg-brand"><img className="wg-brand-logo" src="/brand/chick-pick-mark.png" alt="" /><div><span className="wg-brand-name">Chick<span>&</span>Pick</span><small>ORGANIZER WORKSPACE</small></div></header>
    <main className="wg-layout">
      <section className="wg-story"><small>YOUR CLUB. YOUR CALL.</small><h1>เลือกคนลงสนาม<br />ดูแลทุกเกมด้วยกัน<span>.</span></h1><p>พื้นที่สำหรับผู้จัดและทีมงาน ดูแลก๊วน ผู้เล่น<br className="wg-desktop-break" /> และการชำระเงินได้ในที่เดียว</p><div className="wg-features"><span><CalendarDays size={17} />จัดก๊วน</span><span><ClipboardCheck size={17} />ตรวจชำระเงิน</span><span><UsersRound size={17} />ดูแลทีม</span></div><div className="wg-art"><img src="/chicken-court-3d.webp" alt="มาสคอต Chick&Pick ในสนามพิคเคิลบอล" /></div></section>
      <div className="wg-access"><section className="wg-card" aria-labelledby="organizer-login-title">{children}</section>
        <div className="wg-player-separator"><span>สำหรับคนที่มาเล่น</span></div>
        <a className="wg-player-entry" href="/miniapp?organizer=0"><span className="wg-player-icon"><UsersRound size={24} /></span><span><strong>เข้าสู่หน้าผู้เล่น</strong><small>หาก๊วน จองเรียน และดูการจองของคุณ</small></span><ArrowUpRight size={22} /></a>
      </div>
    </main>
  </div>;
}
