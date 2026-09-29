import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';

type AdminSection = 'dashboard' | 'games' | 'players' | 'organizers' | 'venues' | 'payments' | 'settlements' | 'refunds' | 'reports' | 'settings';

type GameRow = {
  id: string;
  title: string;
  venue: string;
  organizer: string;
  date: string;
  players: string;
  gmv: number;
  status: 'open' | 'full' | 'completed';
  settlement: 'pending' | 'ready' | 'paid';
};

const games: GameRow[] = [
  { id:'G-260916-01', title:'Wednesday Night Chicken', venue:'Smash Yard Pickleball', organizer:'Nui', date:'16 Sep • 18:00', players:'9/12', gmv:1710, status:'open', settlement:'pending' },
  { id:'G-260917-02', title:'Beginner Friendly', venue:'Chicken Court Club', organizer:'Bank', date:'17 Sep • 19:00', players:'6/12', gmv:1020, status:'open', settlement:'pending' },
  { id:'G-260918-03', title:'Friday Competitive Mix', venue:'North Court Arena', organizer:'Ploy', date:'18 Sep • 20:00', players:'16/16', gmv:3520, status:'full', settlement:'ready' },
  { id:'G-260914-04', title:'Sunday Social Rally', venue:'The Base Pickleball', organizer:'J', date:'14 Sep • 17:00', players:'12/12', gmv:1800, status:'completed', settlement:'paid' },
];

const payments = [
  { id:'PAY-91821', player:'Mint', game:'Wednesday Night Chicken', amount:190, method:'PromptPay', state:'paid' },
  { id:'PAY-91820', player:'Ton', game:'Friday Competitive Mix', amount:220, method:'Card', state:'paid' },
  { id:'PAY-91819', player:'Aom', game:'Beginner Friendly', amount:170, method:'PromptPay', state:'review' },
  { id:'PAY-91818', player:'Pete', game:'Wednesday Night Chicken', amount:190, method:'Card', state:'failed' },
];

const formatBaht = (value:number) => new Intl.NumberFormat('th-TH').format(Math.round(value));

export default function AdminDashboard() {
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => `${g.title} ${g.venue} ${g.organizer} ${g.id}`.toLowerCase().includes(q));
  }, [query]);

  const goToPlayerSite = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('admin');
    window.location.href = url.toString();
  };

  return (
    <div className="min-h-screen bg-[#f4f6f2] text-[#172019] lg:grid lg:grid-cols-[260px_1fr]">
      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] transform bg-[#14221b] text-white transition lg:static lg:w-auto lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-full flex-col p-5">
          <div className="flex items-center justify-between gap-3">
            <button onClick={goToPlayerSite} className="flex items-center gap-3 text-left">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#b8f23a] text-xl">🐔</div>
              <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-white/45">Control center</div><div className="text-lg font-black">CHICK&PICK</div></div>
            </button>
            <button onClick={() => setMenuOpen(false)} className="lg:hidden"><X size={20}/></button>
          </div>

          <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 font-black">N</div><div><div className="text-sm font-black">Super Admin</div><div className="text-[11px] text-white/45">Owner access</div></div></div>
          </div>

          <nav className="mt-6 space-y-1 overflow-y-auto">
            <SideItem active={section==='dashboard'} onClick={()=>setSection('dashboard')} icon={<LayoutDashboard size={18}/>} label="Dashboard"/>
            <SideItem active={section==='games'} onClick={()=>setSection('games')} icon={<Trophy size={18}/>} label="Games" badge="12"/>
            <SideItem active={section==='players'} onClick={()=>setSection('players')} icon={<UsersRound size={18}/>} label="Players"/>
            <SideItem active={section==='organizers'} onClick={()=>setSection('organizers')} icon={<UserRound size={18}/>} label="Organizers"/>
            <SideItem active={section==='venues'} onClick={()=>setSection('venues')} icon={<Building2 size={18}/>} label="Venues"/>
            <div className="my-4 border-t border-white/10"/>
            <SideItem active={section==='payments'} onClick={()=>setSection('payments')} icon={<CreditCard size={18}/>} label="Payments" badge="2"/>
            <SideItem active={section==='settlements'} onClick={()=>setSection('settlements')} icon={<WalletCards size={18}/>} label="Settlements" badge="3"/>
            <SideItem active={section==='refunds'} onClick={()=>setSection('refunds')} icon={<RefreshCcw size={18}/>} label="Refunds"/>
            <SideItem active={section==='reports'} onClick={()=>setSection('reports')} icon={<FileText size={18}/>} label="Reports"/>
            <SideItem active={section==='settings'} onClick={()=>setSection('settings')} icon={<Settings size={18}/>} label="Settings"/>
          </nav>

          <div className="mt-auto pt-5"><button onClick={goToPlayerSite} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-white/55 hover:bg-white/5 hover:text-white"><LogOut size={18}/> กลับหน้า Player</button></div>
        </div>
      </aside>

      {menuOpen && <button onClick={()=>setMenuOpen(false)} className="fixed inset-0 z-40 bg-black/30 lg:hidden"/>}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 bg-[#f4f6f2]/95 px-4 py-3 backdrop-blur-xl md:px-7">
          <div className="flex items-center gap-3"><button onClick={()=>setMenuOpen(true)} className="rounded-xl border bg-white p-2 lg:hidden"><Menu size={20}/></button><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#718178]">Super admin</div><div className="font-black">{sectionTitle(section)}</div></div></div>
          <div className="flex items-center gap-2"><button className="hidden rounded-xl border border-[#dce4da] bg-white px-3 py-2 text-xs font-black md:block">Export CSV</button><button onClick={goToPlayerSite} className="rounded-xl bg-[#17251f] px-3 py-2 text-xs font-black text-white">เปิดหน้าแอป</button></div>
        </header>

        <main className="p-4 md:p-7">
          {section === 'dashboard' ? <Dashboard query={query} setQuery={setQuery} games={filteredGames} onOpen={(s)=>setSection(s)} /> : <SectionPlaceholder section={section} onBack={()=>setSection('dashboard')} />}
        </main>
      </div>
    </div>
  );
}

