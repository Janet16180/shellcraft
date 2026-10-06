import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../../src/backend/player.js';

test("the player's home lives under /home and is named after the user", () => {
  assert.equal(PLAYER.home, `/home/${PLAYER.user}`);
});

test('the player identity cannot be changed by a caller', () => {
  assert.ok(Object.isFrozen(PLAYER));
  assert.deepEqual(Object.keys(PLAYER).sort(), ['home', 'host', 'user']);
});
