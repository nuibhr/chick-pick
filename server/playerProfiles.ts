import { admittedBooking, type MarketplaceData, type MemberProfile, type PlayerProfile, type PublicParticipant } from '../src/marketplaceTypes';

export type LineIdentity = { sub: string; name: string; picture?: string | null };

export function profileSettings(value: unknown): Pick<PlayerProfile, 'discoverable' | 'skill' | 'bio'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { discoverable, skill, bio } = value as Record<string, unknown>;
  if (typeof discoverable !== 'boolean' ||
    (skill !== null && (typeof skill !== 'number' || !Number.isFinite(skill) || skill < 2 || skill > 5 || Math.abs(skill * 10 - Math.round(skill * 10)) > 1e-7)) ||
    typeof bio !== 'string' || bio.length > 160) return null;
  return { discoverable, skill: skill as number | null, bio: bio.trim() };
}

// This URL comes from the server-verified LINE claim, never from a profile form.
export function linePicture(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'line-scdn.net' || url.hostname.endsWith('.line-scdn.net')) ? url.href : null;
  } catch { return null; }
}

export function publicProfile(profile: PlayerProfile): PublicParticipant {
  return { id: profile.id, name: profile.name, picture: linePicture(profile.picture), skill: profile.skill, bio: profile.bio };
}

export function ownProfile(data: MarketplaceData, person: LineIdentity): PlayerProfile {
  const saved = data.profiles?.find(p => p.playerId === `line:${person.sub}`);
  return { id: saved?.id || '', name: person.name, picture: linePicture(person.picture), skill: saved?.skill ?? null, bio: saved?.bio || '', discoverable: saved?.discoverable === true };
}

export function updateProfile(data: MarketplaceData, person: LineIdentity, settings: Pick<PlayerProfile, 'discoverable' | 'skill' | 'bio'>): PlayerProfile {
  const previous = data.profiles?.find(p => p.playerId === `line:${person.sub}`);
  const profile: MemberProfile = { ...ownProfile(data, person), ...settings, id: previous?.id || crypto.randomUUID(), playerId: `line:${person.sub}`, updatedAt: new Date().toISOString() };
  data.profiles = [...(data.profiles || []).filter(p => p.playerId !== profile.playerId), profile];
  const { playerId: _id, updatedAt: _at, ...own } = profile;
  return own;
}

export function participantPreview(data: MarketplaceData, sessionId: string, upcoming: boolean) {
  const joined = data.bookings.filter(b => b.sessionId === sessionId && admittedBooking(b));
  // Completed sessions keep financial history but do not publish a past attendance directory.
  const participants = upcoming ? joined.flatMap(booking => {
    const profile = data.profiles?.find(p => p.playerId === booking.playerId && p.discoverable);
    return profile ? [publicProfile(profile)] : [];
  }) : [];
  return { participants, privateParticipantCount: upcoming ? joined.length - participants.length : 0 };
}
