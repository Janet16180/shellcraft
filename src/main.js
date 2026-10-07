/**
 * The composition root: the simulated bash, the game session over it, the map
 * and the page. Nothing else lives here.
 */

import { createSimBackend } from './shell/backend.js';
import { PLAYER } from './backend/player.js';
import { createSession } from './game/session.js';
import chapters from './game/chapters/index.js';
import { baseWorld } from './game/world.js';
import { createMap } from './map/map.js';
import { createStore } from './ui/store.js';
import { startApp } from './ui/app.js';

const backend = createSimBackend(PLAYER);
const session = createSession({
  backend,
  chapters,
  baseWorld,
  store: createStore(() => window.localStorage),
  random: Math.random,
  dev: new URLSearchParams(window.location.search).has('dev'),
});

startApp({
  doc: document,
  session,
  createMap,
  createIntroBackend: () => createSimBackend(PLAYER),
  resizeTerminal: columns => backend.resize(columns),
});
