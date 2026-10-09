import test from 'node:test';
import assert from 'node:assert/strict';
import { startRound, score, resolveWinner } from '../game-logic.js';

const items = Array.from({length: 8}, (_, i) => ({ id: `item${i}`, name: `Item ${i}` }));

test('eight entries become four matched pairs', () => {
  const room = {};
  startRound(room, items);
  assert.equal(room.matches.length, 4);
  assert.equal(room.bye, null);
  assert.equal(room.matches[0].a.id, 'item0');
  assert.equal(room.matches[0].b.id, 'item1');
});

test('odd-numbered rounds award a bye', () => {
  const room = {};
  startRound(room, items.slice(0,5));
  assert.equal(room.matches.length, 2);
  assert.equal(room.bye.id, 'item4');
});

test('scores count each participant once', () => {
  const match = { a: items[0], b: items[1], votes: { jack:'item0', amy:'item0', max:'item1' } };
  assert.deepEqual(score(match), { a:2, b:1, total:3 });
  assert.equal(resolveWinner(match,'jack').winner.id,'item0');
});

test('host vote wins ties', () => {
  const match = { a:items[0], b:items[1], votes: { host:'item1', pal:'item0' } };
  const result = resolveWinner(match,'host', () => 1);
  assert.equal(result.winner.id,'item1');
  assert.match(result.tiebreak, /host vote/);
});

test('random decision is only used for tie without host vote', () => {
  const match = { a:items[0], b:items[1], votes: { one:'item1', two:'item0' } };
  assert.equal(resolveWinner(match,'host', () => 0).winner.id, 'item1');
  assert.equal(resolveWinner(match,'host', () => 1).winner.id, 'item0');
});

test('match without any vote cannot be revealed', () => {
  const match = { a:items[0], b:items[1], votes: {} };
  assert.throws(() => resolveWinner(match, 'host'), /before a vote/);
});
