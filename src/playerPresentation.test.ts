import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionPlayStyle } from './playerPresentation';

test('style categories follow the 3.5 boundary and preserve existing sessions', () => {
  assert.equal(sessionPlayStyle({ title: 'Open Play', dupr: '<3.5', vibe: 'เบา–กลาง', tags: [] }), 'casual');
  assert.equal(sessionPlayStyle({ title: 'Open Play', dupr: 'มือใหม่–3.0', vibe: 'มือใหม่สบาย ๆ', tags: [] }), 'casual');
  assert.equal(sessionPlayStyle({ title: 'ตีชิลล์', dupr: '2.5–3.5', vibe: 'social', tags: ['เพื่อนใหม่'] }), 'casual');
  assert.equal(sessionPlayStyle({ title: 'Friday', dupr: '3.2–4.2', vibe: 'จริงจัง แต่เป็นมิตร', tags: ['เกมเข้ม'] }), 'casual');
  assert.equal(sessionPlayStyle({ title: 'Open Play', dupr: '3.5–4.5', vibe: '', tags: [] }), 'high');
  assert.equal(sessionPlayStyle({ title: 'Open Play', dupr: 'สูง', vibe: '', tags: [] }), 'high');
});
