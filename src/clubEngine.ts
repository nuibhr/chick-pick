export type Player = { id: string; name: string; rating: number; played: number; wins: number; ticket: number; skip: boolean };
export type Court = { id: number; teams: [string[], string[]] | null };
export type Club = { version: 1; players: Player[]; courts: Court[]; mode: 'rotation' | 'king'; serial: number; rounds: number; history: string[] };
export function newClub(): Club { return { version: 1, players: [], courts: [{ id: 1, teams: null }, { id: 2, teams: null }], mode: 'rotation', serial: 0, rounds: 0, history: [] }; }
export function demoClub(): Club { const s = newClub(); ['นุ้ย', 'พลอย', 'แบงค์', 'มิน', 'โจ', 'ฟ้า', 'บีม', 'ออม', 'ต้น', 'แพรว', 'พีท', 'ปัน'].forEach((name, i) => addPlayer(s, name, 2.5 + (i % 5) * .5, `demo-${i}`)); return s; }
export function addPlayer(s: Club, name: string, rating: number, id: string) { if (!name.trim() || !Number.isFinite(rating) || rating < 2 || rating > 5 || s.players.some(p => p.id === id)) throw Error('ตรวจชื่อและระดับฝีมือ 2.0–5.0'); const waiting = queue(s); s.players.push({ id, name: name.trim().slice(0, 40), rating, played: waiting.length ? Math.min(...waiting.map(p => p.played)) : Math.min(...s.players.map(p => p.played), 0), wins: 0, ticket: s.serial++, skip: false }); }
export function queue(s: Club) { const busy = new Set(s.courts.flatMap(c => c.teams?.flat() || [])); return s.players.filter(p => !busy.has(p.id)).sort((a, b) => s.mode === 'king' ? a.ticket - b.ticket : a.played - b.played || a.ticket - b.ticket); }
export function balanced(players: Player[], keepApart: string[] = []): [string[], string[]] {
  const splits = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  const choices = splits.map(split => split.map(team => team.map(i => players[i]))).filter(teams => !keepApart.length || !teams.some(t => keepApart.every(id => t.some(p => p.id === id))));
  choices.sort((a, b) => Math.abs(a[0].reduce((n,p)=>n+p.rating,0)-a[1].reduce((n,p)=>n+p.rating,0))-Math.abs(b[0].reduce((n,p)=>n+p.rating,0)-b[1].reduce((n,p)=>n+p.rating,0)));
  return choices[0].map(t => t.map(p => p.id)) as [string[], string[]];
}
export function fill(s: Club, courtId?: number, anchors: string[] = []) {
  const skipped = new Set(s.players.filter(p => p.skip).map(p => p.id)); let drew = false;
  for (const c of s.courts.filter(c => !c.teams && (courtId === undefined || c.id === courtId))) {
    const stay = anchors.map(id => s.players.find(p => p.id === id)!);
    const next = queue(s).filter(p => !skipped.has(p.id) && !anchors.includes(p.id)).slice(0, 4 - stay.length);
    if (stay.length + next.length < 4) continue;
    c.teams = balanced([...stay, ...next], anchors); drew = true;
  }
  if (drew) s.players.forEach(p => { if (skipped.has(p.id)) p.skip = false; });
  return drew;
}
export function finish(s: Club, courtId: number, winner: 0 | 1) {
  const c = s.courts.find(c => c.id === courtId); if (!c?.teams || c.teams.flat().length !== 4) return;
  const winning = c.teams[winner]; const ids = c.teams.flat();
  // Winners stay only when two eligible challengers are waiting; otherwise wait for a full game.
  const anchors = s.mode === 'king' ? winning : [];
  ids.forEach(id => { const p = s.players.find(p => p.id === id)!; p.played++; if (winning.includes(id)) p.wins++; p.ticket = s.serial++; });
  c.teams = null; s.rounds++;
  s.history.unshift(`คอร์ท ${courtId} · ${winning.map(id => s.players.find(p => p.id === id)!.name).join(' + ')} ชนะ`); s.history = s.history.slice(0, 30);
  if (anchors.length) {
    // Exclude just-finished losers so they cannot instantly challenge their own game.
    const losers = ids.filter(id => !winning.includes(id));
    const challengers = queue(s).filter(p => !p.skip && !ids.includes(p.id)).slice(0, 2);
    if (challengers.length === 2) { c.teams = balanced([...winning, ...challengers.map(p => p.id)].map(id => s.players.find(p => p.id === id)!), anchors); s.players.forEach(p => { if (p.skip && !losers.includes(p.id)) p.skip = false; }); }
    else { c.teams = [winning.slice(0, 1), winning.slice(1)]; }
  } else fill(s, courtId);
}
export function challenge(s: Club, courtId: number) { const c = s.courts.find(c => c.id === courtId); if (!c?.teams || c.teams.flat().length !== 2) return false; const anchors = c.teams.flat(); const next = queue(s).filter(p => !p.skip).slice(0, 2); if (next.length < 2) return false; c.teams = balanced([...anchors, ...next.map(p => p.id)].map(id => s.players.find(p => p.id === id)!), anchors); s.players.forEach(p => { p.skip = false; }); return true; }
export function mixCourts(s: Club) {
  if(s.mode==='king') throw Error('สลับทุกคอร์ทได้ในโหมดวนก๊วนเท่านั้น');
  const groups=s.courts.map(c=>c.teams?.flat()||[]);
  s.courts.forEach(c=>{if(c.teams?.flat().length===4){c.teams.flat().forEach(id=>s.players.find(p=>p.id===id)!.played++);s.rounds++;}c.teams=null;});
  for(let i=0;i<4;i++) for(const group of groups) if(group[i]) s.players.find(p=>p.id===group[i])!.ticket=s.serial++;
  s.history.unshift('จบเกมทุกคอร์ทและสลับผู้เล่นข้ามสนาม · ไม่บันทึกผู้ชนะ');s.history=s.history.slice(0,30);fill(s);
}

