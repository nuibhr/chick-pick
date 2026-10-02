import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleDot, LockKeyhole, UsersRound, X } from 'lucide-react';
import type { PlayerProfile, PublicParticipant, PublicSession } from './marketplaceTypes';

export function PlayerDialog({ label, close, children, compact = false }: { label: string; close: () => void; children: ReactNode; compact?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (!compact && document.querySelector('.pa-dialog-layer.is-person')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const controls = focusable(), first = controls[0], last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, []);
  return <div className={'pa-modal-backdrop pa-dialog-layer' + (compact ? ' is-person' : '')}>
    <section ref={ref} className={'pa-modal pa-native-dialog' + (compact ? ' pa-person-dialog' : '')} role="dialog" aria-modal="true" aria-label={label}>
      <div className="pa-modal-grip" /><button className="pa-close" type="button" aria-label={'ปิด' + label} onClick={close}><X size={19} /></button>{children}
    </section>
  </div>;
}

export function PlayerAvatar({ person, large = false }: { person: Pick<PublicParticipant, 'name' | 'picture'>; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person.picture]);
  return <span className={'pa-player-avatar' + (large ? ' is-large' : '')} aria-hidden="true">
    {person.picture && !failed ? <img src={person.picture} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span>{Array.from(person.name.trim())[0] || '?'}</span>}
  </span>;
}

export function ParticipantPreview({ session, full = false, openProfile, showAll }: { session: PublicSession; full?: boolean; openProfile: (p: PublicParticipant) => void; showAll?: () => void }) {
  const visible = full ? session.participants : session.participants.slice(0, 4);
  const admitted = session.participants.length + session.privateParticipantCount;
  if (!session.joined) return <div className="pa-people-empty"><UsersRound size={18} /><span>ยังไม่มีคนจอง · มาเป็นคนแรกของก๊วน</span></div>;
  if (!admitted) return <div className="pa-people-empty"><UsersRound size={18} /><span>{session.joined} คำขอ · รอผู้จัดเลือกคนเข้าสนาม</span></div>;
  return <section className={'pa-people' + (full ? ' is-expanded' : '')} aria-label="ผู้เล่นที่ผู้จัดรับเข้าสนามแล้ว">
    <div className="pa-people-heading"><span><UsersRound size={15} />เพื่อนร่วมคอร์ท</span><b>{admitted} คนรับเข้าสนามแล้ว</b></div>
    <div className="pa-people-grid">{visible.map(person => <a href={'#player-' + encodeURIComponent(person.id)} key={person.id} className="pa-person-button" onClick={() => openProfile(person)} aria-label={'ดูโปรไฟล์ ' + person.name}>
      <PlayerAvatar person={person} />{full && <span>{person.name}</span>}
    </a>)}
      {!full && session.participants.length > visible.length && <button type="button" className="pa-more-people" onClick={showAll} aria-label="ดูผู้เล่นทั้งหมด">+{session.participants.length - visible.length}</button>}
      {session.privateParticipantCount > 0 && <span className="pa-private-people"><span className="pa-player-avatar"><LockKeyhole size={17} /></span><small>{session.privateParticipantCount} คนซ่อนโปรไฟล์</small></span>}
    </div>
    {full && <p className="pa-people-note">แตะรูปเพื่อรู้จักเพื่อนก่อน Join · แสดงเฉพาะคนที่ผู้จัดรับเข้าสนามและเปิดโปรไฟล์สาธารณะ</p>}
  </section>;
}

export function ParticipantDialog({ person, close }: { person: PublicParticipant; close: () => void }) {
  return <PlayerDialog label="โปรไฟล์ผู้เล่น" close={close} compact><div className="pa-person-cover"><span>MEET YOUR COURT MATE</span></div><div className="pa-person-detail">
    <PlayerAvatar person={person} large /><h2>{person.name}</h2><span className="pa-person-chip"><CircleDot size={15} />{person.skill === null ? 'ยังไม่ระบุระดับ' : 'ระดับ ' + person.skill.toFixed(1)}</span>
    <p>{person.bio || 'พร้อมรู้จักเพื่อนใหม่ที่สนาม'}</p><small>ระดับที่ผู้เล่นระบุเอง · ไม่ใช่คะแนน DUPR ที่รับรอง</small><div className="pa-person-footer"><UsersRound size={17} />ผู้จัดรับร่วมก๊วนแล้ว</div>
  </div></PlayerDialog>;
}

export function ProfileEditor({ profile, busy, enabled = true, save }: { profile: PlayerProfile; busy: boolean; enabled?: boolean; save: (value: PlayerProfile) => Promise<void> }) {
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);
  const disabled = busy || !enabled;
  return <form className="pa-profile-editor" onSubmit={event => { event.preventDefault(); if (!disabled) void save(draft); }}>
    <h2>ให้เพื่อนรู้จักคุณ</h2><p>ชื่อและรูปมาจากบัญชี LINE ที่ยืนยันแล้ว</p>
    <label className="pa-visibility"><input type="checkbox" role="switch" checked={draft.discoverable} disabled={disabled} onChange={event => setDraft({ ...draft, discoverable: event.target.checked })} /><span><b>แสดงโปรไฟล์เมื่อผู้จัดรับเข้าสนาม</b><small>ทุกคนที่เปิดหน้าก๊วนจะเห็นชื่อ รูป ระดับ และคำแนะนำตัว ปิดเมื่อไรก็ได้</small></span></label>
    <label className="pa-profile-field">ระดับการเล่น <select value={draft.skill ?? ''} disabled={disabled} onChange={event => setDraft({ ...draft, skill: event.target.value === '' ? null : Number(event.target.value) })}><option value="">ยังไม่ระบุ</option>{Array.from({ length: 31 }, (_, i) => (20 + i) / 10).map(value => <option key={value} value={value}>{value.toFixed(1)}</option>)}</select><small>ระบุด้วยตัวเอง ยังไม่เชื่อมกับ DUPR</small></label>
    <label className="pa-profile-field">แนะนำตัวสั้น ๆ <textarea maxLength={160} rows={3} value={draft.bio} disabled={disabled} placeholder="ชอบตีชิลล์ ยินดีเล่นกับมือใหม่" onChange={event => setDraft({ ...draft, bio: event.target.value })} /><small>{draft.bio.length}/160 · หลีกเลี่ยงเบอร์โทรและข้อมูลส่วนตัว</small></label>
    <button className="pa-save-profile" disabled={disabled} type="submit">{busy ? 'กำลังบันทึก…' : !enabled ? 'ยังไม่เปิดแก้โปรไฟล์' : 'บันทึกโปรไฟล์'}</button>
  </form>;
}
