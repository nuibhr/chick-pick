import type { FinanceDocuments } from './financeDomain';
import type { TransferAccount } from '../src/marketplaceTypes';
import type { Venue } from '../src/venueTypes';

export function bookingReadiness(docs: FinanceDocuments, venues: Venue[], account: TransferAccount | null, receipts: boolean, stripeReady = false, paymentProvider: 'manual' | 'stripe' = 'manual') {
  const activeVenues = venues.filter(v => v.active);
  const knownVenue = (name: string, id?: string) => activeVenues.some(v => id ? v.id === id : v.name === name);
  const closed = new Set(docs['revenue-settlements'].map(s => s.key));
  const futureGames = docs.marketplace.sessions.filter(s => s.status === 'open' && Date.parse(s.startsAt) > Date.now() && knownVenue(s.venue, s.venueId) && !closed.has('game:' + s.id));
  const futureSlots = docs['coach-slots'].filter(s => s.status === 'open' && Date.parse(s.start) > Date.now() + 1800000 && docs['coach-profiles'].some(c => c.id === s.coachId && c.active !== false && knownVenue(c.venue) && c.bookingFee !== undefined && c.bookingFee <= s.price));
  const paymentReady = paymentProvider === 'stripe' ? stripeReady : Boolean(account && receipts);
  return { paymentProvider, stripeConfigured: stripeReady, paymentReady, transferAccountConfigured: Boolean(account), receiptStorageConfigured: receipts, activeVenueCount: activeVenues.length, futureOpenPlayCount: futureGames.length, futureCoachSlotCount: futureSlots.length, openPlayReady: paymentReady && futureGames.length > 0, coachingReady: paymentReady && futureSlots.length > 0, readyToOpen: paymentReady && (futureGames.length > 0 || futureSlots.length > 0) };
}