function Dashboard({query,setQuery,games,onOpen}:{query:string;setQuery:(v:string)=>void;games:GameRow[];onOpen:(s:AdminSection)=>void}) {
  return <>
    <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div><p className="text-xs font-black uppercase tracking-[.2em] text-[#718178]">OVERVIEW</p><h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">ภาพรวม Chick&Pick</h1><p className="mt-2 text-sm font-semibold text-[#697970]">เงินเข้า เงินค้างจ่าย และสถานะก๊วนที่ต้องจัดการ</p></div>
      <div className="flex items-center gap-2 rounded-2xl border border-[#dce4da] bg-white px-3 py-2.5 shadow-sm xl:w-[330px]"><Search size={18} className="text-[#718178]"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="ค้นหาก๊วน สนาม หรือ Organizer" className="w-full bg-transparent text-sm font-semibold outline-none"/></div>
    </section>

    <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="GMV เดือนนี้" value="฿128,540" delta="+18.4%" icon={<CircleDollarSign/>} positive />
      <Metric title="รายได้ Chick&Pick" value="฿17,860" delta="+12.1%" icon={<Banknote/>} positive />
      <Metric title="รอจ่ายสนาม" value="฿24,600" delta="8 รายการ" icon={<Building2/>} />
      <Metric title="รอจ่าย Organizer" value="฿31,420" delta="6 รายการ" icon={<WalletCards/>} />
    </section>

    <section className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_.5fr]">
      <div className="rounded-[26px] border border-[#e1e7df] bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-black">เงินที่ต้องเคลียร์</h2><p className="mt-1 text-xs font-semibold text-[#748279]">Settlement queue จากก๊วนที่จบหรือใกล้จบ</p></div><button onClick={()=>onOpen('settlements')} className="text-xs font-black text-[#52705f]">ดูทั้งหมด →</button></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <QueueCard label="สนาม" value="฿24,600" count="8 รายการ" status="ต้องจ่าย" tone="amber"/>
          <QueueCard label="Organizer" value="฿31,420" count="6 รายการ" status="พร้อมถอน" tone="green"/>
          <QueueCard label="Refund" value="฿1,140" count="4 รายการ" status="รอตรวจ" tone="red"/>
        </div>
      </div>

      <div className="rounded-[26px] bg-[#17251f] p-5 text-white shadow-xl shadow-[#17251f]/10 md:p-6">
        <div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[.15em] text-white/45">Today</div><div className="mt-1 text-xl font-black">System health</div></div><ShieldCheck className="text-[#b8f23a]"/></div>
        <div className="mt-5 space-y-3"><HealthRow label="Payment gateway" state="ปกติ"/><HealthRow label="Settlement queue" state="3 ต้องจัดการ" warn/><HealthRow label="Failed payment" state="2 รายการ" warn/><HealthRow label="Open games" state="12 ก๊วน"/></div>
      </div>
    </section>

    <section className="mt-4 grid gap-4 2xl:grid-cols-[1.45fr_.55fr]">
      <div className="overflow-hidden rounded-[26px] border border-[#e1e7df] bg-white shadow-sm">
        <div className="flex items-center justify-between p-5 md:p-6"><div><h2 className="text-lg font-black">ก๊วนล่าสุด</h2><p className="mt-1 text-xs text-[#748279]">ติดตามยอดรับและ settlement แบบรวดเร็ว</p></div><button onClick={()=>onOpen('games')} className="text-xs font-black text-[#52705f]">จัดการก๊วน →</button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-[#f6f8f4] text-[11px] font-black uppercase tracking-[.08em] text-[#718178]"><tr><th className="px-5 py-3">Game</th><th className="px-4 py-3">Organizer</th><th className="px-4 py-3">Players</th><th className="px-4 py-3">GMV</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Settlement</th><th/></tr></thead><tbody className="divide-y divide-[#edf0ea]">{games.map((g)=><tr key={g.id} className="hover:bg-[#fafbf9]"><td className="px-5 py-4"><div className="font-black">{g.title}</div><div className="mt-1 text-xs text-[#77867e]">{g.venue} • {g.date}</div></td><td className="px-4 py-4 font-bold">{g.organizer}</td><td className="px-4 py-4 font-bold">{g.players}</td><td className="px-4 py-4 font-black">฿{formatBaht(g.gmv)}</td><td className="px-4 py-4"><StatusPill value={g.status}/></td><td className="px-4 py-4"><SettlementPill value={g.settlement}/></td><td className="px-4 py-4"><ChevronRight size={18} className="text-[#7a8981]"/></td></tr>)}</tbody></table></div>
      </div>

      <div className="rounded-[26px] border border-[#e1e7df] bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Payment alerts</h2><p className="mt-1 text-xs text-[#748279]">รายการที่ควรตรวจ</p></div><CreditCard size={20}/></div>
        <div className="mt-4 space-y-3">{payments.map((p)=><div key={p.id} className="rounded-2xl bg-[#f6f8f4] p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">{p.player} • ฿{p.amount}</div><div className="mt-1 line-clamp-1 text-xs text-[#748279]">{p.game}</div></div><PaymentPill state={p.state}/></div><div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-[#7b8982]"><span>{p.method}</span><span>{p.id}</span></div></div>)}</div>
        <button onClick={()=>onOpen('payments')} className="mt-4 w-full rounded-xl border border-[#dbe4d9] py-2.5 text-xs font-black">เปิด Payment Center</button>
      </div>
    </section>

    <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MiniStat icon={<Trophy size={18}/>} value="12" label="ก๊วนกำลังเปิด"/>
      <MiniStat icon={<UsersRound size={18}/>} value="428" label="ผู้เล่นทั้งหมด"/>
      <MiniStat icon={<UserRound size={18}/>} value="16" label="Organizer active"/>
      <MiniStat icon={<Building2 size={18}/>} value="23" label="สนามในระบบ"/>
    </section>
  </>;
}

function SectionPlaceholder({section,onBack}:{section:AdminSection;onBack:()=>void}) {
  return <section><button onClick={onBack} className="text-sm font-black text-[#577064]">← กลับ Dashboard</button><div className="mt-5 rounded-[30px] border border-[#e1e7df] bg-white p-8 md:p-12"><p className="text-xs font-black uppercase tracking-[.2em] text-[#718178]">ADMIN MODULE</p><h1 className="mt-2 text-3xl font-black">{sectionTitle(section)}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#697970]">โครงเมนูส่วนนี้ถูกเตรียมไว้ใน Super Admin แล้ว ขั้นถัดไปจะเชื่อมข้อมูลจริงจาก payment, settlement, organizer, venue และ transaction API</p><div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#edf6d8] px-4 py-2 text-xs font-black text-[#405719]"><CheckCircle2 size={15}/> พร้อมต่อ backend</div></div></section>;
}

function SideItem({active,onClick,icon,label,badge}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string;badge?:string}){return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active?'bg-[#b8f23a] text-[#17251f]':'text-white/60 hover:bg-white/5 hover:text-white'}`}>{icon}<span>{label}</span>{badge&&<span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-black ${active?'bg-[#17251f] text-white':'bg-white/10 text-white/70'}`}>{badge}</span>}</button>}
function Metric({title,value,delta,icon,positive=false}:{title:string;value:string;delta:string;icon:React.ReactNode;positive?:boolean}){return <div className="rounded-[24px] border border-[#e1e7df] bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef3ea] text-[#315442]">{icon}</div><span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${positive?'bg-[#eaf6d5] text-[#426019]':'bg-[#f2f4f0] text-[#718178]'}`}>{positive?<ArrowUpRight size={12}/>:<ArrowDownRight size={12}/>} {delta}</span></div><div className="mt-5 text-2xl font-black">{value}</div><div className="mt-1 text-xs font-semibold text-[#748279]">{title}</div></div>}
function QueueCard({label,value,count,status,tone}:{label:string;value:string;count:string;status:string;tone:'amber'|'green'|'red'}){const c={amber:'bg-[#fff5d9] text-[#815e10]',green:'bg-[#eaf6d5] text-[#426019]',red:'bg-[#fee9e4] text-[#9a432e]'}[tone];return <div className="rounded-2xl bg-[#f6f8f4] p-4"><div className="text-xs font-black text-[#748279]">{label}</div><div className="mt-2 text-2xl font-black">{value}</div><div className="mt-3 flex items-center justify-between"><span className="text-[11px] font-semibold text-[#77867e]">{count}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${c}`}>{status}</span></div></div>}
function HealthRow({label,state,warn=false}:{label:string;state:string;warn?:boolean}){return <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-3"><span className="text-xs font-semibold text-white/60">{label}</span><span className={`text-xs font-black ${warn?'text-[#ffd27a]':'text-[#b8f23a]'}`}>{state}</span></div>}
function StatusPill({value}:{value:GameRow['status']}){const map={open:['เปิดรับ','bg-[#eaf6d5] text-[#426019]'],full:['เต็ม','bg-[#e9efff] text-[#3159a6]'],completed:['จบแล้ว','bg-[#edf0ec] text-[#66756d]']} as const;const [label,cls]=map[value];return <span className={`rounded-full px-2 py-1 text-[10px] font-black ${cls}`}>{label}</span>}
function SettlementPill({value}:{value:GameRow['settlement']}){const map={pending:['รอจบรอบ','bg-[#fff5d9] text-[#815e10]'],ready:['พร้อมเคลียร์','bg-[#fee9e4] text-[#9a432e]'],paid:['จ่ายแล้ว','bg-[#eaf6d5] text-[#426019]']} as const;const [label,cls]=map[value];return <span className={`rounded-full px-2 py-1 text-[10px] font-black ${cls}`}>{label}</span>}
function PaymentPill({state}:{state:string}){if(state==='paid')return <span className="rounded-full bg-[#eaf6d5] px-2 py-1 text-[10px] font-black text-[#426019]">Paid</span>;if(state==='review')return <span className="rounded-full bg-[#fff5d9] px-2 py-1 text-[10px] font-black text-[#815e10]">Review</span>;return <span className="rounded-full bg-[#fee9e4] px-2 py-1 text-[10px] font-black text-[#9a432e]">Failed</span>}
function MiniStat({icon,value,label}:{icon:React.ReactNode;value:string;label:string}){return <div className="flex items-center gap-3 rounded-2xl border border-[#e1e7df] bg-white p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef3ea] text-[#315442]">{icon}</div><div><div className="text-xl font-black">{value}</div><div className="text-[11px] font-semibold text-[#748279]">{label}</div></div></div>}
function sectionTitle(section:AdminSection){return ({dashboard:'Dashboard',games:'Games & Sessions',players:'Players',organizers:'Organizers',venues:'Venues',payments:'Payments',settlements:'Settlements & Payouts',refunds:'Refunds',reports:'Reports',settings:'Settings'} as Record<AdminSection,string>)[section]}
