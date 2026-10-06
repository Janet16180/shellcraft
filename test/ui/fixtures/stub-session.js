/**
 * A stand-in session for looking at the page before the engine is merged.
 * It runs lines on a real backend and answers with fixture Views. Typing
 * `boss` opens the boss room, `win` clears the chapter, `ouch` costs a heart.
 */

import { sampleView } from './view.js';
import { put, dir, file } from '../../../src/backend/spec.js';

const HOME = '/home/hero';
const OWN = { owner: 'hero' };

const WORLD = [
  put(`${HOME}/forest`, dir({ cave: dir({}, OWN), river: dir({}, OWN), 'mushroom.txt': file('A glowing mushroom.\n', OWN) }, OWN)),
  put(`${HOME}/library`, dir({}, OWN)),
  put(`${HOME}/readme.txt`, file('Welcome, hero.\n', OWN)),
];

const LOG = {
  kind: 'chapter',
  id: 'awakening',
  recap: [['whoami', 'prints your user name'], ['pwd', 'prints the full path of where you are'], ['ls', 'lists what is in a directory'], ['cat FILE', 'prints a file on the screen']],
  field: [['ls -la ~', 'see the hidden settings files in your real home'], ['man man', 'the manual of the manual']],
  why: '<p>Every session on a server starts the same way: who am I, where am I, what is here. These four commands answer that before you change anything.</p>',
  xp: 20,
  next: 'forest',
};

const SCRIPTED = {
  boss: (view) => {
    view.chapter.phase = 'boss';
    return [{ kind: 'boss-start', title: view.chapter.boss.title }];
  },
  win: (view) => {
    view.chapter.phase = 'done';
    view.chapters[1].status = 'open';
    return [{ kind: 'boss', xp: 30 }, LOG];
  },
  ouch: (view) => {
    view.hearts.left = Math.max(1, view.hearts.left - 1);
    return [{ kind: 'heart-lost', reason: 'rm -r ~ would delete your whole home. The Guardian stopped it.', left: view.hearts.left }];
  },
};

/**
 * Create the stub session.
 *
 * @param {object} backend A backend from createSimBackend.
 * @param {object} [over] Fields to replace in the starting View.
 * @returns {object} An object with the session API.
 */
export function createStubSession(backend, over = {}) {
  const view = sampleView({ introSeen: false, ...over });
  const hints = ['Think about where you are.', 'pwd prints the working directory.', 'pwd'];
  const promptOf = obs => ({ user: obs.user, host: obs.host, cwd: obs.cwd, home: obs.home });
  return {
    boot: async () => {
      await backend.load(WORLD);
      view.prompt = promptOf(await backend.observe());
      return structuredClone(view);
    },
    observe: () => backend.observe(),
    startChapter: async () => structuredClone(view),
    submit: async line => {
      const before = await backend.observe();
      const scripted = SCRIPTED[line.trim()];
      const result = scripted ? { output: [], status: 0, commands: [], blocked: [] } : await backend.run(line);
      const events = scripted ? scripted(view) : [];
      const obs = await backend.observe();
      view.prompt = promptOf(obs);
      const effects = before.cwd === obs.cwd ? [] : [{ kind: 'travel', from: before.cwd, to: obs.cwd }];
      return { result, obs, effects, events, view: structuredClone(view) };
    },
    hint: () => {
      const task = view.chapter.tasks.find(t => t.next);
      if (!view.hint) return null;
      const shown = { level: view.hint.level, text: hints[view.hint.level - 1], cost: view.hint.cost };
      task.hints.push(shown.text);
      view.hint = view.hint.level < 3 ? { level: view.hint.level + 1, cost: [0, 3, 5][view.hint.level] } : null;
      return shown;
    },
    view: () => structuredClone(view),
    complete: line => backend.complete(line),
    setSound: on => { view.sound = on; },
    markIntroSeen: () => { view.introSeen = true; },
    reset: async () => structuredClone(view),
  };
}
