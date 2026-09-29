import React, { useMemo, useState } from 'react';
import Coaching from './components/Coaching';
import DuprProfile from './components/DuprProfile';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Home,
  Loader2,
  MapPin,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';

type Session = {
  id: string;
  title: string;
  venue: string;
  area: string;
  date: string;
  time: string;
  price: number;
  joined: number;
  capacity: number;
  dupr: string;
  vibe: string;
  host: string;
  hostRating: number;
  courtCount: number;
  venueCost: number;
  tags: string[];
  status?: 'open' | 'full' | 'completed';
};

type CheckoutState = { session: Session; step: 'confirm' | 'processing' | 'success' } | null;

const seedSessions: Session[] = [
  { id: 'night-chicken', title: 'Wednesday Night Chicken', venue: 'Smash Yard Pickleball', area: 'เมืองขอนแก่น', date: 'วันนี้', time: '18:00–20:00', price: 190, joined: 9, capacity: 12, dupr: '2.5–3.5', vibe: 'ชิลล์ เน้นเล่นทั่วถึง', host: 'Nui', hostRating: 4.9, courtCount: 2, venueCost: 800, tags: ['มาคนเดียวได้', 'Smart Match'], status: 'open' },
  { id: 'beginner', title: 'Beginner Friendly', venue: 'Chicken Court Club', area: 'กังสดาล', date: 'พรุ่งนี้', time: '19:00–21:00', price: 170, joined: 6, capacity: 12, dupr: 'มือใหม่–3.0', vibe: 'มือใหม่สบาย ๆ', host: 'Bank', hostRating: 4.8, courtCount: 2, venueCost: 700, tags: ['มือใหม่', 'มีคนจัดคู่ให้'], status: 'open' },
  { id: 'competitive', title: 'Friday Competitive Mix', venue: 'North Court Arena', area: 'บึงแก่นนคร', date: 'ศุกร์นี้', time: '20:00–22:00', price: 220, joined: 11, capacity: 16, dupr: '3.2–4.2', vibe: 'จริงจัง แต่เป็นมิตร', host: 'Ploy', hostRating: 5, courtCount: 3, venueCost: 1200, tags: ['เกมเข้ม', 'จัดตาม DUPR'], status: 'open' },
];

const coverFor = (index: number) => [
  'linear-gradient(135deg,#173b2f 0%,#246f55 55%,#b8f23a 170%)',
  'linear-gradient(135deg,#16243a 0%,#315a7d 60%,#7dd3fc 170%)',
  'linear-gradient(135deg,#402421 0%,#8b3a2c 58%,#fdba74 170%)',
][index % 3];

function formatBaht(value: number) {
  return new Intl.NumberFormat('th-TH').format(Math.round(value));
}

