export interface Player {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  capColor: number;
  shirtColor: number;
  side: 'A' | 'B';
  courtId: number;
  dupr: number;
  stats: {
    dink: number;
    smash: number;
    serve: number;
    stamina: number;
  };
  paddle: string;
  avatarIcon: string;
  playStyle?: string;
  isBench?: boolean;
}

export interface SquadPlayer {
  id: string;
  name: string;
  dupr: number;
  avatarIcon: string;
  playStyle: string;
  bio: string;
  paidStatus: 'paid' | 'pending';
  joinedAt: string;
  isSolo: boolean; // มาคนเดียวหาเพื่อนเล่น
  assignedCourt?: number;
  assignedSide?: 'A' | 'B';
  isBench?: boolean;
}

export interface EventSession {
  id: string;
  title: string;
  tagline: string;
  timeSlot: string; // e.g. '18:00 - 20:00'
  dateLabel: string;
  status: 'open' | 'full' | 'in_progress' | 'completed';
  headFee: number; // ค่าหัวคิวต่อคน (บาท) เช่น 190
  courtRentalCost: number; // ค่าเช่าสนามที่โฮสต์ต้องจ่าย เช่น 800
  targetPlayers: number; // เช่น 12 คน
  registeredPlayers: SquadPlayer[];
  duprRange: string; // e.g. '2.5 - 3.8 (มือใหม่ - ปานกลาง)'
  atmosphere: 'ชิลล์เน้นสนุก' | 'จริงจังเก็บแต้ม' | 'ผสมผสาน';
  currentMatchIndex: number;
  totalMatchesInSession: number;
}

export interface CourtMatch {
  courtId: number;
  courtName: string;
  teamAName: string;
  teamBName: string;
  teamAPlayers: Player[];
  teamBPlayers: Player[];
  scoreA: number;
  scoreB: number;
  serverNumber: 1 | 2;
  servingSide: 'A' | 'B';
  currentRound: number;
  totalRounds: number;
  gameStatus: 'active' | 'match_point' | 'finished';
  tacticalTip: string;
  sessionTitle?: string;
}

export interface QueuePlayer {
  id: string;
  name: string;
  dupr: number;
  joinTime: string;
  status: 'waiting' | 'assigned' | 'playing';
  preferredSide?: 'A' | 'B';
  contactPhone?: string;
  isSolo?: boolean;
}

export type ArenaLightingMode = 'day' | 'sunset' | 'night_cyber';

export type PaymentMethod = 'promptpay' | 'stripe' | 'cash' | 'transfer';
export type TransactionType = 'income' | 'expense';
export type TransactionCategory = 'head_fee' | 'court_rental' | 'equipment' | 'refreshment' | 'other';

export interface TransactionRecord {
  id: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  sessionId?: string;
  sessionTitle?: string;
  playerId?: string;
  playerName?: string;
  paymentMethod: PaymentMethod;
  timestamp: string;
  status: 'completed' | 'pending' | 'rejected';
  slipRef?: string;
  slipUrl?: string;
}

export interface PaymentSlip {
  id: string;
  sessionId: string;
  sessionTitle: string;
  playerId: string;
  playerName: string;
  amount: number;
  bank: string;
  transferTime: string;
  slipImageData?: string;
  status: 'pending' | 'verified' | 'rejected';
  verificationNotes?: string;
  submittedAt: string;
  autoMatched?: boolean;
}

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: 'super_admin' | 'organizer';
  avatar: string;
  email: string;
}

export interface DuprMatchBatch {
  roundNumber: number;
  court1: {
    teamA: SquadPlayer[];
    teamB: SquadPlayer[];
    avgDuprA: number;
    avgDuprB: number;
    deltaDupr: number;
  };
  court2: {
    teamA: SquadPlayer[];
    teamB: SquadPlayer[];
    avgDuprA: number;
    avgDuprB: number;
    deltaDupr: number;
  };
  bench: SquadPlayer[];
}
