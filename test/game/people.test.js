import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realm } from '../../src/game/people.js';
import { baseWorld } from '../../src/game/world.js';
import { PLAYER } from '../../src/backend/player.js';
import { password } from '../../src/backend/spec.js';
import { createSimBackend } from '../../src/shell/backend.js';

const groupOf = patch => patch.find(op => op.path === '/etc/group').node.content;

test('the realm puts the player in the factions asked for, and in sudo only when asked', () => {
  assert.match(groupOf(realm(PLAYER, { factions: ['scribes'] })), /\nsudo:x:27:\n[\s\S]*\nscribes:x:1101:tamsin,hero\n/);
  assert.match(groupOf(realm(PLAYER, { sudo: true })), /\nsudo:x:27:hero\n/);
});

test('a sudoer realm with a password lets the player run a command as root after typing it', async () => {
  const backend = createSimBackend({ now: () => 0, random: () => 0.5 });
  await backend.load([...baseWorld(PLAYER), ...realm(PLAYER, { sudo: true }), password('dragon')]);
  assert.equal((await backend.run('sudo whoami')).input.prompt, '[sudo] password for hero: ');
  const done = await backend.answer('dragon');
  assert.equal(done.output.map(c => c.text).join(''), '[sudo] password for hero: \nroot\n');
  assert.match((await backend.run('groups')).output[0].text, /^hero sudo\n$/);
});