export default function App() {
  const [tab, setTab] = useState<'home' | 'games' | 'coaching' | 'organizer' | 'profile'>(new URLSearchParams(window.location.search).has('coaching') ? 'coaching' : 'home');
  const [sessions, setSessions] = useState<Session[]>(seedSessions);
  const [selected, setSelected] = useState<Session | null>(null);
  const [joinedIds, setJoinedIds] = useState<string[]>(['beginner']);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ทั้งหมด');
  const [checkout, setCheckout] = useState<CheckoutState>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredSessions = useMemo(() => sessions.filter((session) => {
    const dateOk = dateFilter === 'ทั้งหมด' || session.date === dateFilter;
    const q = search.trim().toLowerCase();
    const searchOk = !q || `${session.title} ${session.venue} ${session.area}`.toLowerCase().includes(q);
    return dateOk && searchOk;
  }), [sessions, dateFilter, search]);

  const startCheckout = (session: Session) => {
    setSelected(null);
    setCheckout({ session, step: 'confirm' });
  };

  const completePayment = async () => {
    if (!checkout) return;
    setCheckout({ ...checkout, step: 'processing' });
    try {
      const res = await fetch('/api/stripe/create-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: checkout.session.id, playerId: 'demo_player', playerName: 'Nui', amount: checkout.session.price }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'payment failed');
      setJoinedIds((prev) => prev.includes(checkout.session.id) ? prev : [...prev, checkout.session.id]);
      setSessions((prev) => prev.map((s) => s.id === checkout.session.id ? { ...s, joined: Math.min(s.capacity, s.joined + 1) } : s));
      setCheckout({ ...checkout, step: 'success' });
    } catch {
      setNotice('ยังไม่สามารถชำระเงินจริงได้ใน environment นี้ — UX พร้อมแล้ว แต่ต้องตั้ง Payment Gateway ก่อน');
      setCheckout({ ...checkout, step: 'confirm' });
    }
  };

  const finishCheckout = () => {
    setCheckout(null);
    setTab('games');
  };

  const createSession = async (draft: Omit<Session, 'id' | 'hostRating' | 'joined' | 'tags'>) => {
    const optimistic: Session = { ...draft, id: `local-${Date.now()}`, joined: 0, hostRating: 4.9, tags: ['มาคนเดียวได้', 'Smart Match'], status: 'open' };
    setSessions((prev) => [optimistic, ...prev]);
    setCreateOpen(false);
    setNotice('สร้างก๊วนแล้ว — ตอน deploy จริงระบบจะบันทึกผ่าน API และฐานข้อมูล');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title, timeSlot: draft.time, dateLabel: draft.date, headFee: draft.price, courtRentalCost: draft.venueCost, targetPlayers: draft.capacity, duprRange: draft.dupr, atmosphere: 'ผสมผสาน' }),
      });
      const data = await res.json();
      if (res.ok && data.session?.id) setSessions((prev) => prev.map((s) => s.id === optimistic.id ? { ...s, id: data.session.id } : s));
    } catch {
      // Keep optimistic UI for preview.
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7f2] text-[#152019]">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f5f7f2]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <button onClick={() => setTab('home')} className="flex items-center gap-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#17251f] text-xl">🐔</div>
            <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-[#6f8178]">Pickleball community</div><div className="text-xl font-black">CHICK&PICK</div></div>
          </button>
          <div className="flex items-center gap-2"><button onClick={() => setTab('organizer')} className="hidden rounded-full border border-[#dbe2da] bg-white px-4 py-2 text-sm font-black md:block">Organizer</button><a href="/?admin=1" className="rounded-full border border-[#dbe2da] bg-white px-3 py-2 text-xs font-bold">แอดมิน</a></div>
        </div>
      </header>

      {notice && <div className="fixed left-1/2 top-20 z-[70] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl bg-[#17251f] px-4 py-3 text-sm font-bold text-white shadow-xl"><button onClick={() => setNotice(null)} className="float-right ml-3 opacity-70"><X size={16}/></button>{notice}</div>}

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-6 md:pb-12">
        {tab === 'home' && <HomeView sessions={filteredSessions} search={search} setSearch={setSearch} dateFilter={dateFilter} setDateFilter={setDateFilter} onSelect={setSelected} />}
        {tab === 'games' && <MyGames sessions={sessions.filter((s) => joinedIds.includes(s.id))} onSelect={setSelected} />}
        {tab === 'organizer' && <OrganizerDashboard session={sessions[0]} onCreate={() => setCreateOpen(true)} />}
        {tab === 'profile' && <DuprProfile />}
        {tab === 'coaching' && <Coaching />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(24,39,31,.08)] backdrop-blur-xl md:left-1/2 md:bottom-5 md:right-auto md:w-[520px] md:-translate-x-1/2 md:rounded-full md:border">
        <div className="grid grid-cols-5 gap-1">
          <NavButton active={tab === 'home'} onClick={() => setTab('home')} icon={<Home size={20}/>} label="หาก๊วน" />
          <NavButton active={tab === 'games'} onClick={() => setTab('games')} icon={<Trophy size={20}/>} label="ก๊วนของฉัน" />
          <NavButton active={tab === 'coaching'} onClick={() => setTab('coaching')} icon={<UsersRound size={20}/>} label="เรียนกับโค้ช" />
          <NavButton active={tab === 'organizer'} onClick={() => setTab('organizer')} icon={<WalletCards size={20}/>} label="Organizer" />
          <NavButton active={tab === 'profile'} onClick={() => setTab('profile')} icon={<UserRound size={20}/>} label="โปรไฟล์" />
        </div>
      </nav>

      {selected && <SessionSheet session={selected} joined={joinedIds.includes(selected.id)} onClose={() => setSelected(null)} onJoin={() => startCheckout(selected)} />}
      {checkout && <CheckoutModal state={checkout} onClose={() => setCheckout(null)} onPay={completePayment} onFinish={finishCheckout} />}
      {createOpen && <CreateSessionModal onClose={() => setCreateOpen(false)} onCreate={createSession} />}
    </div>
  );
}

