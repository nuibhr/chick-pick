import StripeBookingPayment from './StripeBookingPayment';
import SlipVerificationStatus from './SlipVerificationStatus';
import PlayerTransferInstructions from './PlayerTransferInstructions';
import { paymentTicketLabel } from './paymentPresentation';
import { paymentHoldExpired } from './bookingHold';
import BookingHoldNotice from './BookingHoldNotice';
import type { StripePayment } from './paymentTypes';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, CalendarCheck, CalendarDays, Check, ChevronRight,
  CircleDot, Clock3, Compass, Info, LockKeyhole, MapPin, MapPinned, Search,
  ShieldCheck, SlidersHorizontal, Sparkles, Ticket, UserRound, UsersRound, X, GraduationCap, Moon, Sun,
} from 'lucide-react';
import type { PublicSession, PublicParticipant, PlayerProfile, TransferAccount, SlipOcr } from './marketplaceTypes';
import { ParticipantDialog, ParticipantPreview, PlayerAvatar, PlayerDialog, ProfileEditor } from './PlayerParticipants';
import CoachPreview from './PlayerCoaches';
import PlayerHero from './PlayerHero';
import { PlayerThemeSettings, usePlayerTheme } from './PlayerTheme';
import { playStyles, sessionPlayStyle, type PlayStyle } from './playerPresentation';
import { playerTabFromLocation, playerTabUrl, type PlayerTab } from './playerNavigation';
import { initializeLine, reauthenticateLine } from './lineSession';
import type { Venue } from './venueTypes';
import './player-app.css';

type BookingView = { stripe?: Pick<StripePayment, 'status' | 'mode' | 'expiresAt' | 'issue'> | null; holdExpiresAt?: string | null; holdExpired?: boolean; kind?: 'game' | 'coaching'; startsAt?: string; venue?: string; completed?: boolean; transferAccount: TransferAccount | null; id: string; sessionId: string; amount: number; title: string; createdAt: string; paidAt: string | null; admissionStatus: 'pending' | 'approved'; cancelledAt: string | null; receipt: { id: string; status: 'pending' | 'approved' | 'rejected'; ocr: SlipOcr; verification?: import('../cloudflare/slipok').SlipVerification; rejectReason: string | null } | null };
type OwnBookings = { bookings: BookingView[]; serverNow?: number };
type PlayerConfig = { slipokConfigured?: boolean; paymentProvider?: 'manual' | 'stripe'; stripeConfigured?: boolean; stripeMode?: 'test' | 'live' | null; liffId: string | null; connected: boolean; bookingEnabled: boolean; profileEditingEnabled?: boolean; pilot?: boolean };
const baht = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(n);

