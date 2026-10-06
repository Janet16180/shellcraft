/**
 * Tiny chapters and a tiny base world for engine tests, written to the
 * authoring contract. Each call returns fresh objects.
 */
import { put, stop, cd, dir, file } from '../../src/backend/spec.js';
import { nodeAt } from '../../src/game/checks.js';
import { pick, token } from '../../src/game/rng.js';

const signText = (obs, path) => nodeAt(obs.tree, path).content.trim();

/**
 * A base world: home with a readme and a forest holding a cave.
 *
 * @param {{home: string, user: string}} who The player.
 * @returns {object[]} The patch.
 */
export function fixtureWorld({ home, user }) {
  const own = { owner: user };
  return [
    put(home, dir({ 'readme.txt': file('Welcome.\n', own), forest: dir({ cave: dir({}, own) }, own) }, own)),
    stop('daemon'),
    cd(home),
  ];
}

function awakening() {
  return {
    id: 'awakening',
    act: 1,
    title: 'The Awakening',
    setup: (_random, { home }) => [put(`${home}/letter.txt`, file('Dear hero.\n'))],
    lesson: '<p>Look around.</p>',
    tasks: [
      { goal: 'Print where you are', hints: ['Where are you?', 'Use pwd.', 'pwd'], done: ctx => ctx.ran('pwd') },
      { goal: 'Read the letter', hints: ['A letter waits.', 'Use cat.', 'cat letter.txt'], done: ctx => ctx.read(`${ctx.home}/letter.txt`) },
    ],
    solve: ['pwd', 'cat letter.txt'],
    boss: {
      title: 'The Sign',
      briefing: '<p>Do what the sign says.</p>',
      setup: (random, { home }) => {
        const name = token(random, 5);
        return { patch: [put(`${home}/sign.txt`, file(`touch ${name}\n`))], secret: { name } };
      },
      hints: ['Read the sign.', 'It names a file to create.', 'cat sign.txt'],
      done: (ctx, secret) => ctx.node(`${ctx.home}/${secret.name}`)?.type === 'file',
      solve: obs => [signText(obs, `${obs.home}/sign.txt`)],
    },
    recap: [['pwd', 'print where you are']],
    field: [['pwd', 'try it on a real machine']],
    spells: [{ name: 'pwd', summary: 'Print the working directory.', examples: [['pwd', 'where am I']] }],
  };
}

function forest() {
  return {
    id: 'forest',
    act: 1,
    title: 'The Whispering Forest',
    setup: (_random, { home }) => [put(`${home}/forest/river`, dir())],
    lesson: '<p>Walk.</p>',
    tasks: [
      { goal: 'Enter the forest', hints: ['Go in.', 'Use cd.', 'cd forest'], done: ctx => ctx.cwd === `${ctx.home}/forest` },
      { goal: 'Come back home', hints: ['Go back.', 'Use cd ..', 'cd ..'], done: ctx => ctx.ran('cd') && ctx.cwd === ctx.home },
    ],
    solve: ['cd forest', 'cd ..'],
    effects: ctx => (ctx.cwd === `${ctx.home}/forest` ? [{ kind: 'forest-entered' }] : []),
    boss: {
      title: 'The Lost Grove',
      briefing: '<p>Find the grove the sign names.</p>',
      setup: (random, { home }) => {
        const grove = pick(random, ['oak', 'elm', 'ash']);
        return { patch: [put(`${home}/forest/${grove}`, dir()), put(`${home}/forest/sign.txt`, file(`${grove}\n`))], secret: { grove } };
      },
      hints: ['Read the sign.', 'cd into the grove.', secret => `cd ~/forest/${secret.grove}`],
      done: (ctx, secret) => ctx.cwd === `${ctx.home}/forest/${secret.grove}`,
      solve: obs => [`cd ${obs.home}/forest/${signText(obs, `${obs.home}/forest/sign.txt`)}`],
    },
    recap: [['cd dir', 'enter a directory']],
    field: [['cd -', 'jump back']],
    spells: [{ name: 'cd', summary: 'Change directory.', examples: [['cd forest', 'relative path']] }],
  };
}

/**
 * Two playable chapters and one placeholder.
 *
 * @returns {object[]} awakening, forest and a soon 'unseen'.
 */
export function fixtureChapters() {
  return [awakening(), forest(), { id: 'unseen', act: 1, title: 'Things Unseen', soon: true }];
}