function HomeView({ sessions, search, setSearch, dateFilter, setDateFilter, onSelect }: { sessions: Session[]; search: string; setSearch: (v:string)=>void; dateFilter:string; setDateFilter:(v:string)=>void; onSelect:(s:Session)=>void }) {
  return <>
    <section className="relative overflow-hidden rounded-[30px] bg-[#17251f] px-5 py-7 text-white shadow-xl shadow-[#17251f]/10 md:px-9 md:py-10">
      <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-[#b8f23a]/20 blur-2xl" />
      <div className="relative max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-[#dff8a9]"><UsersRound size={14}/> มาคนเดียวก็เล่นได้</span><h1 className="mt-4 text-3xl font-black leading-tight md:text-5xl">อยากเล่นก็มา<br/>เดี๋ยวเราจัดก๊วนให้</h1><p className="mt-3 text-sm leading-6 text-white/70 md:text-base">เลือกก๊วน จ่ายครั้งเดียว แล้วระบบช่วยจัดคน จัดคู่ และดูแลรอบให้</p></div>
      <div className="relative mt-7 flex items-center gap-3 rounded-2xl bg-white p-2 text-[#17251f] md:max-w-xl"><Search className="ml-2 text-[#789085]" size={20}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="ค้นหาสนาม หรือชื่อก๊วน" className="w-full bg-transparent py-2 text-sm font-semibold outline-none"/></div>
    </section>
    <section className="mt-7"><div className="flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#73877e]">OPEN GAMES</p><h2 className="mt-1 text-2xl font-black">ก๊วนที่กำลังเปิดรับ</h2></div><span className="text-sm font-bold text-[#577064]">{sessions.length} ก๊วน</span></div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">{['ทั้งหมด','วันนี้','พรุ่งนี้','ศุกร์นี้'].map((x)=><button key={x} onClick={()=>setDateFilter(x)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${dateFilter===x?'bg-[#17251f] text-white':'border border-[#dbe3da] bg-white text-[#53685f]'}`}>{x}</button>)}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">{sessions.map((s,i)=><SessionCard key={s.id} session={s} index={i} onClick={()=>onSelect(s)}/>)}</div>
    </section>
  </>;
}

function SessionCard({ session, index, onClick }: { session:Session; index:number; onClick:()=>void }) {
  const left = session.capacity-session.joined;
  return <button onClick={onClick} className="group overflow-hidden rounded-[26px] border border-[#e2e8df] bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
    <div className="relative h-36 p-5 text-white" style={{background:coverFor(index)}}><div className="flex justify-between"><span className="rounded-full bg-black/20 px-3 py-1.5 text-xs font-bold">{session.date}</span><span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#17251f]">฿{session.price}</span></div><div className="absolute bottom-4 left-5"><h3 className="text-xl font-black">{session.title}</h3><div className="mt-1 flex items-center gap-1 text-xs font-semibold text-white/80"><MapPin size={14}/>{session.venue}</div></div></div>
    <div className="p-5"><div className="flex justify-between text-sm font-bold"><span className="flex items-center gap-2"><Clock3 size={16}/>{session.time}</span><span className={left<=2?'text-[#c94d31]':'text-[#527064]'}>เหลือ {left} ที่</span></div><div className="mt-3 flex gap-2 text-xs"><span className="rounded-lg bg-[#f1f5ef] px-2.5 py-1.5 font-bold">DUPR {session.dupr}</span><span className="rounded-lg bg-[#f1f5ef] px-2.5 py-1.5 font-bold">{session.joined}/{session.capacity} คน</span></div><div className="mt-4 flex items-center justify-between border-t border-[#edf0ea] pt-4"><span className="font-bold">Host {session.host}</span><ChevronRight size={20}/></div></div>
  </button>;
}

function MyGames({ sessions, onSelect }: { sessions:Session[]; onSelect:(s:Session)=>void }) {
  return <section><p className="text-xs font-black uppercase tracking-[.2em] text-[#73877e]">MY GAMES</p><h1 className="mt-1 text-3xl font-black">ก๊วนของฉัน</h1><div className="mt-6 grid gap-4 md:grid-cols-2">{sessions.map((s)=><article key={s.id} className="rounded-[26px] border border-[#e2e8df] bg-white p-5"><span className="inline-flex items-center gap-1 rounded-full bg-[#eaf8c8] px-2.5 py-1 text-xs font-black text-[#385316]"><CheckCircle2 size={13}/> จ่ายแล้ว</span><h2 className="mt-3 text-xl font-black">{s.title}</h2><p className="mt-1 text-sm text-[#65776e]">{s.venue}</p><div className="mt-5 grid grid-cols-2 gap-3"><InfoBox value={s.date} label="วันที่"/><InfoBox value={s.time} label="เวลา"/></div><button onClick={()=>onSelect(s)} className="mt-4 w-full rounded-2xl bg-[#b8f23a] px-4 py-3.5 text-sm font-black">ดูรายละเอียดก๊วน</button></article>)}{sessions.length===0&&<div className="rounded-[26px] border border-dashed border-[#cdd7cf] bg-white p-10 text-center text-[#6f8178]">ยังไม่มีก๊วนที่เข้าร่วม</div>}</div></section>;
}

function SessionSheet({ session, joined, onClose, onJoin }: { session:Session; joined:boolean; onClose:()=>void; onJoin:()=>void }) {
  return <ModalShell onClose={onClose}><div className="relative h-40 bg-[#17251f] p-5 text-white"><button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2"><X size={20}/></button><div className="absolute bottom-5"><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black">{session.date} • {session.time}</span><h2 className="mt-3 text-2xl font-black">{session.title}</h2></div></div><div className="p-5 pb-7"><div className="flex justify-between gap-4"><div><div className="flex items-center gap-2 font-black"><MapPin size={17}/>{session.venue}</div><p className="mt-1 text-sm text-[#6d7d75]">{session.area} • {session.courtCount} คอร์ต</p></div><div className="text-right"><div className="text-3xl font-black">฿{session.price}</div><div className="text-xs text-[#73847b]">ต่อคน</div></div></div><div className="mt-5 grid grid-cols-3 gap-2"><InfoBox value={`${session.joined}/${session.capacity}`} label="ผู้เล่น"/><InfoBox value={session.dupr} label="DUPR"/><InfoBox value={`${session.hostRating} ★`} label={`Host ${session.host}`}/></div><div className="mt-5 rounded-2xl bg-[#f4f7f1] p-4"><div className="flex items-center gap-2 font-black"><Sparkles size={18}/> Smart Match</div><p className="mt-2 text-sm leading-6 text-[#5f7168]">ระบบช่วยจัดคู่ตามระดับและหมุนคนลงสนามให้เวลาเล่นใกล้เคียงกัน มาคนเดียวก็เข้าก๊วนได้</p></div><div className="mt-6 flex items-center justify-between border-t pt-5"><div><div className="font-black">Host {session.host}</div><div className="text-xs text-[#718078]">ยืนยันตัวตนแล้ว • ⭐ {session.hostRating}</div></div><BadgeCheck className="text-[#4a7b55]"/></div><button disabled={joined} onClick={onJoin} className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 font-black ${joined?'bg-[#e8eee6] text-[#6e7b73]':'bg-[#b8f23a]'}`}>{joined?<><CheckCircle2 size={20}/> เข้าก๊วนแล้ว</>:<>จ่าย ฿{session.price} และเข้าก๊วน <ArrowUpRight size={19}/></>}</button></div></ModalShell>;
}

function CheckoutModal({ state, onClose, onPay, onFinish }: { state:NonNullable<CheckoutState>; onClose:()=>void; onPay:()=>void; onFinish:()=>void }) {
  const s=state.session;
  return <ModalShell onClose={state.step==='processing'?()=>{}:onClose}><div className="p-5 md:p-6">{state.step!=='success'&&<button onClick={onClose} className="mb-4 flex items-center gap-1 text-sm font-black text-[#607269]"><ArrowLeft size={17}/> กลับ</button>}{state.step==='success'?<div className="py-8 text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#b8f23a]"><CheckCircle2 size={38}/></div><h2 className="mt-5 text-2xl font-black">เข้าก๊วนเรียบร้อย</h2><p className="mt-2 text-sm text-[#66776e]">ระบบบันทึกที่นั่งของคุณแล้ว</p><button onClick={onFinish} className="mt-7 w-full rounded-2xl bg-[#17251f] py-4 font-black text-white">ไปที่ก๊วนของฉัน</button></div>:<><p className="text-xs font-black uppercase tracking-[.18em] text-[#718178]">CHECKOUT</p><h2 className="mt-1 text-2xl font-black">ยืนยันการเข้าก๊วน</h2><div className="mt-5 rounded-2xl bg-[#f4f7f1] p-4"><div className="font-black">{s.title}</div><div className="mt-1 text-sm text-[#6d7d75]">{s.venue} • {s.date} • {s.time}</div></div><div className="mt-5 space-y-3 text-sm"><MoneyRow label="ค่าร่วมก๊วน" value={s.price}/><MoneyRow label="ค่าบริการผู้เล่น" value={0}/><div className="border-t pt-3"><MoneyRow label="ยอดชำระ" value={s.price} bold/></div></div><div className="mt-5 rounded-2xl border border-[#dfe7dc] p-4"><div className="flex items-center gap-2 font-black"><QrCode size={18}/> PromptPay / Card</div><p className="mt-1 text-xs text-[#718078]">ชำระผ่าน Payment Gateway ของ Chick&Pick</p></div><button disabled={state.step==='processing'} onClick={onPay} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b8f23a] py-4 font-black">{state.step==='processing'?<><Loader2 className="animate-spin" size={20}/> กำลังยืนยันการชำระ</>:<>ชำระ ฿{s.price} <ShieldCheck size={18}/></>}</button></>}</div></ModalShell>;
}

function OrganizerDashboard({ session, onCreate }: { session:Session; onCreate:()=>void }) {
  const gross=session.price*session.capacity, paymentFee=gross*.025, margin=gross-session.venueCost-paymentFee, platform=margin*.25, organizer=margin-platform;
  return <section><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#73877e]">ORGANIZER</p><h1 className="mt-1 text-3xl font-black">หลังบ้านผู้จัดก๊วน</h1><p className="mt-2 text-sm text-[#6b7b73]">คน เงิน และยอดจ่ายสนามในหน้าเดียว</p></div><button onClick={onCreate} className="flex items-center justify-center gap-2 rounded-2xl bg-[#17251f] px-5 py-3 text-sm font-black text-white"><Plus size={17}/> สร้างก๊วนใหม่</button></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_.65fr]"><div className="rounded-[30px] bg-[#17251f] p-6 text-white"><span className="rounded-full bg-[#b8f23a] px-3 py-1.5 text-xs font-black text-[#17251f]">กำลังเปิดรับ</span><h2 className="mt-3 text-2xl font-black">{session.title}</h2><p className="mt-1 text-sm text-white/60">{session.venue} • {session.time}</p><div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4"><Stat value={`฿${formatBaht(gross)}`} label="ยอดรับเต็ม" dark/><Stat value={`${session.joined}/${session.capacity}`} label="จ่ายแล้ว" dark/><Stat value={`฿${formatBaht(session.venueCost)}`} label="ค่าสนาม" dark/><Stat value={`฿${formatBaht(organizer)}`} label="ส่วนผู้จัด" dark highlight/></div></div><div className="rounded-[30px] border bg-white p-6"><div className="flex items-center gap-2 font-black"><CircleDollarSign size={18}/> Settlement</div><div className="mt-4 space-y-3 text-sm"><MoneyRow label="ยอดขายเต็ม" value={gross}/><MoneyRow label="ค่าสนาม" value={-session.venueCost}/><MoneyRow label="Payment fee ~2.5%" value={-paymentFee}/><div className="border-t pt-3"><MoneyRow label="Margin" value={margin} bold/></div></div></div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-3"><div className="rounded-[26px] border bg-white p-5 lg:col-span-2"><div className="flex items-center justify-between"><div><div className="font-black">แบ่ง Margin หลังหักต้นทุน</div><p className="text-xs text-[#74837b]">Organizer 75% / Chick&Pick 25%</p></div><span className="rounded-full bg-[#f0f4ed] px-3 py-1.5 text-xs font-black">75 / 25</span></div><div className="mt-5 grid gap-3 md:grid-cols-2"><Stat value={`฿${formatBaht(organizer)}`} label="Organizer payable"/><Stat value={`฿${formatBaht(platform)}`} label="Chick&Pick revenue"/></div></div><div className="rounded-[26px] border bg-white p-5"><div className="flex items-center gap-2 font-black"><Building2 size={18}/> สนาม</div><div className="mt-5 text-3xl font-black">฿{formatBaht(session.venueCost)}</div><p className="mt-1 text-xs text-[#74837b]">{session.venue}</p><div className="mt-4 rounded-xl bg-[#fff7df] px-3 py-2 text-xs font-black text-[#8a6417]">● รอจ่ายหลังจบรอบ</div><button className="mt-4 w-full rounded-2xl bg-[#17251f] py-3.5 text-sm font-black text-white">จ่ายให้สนาม</button></div></div>
  </section>;
}

function CreateSessionModal({ onClose, onCreate }: { onClose:()=>void; onCreate:(draft:Omit<Session,'id'|'hostRating'|'joined'|'tags'>)=>void }) {
  const [form,setForm]=useState({title:'ก๊วนเย็น Chick&Pick',venue:'',area:'ขอนแก่น',date:'พรุ่งนี้',time:'18:00–20:00',price:190,capacity:12,dupr:'2.5–3.5',vibe:'ชิลล์ เน้นเล่นทั่วถึง',host:'Nui',courtCount:2,venueCost:800,status:'open' as const});
  const set=(k:string,v:string|number)=>setForm((p)=>({...p,[k]:v}));
  return <ModalShell onClose={onClose}><div className="p-5 md:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#718178]">NEW GAME</p><h2 className="text-2xl font-black">สร้างก๊วนใหม่</h2></div><button onClick={onClose}><X/></button></div><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="ชื่อก๊วน" value={form.title} onChange={(v)=>set('title',v)}/><Field label="สนาม" value={form.venue} onChange={(v)=>set('venue',v)} placeholder="ชื่อสนาม"/><Field label="พื้นที่" value={form.area} onChange={(v)=>set('area',v)}/><Field label="วัน" value={form.date} onChange={(v)=>set('date',v)}/><Field label="เวลา" value={form.time} onChange={(v)=>set('time',v)}/><Field label="DUPR" value={form.dupr} onChange={(v)=>set('dupr',v)}/><NumberField label="ราคา / คน" value={form.price} onChange={(v)=>set('price',v)}/><NumberField label="จำนวนผู้เล่น" value={form.capacity} onChange={(v)=>set('capacity',v)}/><NumberField label="จำนวนคอร์ต" value={form.courtCount} onChange={(v)=>set('courtCount',v)}/><NumberField label="ค่าสนามรวม" value={form.venueCost} onChange={(v)=>set('venueCost',v)}/></div><div className="mt-5 rounded-2xl bg-[#f4f7f1] p-4 text-sm"><div className="font-black">ประมาณการเมื่อเต็ม</div><div className="mt-2 flex justify-between"><span>ยอดรับ</span><b>฿{formatBaht(form.price*form.capacity)}</b></div><div className="mt-1 flex justify-between"><span>ค่าสนาม</span><b>-฿{formatBaht(form.venueCost)}</b></div></div><button disabled={!form.title||!form.venue} onClick={()=>onCreate(form)} className="mt-6 w-full rounded-2xl bg-[#17251f] py-4 font-black text-white disabled:opacity-40">เปิดรับก๊วนนี้</button></div></ModalShell>;
}

function Profile(){return <section className="mx-auto max-w-2xl"><div className="rounded-[30px] bg-[#17251f] p-7 text-white"><div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#b8f23a] text-3xl font-black text-[#17251f]">N</div><h1 className="mt-4 text-3xl font-black">Nui</h1><p className="mt-1 text-white/60">DUPR 3.21 • เล่นมาแล้ว 18 ก๊วน</p><div className="mt-6 grid grid-cols-3 gap-3"><Stat value="18" label="Games" dark/><Stat value="4.9" label="Rating" dark/><Stat value="86%" label="Show up" dark/></div></div></section>}
function ModalShell({children,onClose}:{children:React.ReactNode;onClose:()=>void}){return <div onMouseDown={onClose} className="fixed inset-0 z-50 flex items-end justify-center bg-[#101712]/55 backdrop-blur-sm md:items-center md:p-6"><div onMouseDown={(e)=>e.stopPropagation()} className="max-h-[94vh] w-full overflow-y-auto rounded-t-[32px] bg-white shadow-2xl md:max-w-xl md:rounded-[32px]">{children}</div></div>}
function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string}){return <label className="text-sm font-black">{label}<input value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-[#dce4da] bg-white px-3 py-3 font-semibold outline-none focus:border-[#7ca13b]"/></label>}
function NumberField({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}){return <label className="text-sm font-black">{label}<input type="number" value={value} onChange={(e)=>onChange(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-[#dce4da] bg-white px-3 py-3 font-semibold outline-none focus:border-[#7ca13b]"/></label>}
function Stat({value,label,dark=false,highlight=false}:{value:string;label:string;dark?:boolean;highlight?:boolean}){return <div className={`rounded-2xl p-4 ${dark?(highlight?'bg-[#b8f23a] text-[#17251f]':'bg-white/10'):'bg-[#f4f7f1]'}`}><div className="text-2xl font-black">{value}</div><div className={`mt-1 text-[11px] font-bold ${dark&&!highlight?'text-white/50':'text-[#687970]'}`}>{label}</div></div>}
function InfoBox({value,label}:{value:string;label:string}){return <div className="rounded-2xl bg-[#f4f7f1] p-3 text-center"><div className="text-sm font-black">{value}</div><div className="mt-1 text-[10px] font-bold text-[#77867e]">{label}</div></div>}
function MoneyRow({label,value,bold=false}:{label:string;value:number;bold?:boolean}){return <div className={`flex justify-between ${bold?'font-black':''}`}><span className="text-[#687970]">{label}</span><span className={value<0?'text-[#b8513a]':''}>{value<0?'-':''}฿{formatBaht(Math.abs(value))}</span></div>}
function NavButton({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}){return <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-black md:flex-row md:text-xs ${active?'bg-[#17251f] text-white':'text-[#6d7e76]'}`}>{icon}<span>{label}</span></button>}