export type CreditBook = { payments: { id: string; satang: number; month: string }[]; awards: { month: string; player: string; satang: number }[]; redemptions: { id: string; player: string; item: string; points: number }[] };
export const emptyBook = (): CreditBook => ({ payments: [], awards: [], redemptions: [] });
export const rewards = [{id:'grip',name:'กริปพันด้าม',points:80}, {id:'ball',name:'ลูกพิเคิลบอล',points:150}, {id:'shirt',name:'เสื้อ Chicken Club',points:450}];
export function points(b: CreditBook, player: string) { return Math.floor(b.awards.filter(a=>a.player===player).reduce((n,a)=>n+a.satang,0)/100) - b.redemptions.filter(r=>r.player===player).reduce((n,r)=>n+r.points,0); }
export function redeem(b: CreditBook, player: string, item: string, id: string) { if(b.redemptions.some(r=>r.id===id)) return; const reward=rewards.find(r=>r.id===item);if(!reward || points(b,player)<reward.points) throw Error('แต้มไม่เพียงพอ');b.redemptions.push({id,player,item,points:reward.points}); }
export function previousMonth(month: string) { const [y,m] = month.split('-').map(Number); return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`; }
export function availableCredit(b: CreditBook, championshipMonth: string) { const cutoff = previousMonth(championshipMonth); return Math.max(0, Math.floor(b.payments.filter(p => p.month <= cutoff).reduce((sum,p) => sum + p.satang, 0) / 100) - b.awards.reduce((sum,a) => sum + a.satang, 0)); }
export function payment(b: CreditBook, id: string, satang: number, month: string) { if (!Number.isSafeInteger(satang) || satang <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('ยอดเงินหรือเดือนไม่ถูกต้อง'); if (!b.payments.some(p => p.id === id)) b.payments.push({id,satang,month}); }
export function award(b: CreditBook, month: string, player: string) { if (!player.trim() || b.awards.some(a => a.month >= month)) throw Error('เดือนนี้มอบแล้ว หรือมีรายการเดือนใหม่กว่า'); const satang = availableCredit(b, month); if (!satang) throw Error('ยังไม่มีเงินสมทบที่ครบกำหนด'); b.awards.push({month,player,satang}); }
