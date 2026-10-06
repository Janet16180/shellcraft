import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootText, restoredText } from '../../src/ui/messages.js';

test('a damaged save is reported, so the player knows why progress is gone', () => {
  assert.match(bootText('damaged'), /could not be read/);
});

test('a save carried over from the first Shellcraft is mentioned', () => {
  assert.match(bootText('migrated'), /first Shellcraft/);
});

test('a new or resumed game needs no message', () => {
  assert.equal(bootText('new'), null);
  assert.equal(bootText('resumed'), null);
});

test('running out of hearts says what the Guardian rebuilt for each phase', () => {
  assert.match(restoredText('quest'), /Finished tasks stay finished/);
  assert.match(restoredText('boss'), /new boss room/);
  assert.match(restoredText('done'), /hearts are full/);
});

test('an unknown status or phase is a bug and raises', () => {
  assert.throws(() => bootText('lost'), /boot status/);
  assert.throws(() => restoredText('lobby'), /phase/);
});
