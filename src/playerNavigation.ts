export const playerTabs = ['discover', 'courts', 'coaches', 'tickets', 'profile'] as const;
export type PlayerTab = typeof playerTabs[number];

const isPlayerTab = (value: string | null): value is PlayerTab => playerTabs.some(tab => tab === value);

// Read presentation intent during LIFF's primary redirect; the SDK still owns
// the redirect itself. These values never grant organizer permissions.
export function entryParameters(search: string): URLSearchParams {
  const params = new URLSearchParams(search);
  const state = params.get('liff.state');
  if (state && /^[/?#]/.test(state)) {
    try {
      const pending = new URL(state, 'https://liff-state.invalid').searchParams;
      for (const key of ['organizer', 'workspace', 'view']) {
        if (pending.has(key)) params.set(key, pending.get(key)!);
      }
    } catch { /* Ignore malformed presentation state; let LIFF handle its own redirect. */ }
  }
  return params;
}

export function playerTabFromLocation(search: string, hash: string): PlayerTab {
  const fragment = hash.startsWith('#view-') ? hash.slice(6) : null;
  if (isPlayerTab(fragment)) return fragment;
  const requested = entryParameters(search).get('view');
  return isPlayerTab(requested) ? requested : 'discover';
}

export function playerTabUrl(pathname: string, search: string, tab: PlayerTab): string {
  const params = new URLSearchParams(search);
  params.set('view', tab);
  return pathname + '?' + params.toString() + '#view-' + tab;
}
