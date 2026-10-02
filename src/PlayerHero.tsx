import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

export default function PlayerHero({ viewGames }: { viewGames: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const sceneY = useTransform(scrollYProgress, [0, 1], [-16, 42]);
  const orbitY = useTransform(scrollYProgress, [0, 1], [-24, 78]);
  return <section ref={ref} className="pa-hero" aria-label="ค้นหาก๊วน Chick&Pick">
    <div className="pa-hero-text"><span className="pa-hero-kicker"><span />THE GAME IS ON</span><h2>มาคนเดียว<br /><em>กลับไปมีก๊วน</em></h2><p>เลือกเกมที่ใช่ แล้วเจอกันในคอร์ท</p><button type="button" onClick={viewGames}>ดูก๊วนที่เปิดรับ <ArrowRight size={17} /></button></div>
    <motion.div className="pa-hero-orbit" aria-hidden="true" style={{ y: reduced ? 0 : orbitY }}><span /><i /></motion.div>
    <motion.img src="/chicken-court-3d.webp" alt="" style={{ y: reduced ? 0 : sceneY }} />
    <span className="pa-hero-bottom" aria-hidden="true">GOOD PEOPLE · GREAT GAMES</span>
  </section>;
}