async function api<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/player' + route, init);
  const value = await response.json();
  if (!response.ok) throw Object.assign(Error(value.message || 'เชื่อมต่อไม่สำเร็จ'), { status: response.status });
  return value as T;
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
  const [registeredVenues, setRegisteredVenues] = useState<Venue[]>([]);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [bookings, setBookings] = useState<BookingView[]>([]);
  const [serverOffset, setServerOffset] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());
  const setOwnBookings = (own: OwnBookings) => {
    setBookings(own.bookings);
    if (typeof own.serverNow === 'number') { const offset = own.serverNow - Date.now(); setServerOffset(offset); setClockNow(Date.now() + offset); }
  };
  const [token, setToken] = useState('');
  const [person, setPerson] = useState('');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [config, setConfig] = useState<PlayerConfig>({ liffId: null, connected: false, bookingEnabled: false });
  const [tab, setTab] = useState<PlayerTab>(() => playerTabFromLocation(location.search, location.hash));
  const [filter, setFilter] = useState<PlayStyle | null>(null);
  const positions = useRef<Partial<Record<PlayerTab, number>>>({});
  useLayoutEffect(() => {
    window.scrollTo({ top: positions.current[tab] || 0, behavior: 'instant' });
  }, [tab]);
  const { theme, preference, choose } = usePlayerTheme();
  const canEditProfile = config.profileEditingEnabled ?? config.bookingEnabled;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sessions.find(session => session.id === selectedId) || null;
  const [participantId, setParticipantId] = useState<string | null>(null);
  const participant = (selected ? selected.participants : sessions.flatMap(session => session.participants)).find(p => p.id === participantId);
  useEffect(() => {
    const fromHash = () => {
      if (location.hash.startsWith('#view-')) setTab(playerTabFromLocation(location.search, location.hash));
      if (location.hash.startsWith('#player-')) { try { setParticipantId(decodeURIComponent(location.hash.slice(8))); } catch { setParticipantId(null); } }
    };
    fromHash(); window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  const closeParticipant = () => { setParticipantId(null); if (location.hash.startsWith('#player-')) history.replaceState(null, '', location.pathname + location.search); };
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const handleUnauthorized = (cause: unknown) => { if ((cause as { status?: number })?.status === 401) { setNeedsAuth(true); setToken(''); setProfile(null); setPerson(''); setBookings([]); } };

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
          await initializeLine(liff, settings.liffId);
          if (!active || !liff.isLoggedIn()) return;
          const idToken = liff.getIDToken();
          if (!idToken) throw Error('ยังไม่ได้รับสิทธิ์ยืนยันตัวตน กรุณาปิดแล้วเปิด MINI App ใหม่');
          const headers = { Authorization: 'Bearer ' + idToken };
          const [me, own] = await Promise.all([
            api<{ name: string; profile: PlayerProfile }>('/me', { headers }),
            api<OwnBookings>('/bookings', { headers }),
          ]);
          if (active) { setToken(idToken); setPerson(me.name); setProfile(me.profile); setOwnBookings(own); }
        } catch (cause) {
          if (active) { handleUnauthorized(cause); setError('เชื่อม LINE ไม่สำเร็จ: ' + (cause as Error).message); }
        }
      })
      .catch(cause => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { const controller = new AbortController(); fetch('/api/venues', { signal: controller.signal }).then(async r => { if (r.ok) setRegisteredVenues((await r.json()).venues); }).catch(() => {}); return () => controller.abort(); }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => { if (document.visibilityState === 'visible') void api<{ sessions: PublicSession[] }>('/sessions').then(catalog => { if (active) setSessions(catalog.sessions); }).catch(() => {}); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void api<OwnBookings>('/bookings', { headers: { Authorization: 'Bearer ' + token } })
        .then(own => { if (active) setOwnBookings(own); })
        .catch(cause => { if (active) { handleUnauthorized(cause); setError((cause as Error).message); } });
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [token]);

  const ticking = bookings.some(b => b.holdExpiresAt && !b.cancelledAt && !b.paidAt && b.receipt?.status !== 'pending' && !paymentHoldExpired(b, clockNow));
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setClockNow(Date.now() + serverOffset), 1000);
    const sync = () => setClockNow(Date.now() + serverOffset);
    window.addEventListener('focus', sync);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', sync); };
  }, [ticking, serverOffset]);
  const expiredKey = bookings.filter(b => paymentHoldExpired(b, clockNow)).map(b => b.id).join(',');
  useEffect(() => {
    let active = true, running = false;
    const refresh = async () => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      try { const catalog = await api<{ sessions: PublicSession[] }>('/sessions'); if (active) setSessions(catalog.sessions); }
      catch { /* A stale catalog cannot override the transactional booking check. */ }
      finally { running = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [expiredKey]);

  const saveProfile = async (value: PlayerProfile) => {
    if (!token || busy || !canEditProfile) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ profile: PlayerProfile }>('/me/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ discoverable: value.discoverable, skill: value.skill, bio: value.bio }) });
      setProfile(result.profile);
      setNotice(result.profile.discoverable ? 'บันทึกแล้ว เพื่อนเห็นโปรไฟล์หลังผู้จัดรับเข้าสนาม' : 'บันทึกแล้ว ซ่อนโปรไฟล์จากหน้าก๊วน');
      void api<{ sessions: PublicSession[] }>('/sessions').then(catalog => setSessions(catalog.sessions)).catch(() => {});
    } catch (cause) { handleUnauthorized(cause); setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const login = async () => {
    if (!config.liffId || busy) return;
    setBusy(true); setError('');
    try {
      const { default: liff } = await import('@line/liff');
      await initializeLine(liff, config.liffId);
      if (needsAuth) { const result = reauthenticateLine(liff, location.origin + playerTabUrl('/miniapp', '?organizer=0', tab)); if (result === 'reopen') setError('ปิดหน้าต่างนี้ แล้วเปิดจาก Rich Menu อีกครั้งเพื่อรับสิทธิ์ LINE ใหม่'); return; }
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      const idToken = liff.getIDToken();
      if (!idToken) throw Error('ยังไม่ได้รับสิทธิ์ยืนยันตัวตน กรุณาปิดแล้วเปิด MINI App ใหม่');
      const headers = { Authorization: 'Bearer ' + idToken };
      const [me, own] = await Promise.all([
        api<{ name: string; profile: PlayerProfile }>('/me', { headers }),
        api<OwnBookings>('/bookings', { headers }),
      ]);
      setToken(idToken); setPerson(me.name); setProfile(me.profile); setOwnBookings(own);
      setNeedsAuth(false);
    } catch (cause) { handleUnauthorized(cause); setError((cause as Error).message); }
    finally { setBusy(false); }
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
        api<OwnBookings>('/bookings', { headers: { Authorization: 'Bearer ' + token } }),
        api<{ sessions: PublicSession[] }>('/sessions'),
      ]);
      setOwnBookings(own); setSessions(catalog.sessions);
      setNotice(result.repeated ? 'คุณมีการจองก๊วนนี้อยู่แล้ว' : result.message);
      setSelectedId(null); setTab('tickets');
    } catch (cause) { handleUnauthorized(cause); setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const cancelBooking = async (booking: BookingView) => {
    if (!token || busy || !window.confirm('ยกเลิกการจองนี้และคืนที่นั่งให้ก๊วน?')) return;
    setBusy(true); setError('');
    try {
      await api((booking.kind === 'coaching' ? '/lessons/' : '/bookings/') + encodeURIComponent(booking.id) + '/cancel', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
      const [own, catalog] = await Promise.all([
        api<OwnBookings>('/bookings', { headers: { Authorization: 'Bearer ' + token } }),
        api<{ sessions: PublicSession[] }>('/sessions'),
      ]);
      setOwnBookings(own); setSessions(catalog.sessions); setNotice('ยกเลิกการจองแล้ว ที่นั่งกลับมาเปิดรับ');
    } catch (cause) { handleUnauthorized(cause); setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const uploadReceipt = async (booking: BookingView, file?: File) => {
    if (!file || !token || busy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('เลือกภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB'); return; }
    setBusy(true); setError('');
    try {
      const submitted = await api<{ receipt: { verification?: import('../cloudflare/slipok').SlipVerification } }>((booking.kind === 'coaching' ? '/lessons/' : '/bookings/') + encodeURIComponent(booking.id) + '/receipt', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': file.type }, body: file });
      const own = await api<OwnBookings>('/bookings', { headers: { Authorization: 'Bearer ' + token } });
      setOwnBookings(own); setNotice(submitted.receipt?.verification?.status === 'verified' ? 'SlipOK ตรวจผ่านแล้ว รอแอดมินอนุมัติเงิน' : submitted.receipt?.verification?.status === 'rejected' ? 'ภาพส่งถึงระบบแล้ว แต่ SlipOK ไม่ผ่าน กรุณาดูเหตุผลในรายการจอง' : 'ภาพส่งถึงระบบแล้ว รอผู้จัดตรวจ ไม่ต้องโอนซ้ำ');
    } catch (cause) { handleUnauthorized(cause); setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const available = useMemo(() => sessions
    .filter(session => session.status !== 'completed')
    .filter(session => !filter || sessionPlayStyle(session) === filter)
    .filter(session => (session.title + ' ' + session.venue + ' ' + session.area).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)), [sessions, filter, query]);
  const upcoming = sessions.filter(session => session.status !== 'completed');
  const openSeats = upcoming.reduce((sum, session) => sum + Math.max(0, session.capacity - session.joined), 0);
  const venues = [...new Map([...upcoming.map(s => [s.venue, { venue: s.venue, area: s.area }] as const), ...registeredVenues.map(v => [v.name, { venue: v.name, area: v.area }] as const)]).values()];
  const navigate = (next: PlayerTab) => {
    positions.current[tab] = window.scrollY;
    setTab(next); setError('');
    history.replaceState(null, '', playerTabUrl(location.pathname, location.search, next));
  };
  const showVenue = (venue: string) => { setFilter(null); setQuery(venue); navigate('discover'); };

  return <div className="player-app" data-theme={theme}>
    <a className="pa-skip" href="#player-content">ข้ามไปเนื้อหา</a>
    <header className="pa-header">
      <button className="pa-brand" type="button" onClick={() => navigate('discover')} aria-label="ไปหน้าแรก Chick&Pick">
        <span className="pa-brand-icon"><img src="/brand/chick-pick-mark.png" alt="" /></span>
        <span className="pa-brand-name">Chick<span>&</span>Pick<small>PLAY GOOD. FEEL GOOD.</small></span>
      </button>
      <div className="pa-header-actions"><button className="pa-header-action" type="button" onClick={() => navigate('profile')} aria-label="ตั้งค่าธีมหน้าจอ">{theme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}</button><button className="pa-header-action" type="button" onClick={() => navigate('tickets')} aria-label="ดูการจองของฉัน">
        <Ticket size={20} />
        {bookings.length > 0 && <i aria-hidden="true" />}
      </button></div>
    </header>
    <main className="pa-main" id="player-content">
      {notice && <p className="pa-message pa-success" role="status"><Check size={17} />{notice}</p>}
      {error && <p className="pa-message pa-error" role="alert"><Info size={17} />{error}</p>}
      {needsAuth && <button type="button" className="pa-auth-retry" disabled={busy} onClick={login}>เข้าสู่ LINE ใหม่</button>}

      {tab === 'discover' && <>
        <div className="pa-welcome">
          <span className="pa-location"><MapPin size={14} />ขอนแก่น <ChevronRight size={13} /></span>
          <div className="pa-heading-row"><div><small>YOUR COURT STARTS HERE</small><h1>มาเล่นกัน<span>.</span></h1><p>ก๊วนดี ๆ เพื่อนใหม่ ๆ รออยู่ที่สนาม</p></div><span className="pa-welcome-icon"><Sparkles size={23} /></span></div>
        </div>
        <PlayerHero viewGames={() => document.getElementById('open-games')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} />
        <div className="pa-pulse"><span><span className="pa-pulse-icon"><CalendarCheck size={18} /></span><b>{upcoming.length}<small>ก๊วนที่เปิดรับ</small></b></span><i /><span><span className="pa-pulse-icon"><UsersRound size={18} /></span><b>{openSeats}<small>ที่ว่างทั้งหมด</small></b></span></div>
        <div className="pa-section-heading" id="open-games"><div><span>FIND YOUR GAME</span><h2>หาก๊วนที่ใช่</h2></div><span className="pa-count">{available.length} ก๊วน</span></div>
        <label className="pa-search"><Search size={19} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาก๊วนหรือสนาม" aria-label="ค้นหาก๊วนหรือสนาม" />{query && <button type="button" onClick={() => setQuery('')} aria-label="ล้างคำค้นหา"><X size={16} /></button>}</label>
        <div className="pa-filter-heading"><span><SlidersHorizontal size={15} /> เลือกสไตล์การเล่น</span></div>
        <div className="pa-filters" role="group" aria-label="ตัวกรองสไตล์ก๊วน">{playStyles.map(option => <button type="button" key={option.id} className={filter === option.id ? 'active' : ''} aria-label={`สไตล์ ${option.label} · ${option.description}`} aria-pressed={filter === option.id} onClick={() => setFilter(filter === option.id ? null : option.id)}><img src={option.image} alt="" width="1122" height="1402" loading="lazy" /><span className="pa-style-caption"><span>{option.label}</span><small>{option.description}</small></span><i className="pa-style-selected" aria-hidden="true"><Check size={16} /></i></button>)}</div>
        <p className="pa-filter-note">{filter ? 'แตะระดับที่เลือกอีกครั้งเพื่อดูทุกก๊วน' : 'แสดงทุกระดับ · เลือกระดับที่อยากเล่น'}</p>
        {loading ? <div className="pa-loading" role="status"><span /><span /><span /></div> : available.length ? <div className="pa-game-list">{available.map((session, index) => <SessionCard key={session.id} session={session} index={index} open={() => setSelectedId(session.id)} openProfile={person => setParticipantId(person.id)} />)}</div> : <div className="pa-empty"><Compass size={28} /><b>ยังไม่เจอก๊วนที่ตรงใจ</b><p>ลองเปลี่ยนคำค้นหาหรือตัวกรองดูนะ</p><button type="button" onClick={() => { setQuery(''); setFilter(null); }}>ดูก๊วนทั้งหมด <ArrowRight size={15} /></button></div>}
        <div className="pa-integrity"><ShieldCheck size={18} /><span>{config.pilot ? config.bookingEnabled ? "แนบสลิป แล้วรอผู้จัดตรวจเงินและเลือกเข้าสนาม" : "ยังปิดรับจองใหม่ ติดต่อผู้จัดสำหรับรายการเดิม" : "การจองในแอปยังเป็นโหมดทดลอง ไม่มีการเรียกเก็บเงินจริง"}</span></div>
      </>}

      {tab === 'courts' && <>
        <div className="pa-page-intro"><span>PLACES TO PLAY</span><h1>สนามของเรา<span>.</span></h1><p>เลือกสนาม แล้วดูว่ามีก๊วนไหนกำลังเปิดรับ</p></div>
        <figure className="pa-court-cover"><img src="/categories/court-club.jpg" alt="ภาพกราฟิก Pickly Club พร้อมไม้และลูกพิคเคิลบอล" width="1536" height="1024" /><figcaption><span>COURT COMMUNITY</span><strong>ที่เล่นประจำ เพื่อนกลุ่มใหม่</strong><small>ค้นหาสนามจากก๊วนที่กำลังเปิดรับด้านล่าง</small></figcaption></figure>
        <div className="pa-court-list">{venues.length ? venues.map((session, index) => {
          const count = upcoming.filter(item => item.venue === session.venue).length;
          return <button type="button" className="pa-venue-card" key={session.venue} onClick={() => showVenue(session.venue)}><CourtArt variant={index} /><span><small><MapPinned size={13} />{session.area}</small><strong>{session.venue}</strong><em>{count} ก๊วนที่เปิดรับ</em></span><span className="pa-venue-arrow"><ArrowUpRight size={20} /></span></button>;
        }) : <div className="pa-empty"><MapPinned size={28} /><b>ยังไม่มีสนามที่เปิดก๊วน</b><p>ก๊วนใหม่จะแสดงที่นี่เมื่อผู้จัดเปิดรับ</p></div>}</div>
      </>}

      {tab === 'coaches' && <CoachPreview unauthorized={() => handleUnauthorized({status: 401})} token={token} login={login} booked={async () => { const own = await api<OwnBookings>('/bookings', { headers: { Authorization: 'Bearer ' + token } }); setOwnBookings(own); setNotice('จองเวลาเรียนแล้ว แนบสลิปและรอผู้จัดตรวจเงิน'); navigate('tickets'); }} />}

      {tab === 'tickets' && <>
        <div className="pa-page-intro"><span>MY COURT TIME</span><h1>การจองของฉัน<span>.</span></h1><p>{token ? 'ก๊วนที่ผูกกับบัญชี LINE ของคุณ' : 'เชื่อม LINE เพื่อดูการจองของตัวเอง'}</p></div>
        {!token ? <div className="pa-state-card"><span><LockKeyhole size={27} /></span><h2>การจองอยู่ในบัญชีของคุณ</h2><p>เมื่อเชื่อม LINE แล้ว จะแสดงเฉพาะก๊วนที่คุณจองไว้</p>{config.connected ? <button type="button" onClick={login}>เชื่อม LINE <ArrowRight size={17} /></button> : <small>LINE Mini App ยังไม่ได้ตั้งค่า</small>}</div> : bookings.length ? <div className="pa-ticket-list">{bookings.map(booking => {
          const session = sessions.find(item => item.id === booking.sessionId);
          return <article className="pa-ticket" key={booking.id}><div className="pa-ticket-head"><span><Ticket size={16} /> {booking.kind === 'coaching' ? 'COACH PASS' : 'COURT PASS'}</span><span className={booking.admissionStatus === 'approved' ? 'paid' : ''}>{paymentTicketLabel(booking, clockNow)}</span></div><div className="pa-ticket-main"><small>{booking.kind === 'coaching' && booking.startsAt ? new Date(booking.startsAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : (session?.date || 'วันที่ก๊วน') + ' · ' + (session?.time || 'ดูรายละเอียดกับผู้จัด')}</small><h2>{booking.title}</h2><p><MapPin size={14} />{booking.venue || session?.venue || 'รายละเอียดสนาม'}</p></div><div className="pa-ticket-foot"><span>เลขจอง <b>{booking.id.slice(0, 8).toUpperCase()}</b></span><strong>฿{baht(booking.amount / 100)}</strong></div><BookingHoldNotice booking={booking} now={clockNow} />{booking.cancelledAt && booking.stripe?.issue && <p className="pa-slip-note" role="alert">{booking.stripe.issue}</p>}{!booking.cancelledAt && !paymentHoldExpired(booking, clockNow) && !booking.paidAt && (booking.stripe && booking.stripe.status !== 'expired') && <StripeBookingPayment booking={booking} token={token} mode={booking.stripe?.mode || config.stripeMode} ready={Boolean(config.stripeConfigured)} refresh={async () => { const own = await api<OwnBookings>('/bookings', { headers: { Authorization: 'Bearer ' + token } }); setOwnBookings(own); }} />}{!booking.cancelledAt && !paymentHoldExpired(booking, clockNow) && !booking.paidAt && config.paymentProvider !== 'stripe' && (!booking.stripe || booking.stripe.status === 'expired') && <PlayerTransferInstructions account={booking.transferAccount} amount={booking.amount} slipok={Boolean(config.slipokConfigured)} pending={booking.receipt?.status === 'pending'} holdExpiresAt={booking.holdExpiresAt} openQr={async channel => { const result = await api<{ url: string }>("/payments/qr", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ kind: booking.kind || "game", id: booking.id, channel }) }); return result.url; }} />}{!booking.cancelledAt && !paymentHoldExpired(booking, clockNow) && <SlipVerificationStatus verification={booking.receipt?.verification} receiptStatus={booking.receipt?.status} />}{booking.receipt?.rejectReason && <p className="pa-slip-note" role="alert">แอดมินแจ้ง: {booking.receipt.rejectReason}</p>}{booking.receipt?.ocr.status === 'complete' && <details className="pa-slip-ocr"><summary>ข้อมูลที่ OCR อ่านได้ · กรุณาตรวจความถูกต้อง</summary><pre>{JSON.stringify(booking.receipt.ocr, null, 2)}</pre></details>}{booking.receipt?.ocr.status === 'failed' && <p className="pa-slip-note">OCR อ่านภาพไม่สำเร็จ แอดมินยังตรวจภาพสลิปได้</p>}{!booking.cancelledAt && !paymentHoldExpired(booking, clockNow) && !booking.paidAt && config.paymentProvider !== 'stripe' && (!booking.stripe || booking.stripe.status === 'expired') && booking.receipt?.status !== 'pending' && <label className="pa-slip-upload">{busy ? 'กำลังส่งสลิปและตรวจรายการ…' : booking.receipt?.status === 'rejected' ? 'ถ่ายรูปหรือเลือกสลิปใหม่' : 'ถ่ายรูปหรือแนบสลิปโอนเงิน'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { void uploadReceipt(booking, event.target.files?.[0]); event.target.value = ''; }} /></label>}{!booking.cancelledAt && !paymentHoldExpired(booking, clockNow) && !booking.paidAt && booking.receipt?.status !== 'pending' && (!booking.stripe || ['expired', 'test_paid'].includes(booking.stripe.status)) && booking.admissionStatus !== 'approved' && Date.parse(booking.startsAt || session?.startsAt || '') > Date.now() && <button type="button" className="pa-cancel-booking" disabled={busy} onClick={() => cancelBooking(booking)}>ยกเลิกการจอง</button>}</article>;
        })}</div> : <div className="pa-empty"><Ticket size={28} /><b>ยังไม่มีการจอง</b><p>เริ่มจากเลือกก๊วนที่อยากไปเล่น</p><button type="button" onClick={() => navigate('discover')}>ไปหาก๊วน <ArrowRight size={15} /></button></div>}
      </>}

      {tab === 'profile' && <>
        <div className="pa-page-intro"><span>YOUR PLAYER SPACE</span><h1>สวัสดี นักเล่น<span>.</span></h1><p>ทุกเกมที่ดี เริ่มจากเพื่อนร่วมคอร์ท</p></div>
        <section className="pa-profile-card"><div className="pa-profile-mark">{profile ? <PlayerAvatar person={profile} large /> : <UserRound size={32} />}</div><span className="pa-profile-state">{person ? <><Check size={13} /> เชื่อม LINE แล้ว</> : 'PLAYER PROFILE'}</span><h2>{person || 'ผู้เล่นคนใหม่'}</h2><p>{person ? 'พร้อมเจอกันที่สนาม' : 'เชื่อม LINE เพื่อเก็บการจองไว้กับบัญชีของคุณ'}</p>{config.connected && !token && <button type="button" onClick={login}>เชื่อมบัญชี LINE <ArrowRight size={16} /></button>}</section>
        {profile && <ProfileEditor profile={profile} busy={busy} enabled={canEditProfile} save={saveProfile} />}
        <PlayerThemeSettings preference={preference} choose={choose} />
        <div className="pa-profile-stats"><span><b>{bookings.length}</b><small>การจองทั้งหมด</small></span><span><b>{bookings.filter(booking => booking.paidAt).length}</b><small>ยืนยันรับเงิน</small></span></div>
        <section className="pa-profile-guide"><h2>เริ่มเล่นง่าย ๆ</h2><div><span>01</span><p><b>เลือกก๊วน</b><small>ดูสนาม เวลา และระดับที่เหมาะกับคุณ</small></p></div><div><span>02</span><p><b>จองผ่าน LINE</b><small>ใช้บัญชีของคุณเพื่อเก็บรายการจอง</small></p></div><div><span>03</span><p><b>เจอกันที่สนาม</b><small>ตรวจรายละเอียดกับผู้จัดก่อนเดินทาง</small></p></div></section>
        <div className="pa-integrity"><ShieldCheck size={18} /><span>{config.pilot ? config.paymentProvider === "stripe" ? "Stripe ยืนยันเงิน PromptPay · ผู้จัดเลือกคนเข้าสนาม · การคืนเงินติดต่อผู้จัด" : config.slipokConfigured ? "SlipOK ตรวจสลิป · แอดมินอนุมัติเงิน · ผู้จัดเลือกคนเข้าสนาม" : "ตรวจเงินโดยผู้จัด ไม่มีการตัดเงินหรือคืนเงินอัตโนมัติ" : "ระบบจองและยอดเงินยังอยู่ในโหมดทดลอง"}</span></div>
      </>}
    </main>
    <nav className="pa-nav" aria-label="เมนูผู้เล่น">{([
      ['discover', Compass, 'หน้าแรก'],
      ['courts', MapPinned, 'สนาม'],
      ['coaches', GraduationCap, 'โค้ช'],
      ['tickets', Ticket, 'การจอง'],
      ['profile', UserRound, 'โปรไฟล์'],
    ] as const).map(([id, Icon, label]) => <a href={'#view-' + id} key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(id); }}><span className="pa-nav-icon"><Icon size={21} strokeWidth={tab === id ? 2.4 : 1.9} />{id === 'tickets' && bookings.some(booking => !booking.cancelledAt && !paymentHoldExpired(booking, clockNow) && booking.admissionStatus !== 'approved') && <span className="pa-nav-badge" aria-label="มีการจองรอยืนยัน">{bookings.filter(booking => !booking.cancelledAt && !paymentHoldExpired(booking, clockNow) && booking.admissionStatus !== 'approved').length}</span>}</span><span>{label}</span></a>)}</nav>

    {selected && <PlayerDialog label="รายละเอียดก๊วน" close={() => { setParticipantId(null); setSelectedId(null); }}><div className="pa-modal-art"><CourtArt /><img src="/chicken-court-3d.webp" alt="" /></div><span className="pa-modal-eyebrow"><Sparkles size={14} /> YOUR NEXT GOOD GAME</span><h2>{selected.title}</h2><p className="pa-modal-place"><MapPin size={16} />{selected.venue} · {selected.area}</p><div className="pa-modal-facts"><span><CalendarDays size={18} /><b>{selected.date}</b><small>{selected.time}</small></span><span><UsersRound size={18} /><b>{selected.joined}/{selected.capacity}</b><small>จองแล้ว</small></span><span><CircleDot size={18} /><b>{selected.courtCount} คอร์ท</b><small>{selected.dupr}</small></span></div><ParticipantPreview session={selected} full openProfile={person => setParticipantId(person.id)} /><div className="pa-modal-host"><span><UserRound size={17} /></span><div><small>ดูแลก๊วนโดย</small><b>{selected.host}</b></div><em>{selected.vibe}</em></div>{profile && <label className="pa-visibility pa-join-visibility"><input type="checkbox" role="switch" checked={profile.discoverable} disabled={busy || !canEditProfile} onChange={event => void saveProfile({ ...profile, discoverable: event.target.checked })} /><span><b>แสดงโปรไฟล์ของฉันเมื่อผู้จัดรับเข้าสนาม</b><small>ชื่อ รูป ระดับ และคำแนะนำตัวจะแสดงหลังผู้จัดรับเข้าสนาม ปิดได้ทุกเมื่อที่หน้าโปรไฟล์</small></span></label>}{error && <p className="pa-message pa-error" role="alert">{error}</p>}<div className="pa-modal-foot"><div><small>ค่าร่วมก๊วน / คน</small><strong>฿{baht(selected.price)}</strong></div>{!config.bookingEnabled ? <button type="button" disabled>ยังไม่เปิดจองผ่าน LINE</button> : token ? <button type="button" disabled={busy || selected.status !== 'open'} onClick={reserve}>{busy ? 'กำลังบันทึก…' : selected.status === 'full' ? 'ก๊วนเต็มแล้ว' : config.pilot ? 'ขอร่วมก๊วน' : 'จองทดลอง'}<ArrowRight size={17} /></button> : <button type="button" onClick={login}>เชื่อม LINE ก่อนจอง <ArrowRight size={16} /></button>}</div><p className="pa-modal-note"><Info size={13} />{config.pilot ? config.paymentProvider === "stripe" ? "ชำระด้วย PromptPay QR ผ่าน Stripe แล้วรอผู้จัดเลือกรายชื่อเข้าสนาม" : "ถือที่นั่ง 5 นาทีหลังจอง · โอนและส่งสลิปให้ทันเวลา จากนั้นรอผู้จัดตรวจและเลือกเข้าสนาม" : "ยังไม่มีการเรียกเก็บเงินจริง"}</p></PlayerDialog>}
    {participant && <ParticipantDialog person={participant} close={closeParticipant} />}
  </div>;
}
