import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, CalendarCheck, CalendarDays, Check, ChevronRight,
  CircleDot, Clock3, Compass, Info, LockKeyhole, MapPin, MapPinned, Search,
  ShieldCheck, SlidersHorizontal, Sparkles, Ticket, UserRound, UsersRound, X, GraduationCap,
} from 'lucide-react';
import type { PublicSession, PublicParticipant, PlayerProfile, TransferAccount, SlipOcr } from './marketplaceTypes';
import { ParticipantDialog, ParticipantPreview, PlayerAvatar, PlayerDialog, ProfileEditor } from './PlayerParticipants';
import CoachPreview from './CoachPreview';
import './player-app.css';

type BookingView = { transferAccount: TransferAccount | null; id: string; sessionId: string; amount: number; title: string; createdAt: string; paidAt: string | null; admissionStatus: 'pending' | 'approved'; cancelledAt: string | null; receipt: { id: string; status: 'pending' | 'approved' | 'rejected'; ocr: SlipOcr; rejectReason: string | null } | null };
type PlayerTab = 'discover' | 'courts' | 'coaches' | 'tickets' | 'profile';
type GameFilter = 'all' | 'beginner' | 'social' | 'competitive';
type PlayerConfig = { liffId: string | null; connected: boolean; bookingEnabled: boolean };
const baht = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(n);
const filters: { id: GameFilter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'beginner', label: 'มือใหม่' },
  { id: 'social', label: 'ตีชิลล์' },
  { id: 'competitive', label: 'เกมเข้ม' },
];

async function api<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/player' + route, init);
  const value = await response.json();
  if (!response.ok) throw Error(value.message || 'เชื่อมต่อไม่สำเร็จ');
  return value as T;
}

function matchesFilter(session: PublicSession, filter: GameFilter) {
  if (filter === 'all') return true;
  const text = [session.title, session.dupr, session.vibe, ...session.tags].join(' ').toLowerCase();
  if (filter === 'beginner') return /มือใหม่|เริ่มต้น|beginner/.test(text);
  if (filter === 'social') return /ชิลล์|สบาย|เพื่อน|social/.test(text);
  return /เข้ม|จริงจัง|competitive/.test(text);
}

function CourtArt({ variant = 0 }: { variant?: number }) {
  return <span className={'pa-court-art pa-tone-' + variant % 3} aria-hidden="true">
    <span className="pa-court-art-lines"><i /><b /><em /></span>
    <span className="pa-court-art-ball"><CircleDot size={24} strokeWidth={2.5} /></span>
  </span>;
}

function SessionCard({ session, index, open, openProfile }: { session: PublicSession; index: number; open: () => void; openProfile: (p: PublicParticipant) => void }) {
  const left = Math.max(0, session.capacity - session.joined);
  return <article className="pa-game-card"><button type="button" className="pa-game-open" onClick={open} aria-label={'ดูก๊วน ' + session.title}>
    <CourtArt variant={index} />
    <span className="pa-game-body">
      <span className="pa-game-top"><span className="pa-date"><CalendarDays size={13} />{session.date}</span><span className={'pa-spots ' + (session.status === 'full' ? 'is-full' : '')}>{session.status === 'full' ? 'เต็มแล้ว' : 'ว่าง ' + left + ' ที่'}</span></span>
      <strong>{session.title}</strong>
      <span className="pa-game-place"><MapPin size={14} />{session.venue}</span>
      <span className="pa-game-footer"><span><b>฿{baht(session.price)}</b><small> / คน</small></span><span className="pa-card-arrow"><ArrowUpRight size={18} /></span></span>
    </span>
  </button><ParticipantPreview session={session} openProfile={openProfile} showAll={open} /></article>;
}

