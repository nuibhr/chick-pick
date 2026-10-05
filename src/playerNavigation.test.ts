import assert from 'node:assert/strict';
import test from 'node:test';
import { entryParameters, playerTabFromLocation, playerTabUrl, playerTabs } from './playerNavigation';

test('all rich-menu destinations resolve from query links', () => {
  for (const tab of playerTabs) assert.equal(playerTabFromLocation('?organizer=0&view=' + tab, ''), tab);
  assert.equal(playerTabFromLocation('?view=admin', ''), 'discover');
});

test('LIFF primary redirect preserves public intent over an organizer endpoint', () => {
  const search = '?organizer=1&liff.state=' + encodeURIComponent('/?organizer=0&view=tickets');
  assert.equal(entryParameters(search).get('organizer'), '0');
  assert.equal(playerTabFromLocation(search, ''), 'tickets');
  assert.equal(entryParameters('?liff.state=' + encodeURIComponent('https://other.example/?organizer=1')).get('organizer'), null);
  assert.equal(playerTabFromLocation('?liff.state=' + encodeURIComponent('//'), ''), 'discover');
});

test('existing hash links and navigation remain consistent on reload', () => {
  assert.equal(playerTabFromLocation('?view=tickets', '#view-coaches'), 'coaches');
  const url = new URL(playerTabUrl('/miniapp', '?organizer=0&view=coaches', 'profile'), 'https://app.example');
  assert.equal(url.searchParams.get('organizer'), '0');
  assert.equal(url.searchParams.get('view'), 'profile');
  assert.equal(playerTabFromLocation(url.search, url.hash), 'profile');
  assert.equal(playerTabFromLocation('?view=tickets', '#player-someone'), 'tickets');
});
