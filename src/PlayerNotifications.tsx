import { Bell, Check, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PlayerBooking } from './playerBookingTypes';
import { playerNotices } from './playerNotificationModel';

export default function PlayerNotifications({ bookings, now, readAt, signedIn, login, markRead, openBooking }: { bookings: PlayerBooking[]; now: number; readAt: string | null; signedIn: boolean; login: () => void; markRead: (through: string) => Promise<void>; openBooking: (id: string) => void }) {
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [marking, setMarking] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const notices = playerNotices(bookings, now), readTime = Date.parse(readAt || '') || 0, unread = notices.filter(n => Date.parse(n.at) > readTime).length;
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  useEffect(() => { if (!signedIn) setOpen(false); }, [signedIn]);
  async function acknowledge() {
    if (!unread || lock.current || !notices.length) return;
    lock.current = true; setMarking(true); setError('');
    try { await markRead(notices[0].at); } catch { setError('ยังบันทึกว่าอ่านแล้วไม่ได้ ลองอีกครั้งได้'); }
    finally { setMarking(false); lock.current = false; }
  }
  return <><button className="pa-header-action pa-notification-bell" type="button" aria-label={unread ? `แจ้งเตือน ${unread} รายการยังไม่อ่าน` : 'แจ้งเตือน'} onClick={() => { if (!signedIn) { login(); return; } setOpen(true); void acknowledge(); }}><Bell size={20} />{unread > 0 && <span className="pa-notification-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}</button>
    {open && <dialog className="pa-notifications" ref={dialog} onCancel={() => setOpen(false)} aria-labelledby="player-notifications-title"><div className="pa-notification-heading"><div><small>CHICK&PICK</small><h2 id="player-notifications-title">แจ้งเตือนของคุณ</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="ปิดแจ้งเตือน"><X size={20} /></button></div>
      {error && <p role="alert">{error}<button type="button" disabled={marking} onClick={() => void acknowledge()}>ลองอีกครั้ง</button></p>}
      <div className="pa-notification-list">{notices.length ? notices.map(n => <button key={n.id} type="button" className={'pa-notification-item ' + n.tone + (Date.parse(n.at) > readTime ? ' unread' : '')} onClick={() => { setOpen(false); openBooking(n.bookingId); }}><span className="pa-notification-symbol">{n.tone === 'success' ? <Check size={18} /> : <Bell size={18} />}</span><span><strong>{n.title}</strong><small>{n.body}</small><time dateTime={n.at}>{new Date(n.at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })}</time></span><ChevronRight size={17} /></button>) : <p className="pa-notification-empty">ยังไม่มีแจ้งเตือน เมื่อสถานะการจองเปลี่ยนจะแสดงที่นี่</p>}</div><p className="pa-notification-footer">อัปเดตสถานะเมื่อเปิดแอปและระหว่างใช้งาน</p>
    </dialog>}
  </>;
}
