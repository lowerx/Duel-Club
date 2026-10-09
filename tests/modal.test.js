import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Exercise the same delegated submit handler used by the browser without
// introducing a separate frontend test framework.
const source = fs.readFileSync(path.join(import.meta.dirname, '../public/app.js'), 'utf8');
const start = source.indexOf('async function modalSubmit(ev) {');
const end = source.indexOf('// Delegation:', start);
assert.ok(start >= 0 && end > start);
const handlerSource = source.slice(start, end);

function harness(type, values, onConfirm) {
  const calls = [];
  const state = { name: '' };
  const context = {
    state,
    localStorage: { setItem: (key, value) => calls.push(['storage', key, value]) },
    modalState: { type, onConfirm },
    refreshNameChip: () => calls.push(['refresh']),
    closeModal: () => calls.push(['close']),
    navigate: href => calls.push(['navigate', href]),
    joinRoomFromLink: code => calls.push(['join', code]),
    route: () => ({ type: 'home' }),
    toast: message => calls.push(['toast', message])
  };
  const submit = vm.runInNewContext(`${handlerSource}\nmodalSubmit`, context);
  const form = { elements: values };
  const event = {
    // Submit listeners are attached to document; currentTarget is not the form.
    currentTarget: { nodeName: 'DOCUMENT' },
    target: form,
    preventDefault: () => calls.push(['preventDefault'])
  };
  return { submit, event, state, calls };
}

test('Continue saves nickname and invokes room hosting when submit is delegated', async () => {
  let confirmed = 0;
  const run = harness('name', { name: { value: ' Vlad ' } }, () => { confirmed++; });
  await run.submit(run.event);
  assert.equal(run.state.name, 'Vlad');
  assert.equal(confirmed, 1);
  assert.deepEqual(run.calls.find(call => call[0] === 'storage'), ['storage', 'duelclub:name', 'Vlad']);
  assert.ok(run.calls.some(call => call[0] === 'close'));
});

test('Join form accepts room code and nickname through the same handler', async () => {
  const run = harness('join', { name: { value: 'Alex' }, code: { value: ' ab2cd3 ' } });
  await run.submit(run.event);
  assert.equal(run.state.name, 'Alex');
  assert.deepEqual(run.calls.find(call => call[0] === 'navigate'), ['navigate', '/room/AB2CD3']);
});
