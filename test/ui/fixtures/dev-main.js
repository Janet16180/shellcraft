/* global document, window */
/**
 * The page composed like src/main.js, but with the engine's fixture chapters,
 * so the screenshot script can play through a quest, a boss room and an
 * adventure log quickly. The script serves this file in place of src/main.js.
 */

import { createSimBackend } from '../../../src/shell/backend.js';
import { createSession } from '../../../src/game/session.js';
import { createMap } from '../../../src/map/map.js';
import { createStore } from '../../../src/ui/store.js';
import { startApp } from '../../../src/ui/app.js';
import { fixtureChapters, fixtureWorld } from '../../helpers/fixture-chapters.js';

// Until the simulator reports the player's groups (port.js), add them here; the map needs them.
function withGroups(backend) {
  return { ...backend, observe: async () => ({ groups: ['hero'], ...await backend.observe() }) };
}

const session = createSession({
  backend: withGroups(createSimBackend()),
  chapters: fixtureChapters(),
  baseWorld: fixtureWorld,
  store: createStore(() => window.localStorage),
  random: Math.random,
});

startApp({ doc: document, session, createMap, createIntroBackend: () => withGroups(createSimBackend()) });