export default function PlayerApp() {
  const [sessions, setSessions] = useState<PublicSession[]>([]);
  const [bookings, setBookings] = useState<BookingView[]>([]);
  const [token, setToken] = useState('');
  const [person, setPerson] = useState('');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [config, setConfig] = useState<PlayerConfig>({ liffId: null, connected: false, bookingEnabled: false });
  const [tab, setTab] = useState<PlayerTab>('discover');
  const [filter, setFilter] = useState<GameFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sessions.find(session => session.id === selectedId) || null;
  const [participantId, setParticipantId] = useState<string | null>(null);
  const participant = (selected ? selected.participants : sessions.flatMap(session => session.participants)).find(p => p.id === participantId);
  useEffect(() => {
    const fromHash = () => { if (location.hash.startsWith('#player-')) { try { setParticipantId(decodeURIComponent(location.hash.slice(8))); } catch { setParticipantId(null); } } };
    fromHash(); window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  const closeParticipant = () => { setParticipantId(null); if (location.hash.startsWith('#player-')) history.replaceState(null, '', location.pathname + location.search); };
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([api<{ sessions: PublicSession[] }>('/sessions'), api<PlayerConfig>('/config')])
      .then(async ([catalog, settings]) => {
        if (!active) return;
        setSessions(catalog.sessions);
        setConfig(settings);
        if (!settings.liffId) return;
        try {
          const { default: liff } = await import('@line/liff');
          await liff.init({ liffId: settings.liffId });
          if (!active || !liff.isLoggedIn()) return;
          const idToken = liff.getIDToken();
          if (!idToken) return;
          const headers = { Authorization: 'Bearer ' + idToken };
          const [me, own] = await Promise.all([
            api<{ name: string; profile: PlayerProfile }>('/me', { headers }),
            api<{ bookings: BookingView[] }>('/bookings', { headers }),
          ]);
          if (active) { setToken(idToken); setPerson(me.name); setProfile(me.profile); setBookings(own.bookings); }
        } catch (cause) {
          if (active) setError('เชื่อม LINE ไม่สำเร็จ: ' + (cause as Error).message);
        }
      })
      .catch(cause => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => { if (document.visibilityState === 'visible') void api<{ sessions: PublicSession[] }>('/sessions').then(catalog => { if (active) setSessions(catalog.sessions); }).catch(() => {}); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  const saveProfile = async (value: PlayerProfile) => {
    if (!token || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ profile: PlayerProfile }>('/me/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ discoverable: value.discoverable, skill: value.skill, bio: value.bio }) });
      setProfile(result.profile);
      const catalog = await api<{ sessions: PublicSession[] }>('/sessions'); setSessions(catalog.sessions);
      setNotice(result.profile.discoverable ? 'บันทึกแล้ว เพื่อนเห็นโปรไฟล์หลังผู้จัดรับเข้าสนาม' : 'บันทึกแล้ว ซ่อนโปรไฟล์จากหน้าก๊วน');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const login = async () => {
    if (!config.liffId) return;
    try {
      const { default: liff } = await import('@line/liff');
      await liff.init({ liffId: config.liffId });
      if (!liff.isLoggedIn()) liff.login({ redirectUri: location.href });
    } catch (cause) { setError((cause as Error).message); }
  };

  const reserve = async () => {
    if (!selected || !token || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ repeated: boolean; message: string }>('/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ sessionId: selected.id }),
      });
      const [own, catalog] = await Promise.all([
        api<{ bookings: BookingView[] }>('/bookings', { headers: { Authorization: 'Bearer ' + token } }),
        api<{ sessions: PublicSession[] }>('/sessions'),
      ]);
      setBookings(own.bookings); setSessions(catalog.sessions);
      setNotice(result.repeated ? 'คุณมีการจองก๊วนนี้อยู่แล้ว' : result.message);
      setSelectedId(null); setTab('tickets');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const cancelBooking = async (booking: BookingView) => {
    if (!token || busy || !window.confirm('ยกเลิกการจองนี้และคืนที่นั่งให้ก๊วน?')) return;
    setBusy(true); setError('');
    try {
      await api('/bookings/' + encodeURIComponent(booking.id) + '/cancel', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      const [own, catalog] = await Promise.all([
        api<{ bookings: BookingView[] }>('/bookings', { headers: { Authorization: 'Bearer ' + token } }),
        api<{ sessions: PublicSession[] }>('/sessions'),
      ]);
      setBookings(own.bookings); setSessions(catalog.sessions); setNotice('ยกเลิกการจองแล้ว ที่นั่งกลับมาเปิดรับ');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const uploadReceipt = async (booking: BookingView, file?: File) => {
    if (!file || !token || busy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('เลือกภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB'); return; }
    setBusy(true); setError('');
    try {
      await api('/bookings/' + encodeURIComponent(booking.id) + '/receipt', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': file.type }, body: file });
      const own = await api<{ bookings: BookingView[] }>('/bookings', { headers: { Authorization: 'Bearer ' + token } });
      setBookings(own.bookings); setNotice('ส่งสลิปแล้ว รอแอดมินตรวจสอบ');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const available = useMemo(() => sessions
    .filter(session => session.status !== 'completed')
    .filter(session => matchesFilter(session, filter))
    .filter(session => (session.title + ' ' + session.venue + ' ' + session.area).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)), [sessions, filter, query]);
  const upcoming = sessions.filter(session => session.status !== 'completed');
  const openSeats = upcoming.reduce((sum, session) => sum + Math.max(0, session.capacity - session.joined), 0);
  const venues = [...new Map(upcoming.map(session => [session.venue, session])).values()];
  const navigate = (next: PlayerTab) => { setTab(next); setError(''); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const showVenue = (venue: string) => { setFilter('all'); setQuery(venue); navigate('discover'); };

  return <div className="player-app">
    <a className="pa-skip" href="#player-content">ข้ามไปเนื้อหา</a>
    <header className="pa-header">
      <button className="pa-brand" type="button" onClick={() => navigate('discover')} aria-label="ไปหน้าแรก Chick&Pick">
        <span className="pa-brand-icon"><img src="/brand/chick-pick-mark.png" alt="" /></span>
        <span className="pa-brand-name">Chick<span>&</span>Pick<small>PLAY GOOD. FEEL GOOD.</small></span>
      </button>
      <button className="pa-header-action" type="button" onClick={() => navigate('tickets')} aria-label="ดูการจองของฉัน">
        <Ticket size={20} />
        {bookings.length > 0 && <i aria-hidden="true" />}
      </button>
    </header>
    <main className="pa-main" id="player-content">
      {notice && <p className="pa-message pa-success" role="status"><Check size={17} />{notice}</p>}
      {error && <p className="pa-message pa-error" role="alert"><Info size={17} />{error}</p>}

      {tab === 'discover' && <>
        <div className="pa-welcome">
          <span className="pa-location"><MapPin size={14} />ขอนแก่น <ChevronRight size={13} /></span>
          <div className="pa-heading-row"><div><small>YOUR COURT STARTS HERE</small><h1>มาเล่นกัน<span>.</span></h1><p>ก๊วนดี ๆ เพื่อนใหม่ ๆ รออยู่ที่สนาม</p></div><span className="pa-welcome-icon"><Sparkles size={23} /></span></div>
        </div>
        <section className="pa-hero" aria-label="ค้นหาก๊วน Chick&Pick">
          <div className="pa-hero-text"><span className="pa-hero-kicker"><span />THE GAME IS ON</span><h2>มาคนเดียว<br /><em>กลับไปมีก๊วน</em></h2><p>เลือกเกมที่ใช่ แล้วเจอกันในคอร์ท</p><button type="button" onClick={() => document.getElementById('open-games')?.scrollIntoView({ behavior: 'smooth' })}>ดูก๊วนที่เปิดรับ <ArrowRight size={17} /></button></div>
          <div className="pa-hero-orbit" aria-hidden="true"><span /><i /></div>
          <img src="/chicken-court-3d.webp" alt="" />
          <span className="pa-hero-bottom" aria-hidden="true">GOOD PEOPLE · GREAT GAMES</span>
        </section>
        <div className="pa-pulse"><span><span className="pa-pulse-icon"><CalendarCheck size={18} /></span><b>{upcoming.length}<small>ก๊วนที่เปิดรับ</small></b></span><i /><span><span className="pa-pulse-icon"><UsersRound size={18} /></span><b>{openSeats}<small>ที่ว่างทั้งหมด</small></b></span></div>
        <div className="pa-section-heading" id="open-games"><div><span>FIND YOUR GAME</span><h2>หาก๊วนที่ใช่</h2></div><span className="pa-count">{available.length} ก๊วน</span></div>
        <label className="pa-search"><Search size={19} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาก๊วนหรือสนาม" aria-label="ค้นหาก๊วนหรือสนาม" />{query && <button type="button" onClick={() => setQuery('')} aria-label="ล้างคำค้นหา"><X size={16} /></button>}</label>
        <div className="pa-filter-heading"><span><SlidersHorizontal size={15} /> เลือกสไตล์การเล่น</span></div>
        <div className="pa-filters" role="group" aria-label="ตัวกรองสไตล์ก๊วน">{filters.map(option => <button type="button" key={option.id} className={filter === option.id ? 'active' : ''} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>)}</div>
        {loading ? <div className="pa-loading" role="status"><span /><span /><span /></div> : available.length ? <div className="pa-game-list">{available.map((session, index) => <SessionCard key={session.id} session={session} index={index} open={() => setSelectedId(session.id)} openProfile={person => setParticipantId(person.id)} />)}</div> : <div className="pa-empty"><Compass size={28} /><b>ยังไม่เจอก๊วนที่ตรงใจ</b><p>ลองเปลี่ยนคำค้นหาหรือตัวกรองดูนะ</p><button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>ดูก๊วนทั้งหมด <ArrowRight size={15} /></button></div>}
        <div className="pa-integrity"><ShieldCheck size={18} /><span>การจองในแอปยังเป็นโหมดทดลอง ไม่มีการเรียกเก็บเงินจริง</span></div>
      </>}

      {tab === 'courts' && <>
        <div className="pa-page-intro"><span>PLACES TO PLAY</span><h1>สนามของเรา<span>.</span></h1><p>เลือกสนาม แล้วดูว่ามีก๊วนไหนกำลังเปิดรับ</p></div>
        <div className="pa-court-list">{venues.length ? venues.map((session, index) => {
          const count = upcoming.filter(item => item.venue === session.venue).length;
          return <button type="button" className="pa-venue-card" key={session.venue} onClick={() => showVenue(session.venue)}><CourtArt variant={index} /><span><small><MapPinned size={13} />{session.area}</small><strong>{session.venue}</strong><em>{count} ก๊วนที่เปิดรับ</em></span><span className="pa-venue-arrow"><ArrowUpRight size={20} /></span></button>;
        }) : <div className="pa-empty"><MapPinned size={28} /><b>ยังไม่มีสนามที่เปิดก๊วน</b><p>ก๊วนใหม่จะแสดงที่นี่เมื่อผู้จัดเปิดรับ</p></div>}</div>
      </>}

      {tab === 'coaches' && <CoachPreview />}

      {tab === 'tickets' && <>
        <div className="pa-page-intro"><span>MY COURT TIME</span><h1>การจองของฉัน<span>.</span></h1><p>{token ? 'ก๊วนที่ผูกกับบัญชี LINE ของคุณ' : 'เชื่อม LINE เพื่อดูการจองของตัวเอง'}</p></div>
        {!token ? <div className="pa-state-card"><span><LockKeyhole size={27} /></span><h2>การจองอยู่ในบัญชีของคุณ</h2><p>เมื่อเชื่อม LINE แล้ว จะแสดงเฉพาะก๊วนที่คุณจองไว้</p>{config.connected ? <button type="button" onClick={login}>เชื่อม LINE <ArrowRight size={17} /></button> : <small>LINE Mini App ยังไม่ได้ตั้งค่า</small>}</div> : bookings.length ? <div className="pa-ticket-list">{bookings.map(booking => {
          const session = sessions.find(item => item.id === booking.sessionId);
          return <article className="pa-ticket" key={booking.id}><div className="pa-ticket-head"><span><Ticket size={16} /> COURT PASS</span><span className={booking.admissionStatus === 'approved' ? 'paid' : ''}>{booking.cancelledAt ? 'ยกเลิกแล้ว' : booking.admissionStatus === 'approved' ? 'ผู้จัดรับเข้าสนามแล้ว' : booking.paidAt ? 'ตรวจเงินแล้ว · รอผู้จัดเลือกเข้าสนาม' : booking.receipt?.status === 'pending' ? 'ส่งสลิปแล้ว · รอตรวจ' : booking.receipt?.status === 'rejected' ? 'สลิปไม่ผ่าน · ส่งใหม่ได้' : 'ยังไม่ชำระเงิน'}</span></div><div className="pa-ticket-main"><small>{session?.date || 'วันที่ก๊วน'} · {session?.time || 'ดูรายละเอียดกับผู้จัด'}</small><h2>{booking.title}</h2><p><MapPin size={14} />{session?.venue || 'รายละเอียดสนาม'}</p></div><div className="pa-ticket-foot"><span>เลขจอง <b>{booking.id.slice(0, 8).toUpperCase()}</b></span><strong>฿{baht(booking.amount / 100)}</strong></div>{!booking.cancelledAt && !booking.paidAt && <div className="pa-transfer-instructions"><b>ข้อมูลสำหรับทดลองส่งสลิป</b>{booking.transferAccount ? <><span>{booking.transferAccount.bankName} · {booking.transferAccount.accountName}</span><strong>{booking.transferAccount.accountNumber}</strong></> : <span>ผู้จัดยังไม่ได้ตั้งบัญชีสำหรับรายการนี้</span>}<small>ยังไม่เปิดรับเงินจริง ใช้ภาพทดสอบเท่านั้น แอดมินจะตรวจสลิปก่อนยืนยัน</small></div>}{booking.receipt?.rejectReason && <p className="pa-slip-note" role="alert">แอดมินแจ้ง: {booking.receipt.rejectReason}</p>}{booking.receipt?.ocr.status === 'complete' && <details className="pa-slip-ocr"><summary>ข้อมูลที่ OCR อ่านได้ · กรุณาตรวจความถูกต้อง</summary><pre>{JSON.stringify(booking.receipt.ocr, null, 2)}</pre></details>}{booking.receipt?.ocr.status === 'failed' && <p className="pa-slip-note">OCR อ่านภาพไม่สำเร็จ แอดมินยังตรวจภาพสลิปได้</p>}{!booking.cancelledAt && !booking.paidAt && booking.receipt?.status !== 'pending' && <label className="pa-slip-upload">{busy ? 'กำลังส่งสลิป…' : booking.receipt?.status === 'rejected' ? 'ถ่ายรูปหรือเลือกสลิปใหม่' : 'ถ่ายรูปหรือแนบสลิปโอนเงิน'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { void uploadReceipt(booking, event.target.files?.[0]); event.target.value = ''; }} /></label>}{!booking.cancelledAt && !booking.paidAt && booking.receipt?.status !== 'pending' && booking.admissionStatus !== 'approved' && session && Date.parse(session.startsAt) > Date.now() && <button type="button" className="pa-cancel-booking" disabled={busy} onClick={() => cancelBooking(booking)}>ยกเลิกการจอง</button>}</article>;
        })}</div> : <div className="pa-empty"><Ticket size={28} /><b>ยังไม่มีการจอง</b><p>เริ่มจากเลือกก๊วนที่อยากไปเล่น</p><button type="button" onClick={() => navigate('discover')}>ไปหาก๊วน <ArrowRight size={15} /></button></div>}
      </>}

      {tab === 'profile' && <>
        <div className="pa-page-intro"><span>YOUR PLAYER SPACE</span><h1>สวัสดี นักเล่น<span>.</span></h1><p>ทุกเกมที่ดี เริ่มจากเพื่อนร่วมคอร์ท</p></div>
        <section className="pa-profile-card"><div className="pa-profile-mark">{profile ? <PlayerAvatar person={profile} large /> : <UserRound size={32} />}</div><span className="pa-profile-state">{person ? <><Check size={13} /> เชื่อม LINE แล้ว</> : 'PLAYER PROFILE'}</span><h2>{person || 'ผู้เล่นคนใหม่'}</h2><p>{person ? 'พร้อมเจอกันที่สนาม' : 'เชื่อม LINE เพื่อเก็บการจองไว้กับบัญชีของคุณ'}</p>{config.connected && !token && <button type="button" onClick={login}>เชื่อมบัญชี LINE <ArrowRight size={16} /></button>}</section>
        {profile && <ProfileEditor profile={profile} busy={busy || !config.bookingEnabled} save={saveProfile} />}
        <div className="pa-profile-stats"><span><b>{bookings.length}</b><small>ก๊วนที่จอง</small></span><span><b>{bookings.filter(booking => booking.paidAt).length}</b><small>ยืนยันรับเงิน</small></span></div>
        <section className="pa-profile-guide"><h2>เริ่มเล่นง่าย ๆ</h2><div><span>01</span><p><b>เลือกก๊วน</b><small>ดูสนาม เวลา และระดับที่เหมาะกับคุณ</small></p></div><div><span>02</span><p><b>จองผ่าน LINE</b><small>ใช้บัญชีของคุณเพื่อเก็บรายการจอง</small></p></div><div><span>03</span><p><b>เจอกันที่สนาม</b><small>ตรวจรายละเอียดกับผู้จัดก่อนเดินทาง</small></p></div></section>
        <div className="pa-integrity"><ShieldCheck size={18} /><span>ระบบจองและยอดเงินยังอยู่ในโหมดทดลอง</span></div>
      </>}
    </main>
    <nav className="pa-nav" aria-label="เมนูผู้เล่น">{([
      ['discover', Compass, 'หน้าแรก'],
      ['courts', MapPinned, 'สนาม'],
      ['coaches', GraduationCap, 'โค้ช'],
      ['tickets', Ticket, 'การจอง'],
      ['profile', UserRound, 'โปรไฟล์'],
    ] as const).map(([id, Icon, label]) => <button type="button" key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => navigate(id)}><span className="pa-nav-icon"><Icon size={21} strokeWidth={tab === id ? 2.4 : 1.9} /></span><span>{label}</span></button>)}</nav>

    {selected && <PlayerDialog label="รายละเอียดก๊วน" close={() => { setParticipantId(null); setSelectedId(null); }}><div className="pa-modal-art"><CourtArt /><img src="/chicken-court-3d.webp" alt="" /></div><span className="pa-modal-eyebrow"><Sparkles size={14} /> YOUR NEXT GOOD GAME</span><h2>{selected.title}</h2><p className="pa-modal-place"><MapPin size={16} />{selected.venue} · {selected.area}</p><div className="pa-modal-facts"><span><CalendarDays size={18} /><b>{selected.date}</b><small>{selected.time}</small></span><span><UsersRound size={18} /><b>{selected.joined}/{selected.capacity}</b><small>จองแล้ว</small></span><span><CircleDot size={18} /><b>{selected.courtCount} คอร์ท</b><small>{selected.dupr}</small></span></div><ParticipantPreview session={selected} full openProfile={person => setParticipantId(person.id)} /><div className="pa-modal-host"><span><UserRound size={17} /></span><div><small>ดูแลก๊วนโดย</small><b>{selected.host}</b></div><em>{selected.vibe}</em></div>{profile && <label className="pa-visibility pa-join-visibility"><input type="checkbox" role="switch" checked={profile.discoverable} disabled={busy || !config.bookingEnabled} onChange={event => void saveProfile({ ...profile, discoverable: event.target.checked })} /><span><b>แสดงโปรไฟล์ของฉันเมื่อผู้จัดรับเข้าสนาม</b><small>ชื่อ รูป ระดับ และคำแนะนำตัวจะแสดงหลังผู้จัดรับเข้าสนาม ปิดได้ทุกเมื่อที่หน้าโปรไฟล์</small></span></label>}{error && <p className="pa-message pa-error" role="alert">{error}</p>}<div className="pa-modal-foot"><div><small>ค่าร่วมก๊วน / คน</small><strong>฿{baht(selected.price)}</strong></div>{!config.bookingEnabled ? <button type="button" disabled>ยังไม่เปิดจองผ่าน LINE</button> : token ? <button type="button" disabled={busy || selected.status !== 'open'} onClick={reserve}>{busy ? 'กำลังบันทึก…' : selected.status === 'full' ? 'ก๊วนเต็มแล้ว' : 'จองทดลอง'}<ArrowRight size={17} /></button> : <button type="button" onClick={login}>เชื่อม LINE ก่อนจอง <ArrowRight size={16} /></button>}</div><p className="pa-modal-note"><Info size={13} />ยังไม่มีการเรียกเก็บเงินจริง</p></PlayerDialog>}
    {participant && <ParticipantDialog person={participant} close={closeParticipant} />}
  </div>;
}
