/* global document, location, window, devicePixelRatio */
import { createMap, drawKey, KEY_KINDS } from '../../src/map/map.js';
import { dir, file } from '../../src/backend/spec.js';
import { observe, sampleTree, crowded } from './fixtures.js';

const params = new URLSearchParams(location.search);
const width = Number(params.get('w') ?? 640);
const reducedMotion = params.get('motion') === 'reduce';

function busyTree() {
  const tree = sampleTree();
  const run = { mode: 0o755 };
  for (const name of ['awk', 'bash', 'chmod', 'cp', 'echo', 'find', 'head', 'kill', 'mkdir', 'mv', 'ps', 'rm', 'sort', 'tail', 'touch', 'uniq', 'wc', 'which']) {
    tree.children.usr.children.bin.children[name] = file('', run);
  }
  tree.children.tmp = crowded(3, 4);
  tree.children.tmp.children['.cache'] = dir({});
  tree.children.tmp.children['.lock'] = file('', { owner: 'hero' });
  for (const name of ['Zeta.txt', '\uFF5E.txt', '\u{1F600}.txt']) tree.children.tmp.children[name] = file('', { owner: 'hero' });
  tree.children.home.children.hero.children.camp = dir({ 'campfire.txt': file('', { owner: 'hero' }) }, { owner: 'hero' });
  tree.children.home.children.hero.children.library = dir({ 'scroll_of_ages.txt': file('', { owner: 'hero' }), 'librarian.txt': file('', { owner: 'hero' }) }, { owner: 'hero' });
  tree.children.home.children.hero.children.market = dir({ 'inventory.txt': file('', { owner: 'hero' }) }, { owner: 'hero' });
  return tree;
}

function actTwoTree() {
  const tree = busyTree();
  const mine = { owner: 'hero' };
  const files = names => Object.fromEntries(names.map(n => [n, file('', mine)]));
  const hero = tree.children.home.children.hero.children;
  hero.mirrors = dir({ ...files(['shard_1.txt', 'shard_2.txt', 'reflection.txt']), inner: dir({}, mine) }, mine);
  hero.well = dir({ ...files(['bucket.txt', 'errors.txt', 'words.txt']), stones: dir({}, mine) }, mine);
  hero.den = dir(files(['nest.txt']), mine);
  hero.forge = dir({ 'hello.sh': file('#!/bin/bash\n', { ...mine, mode: 0o755 }), 'smelt.sh': file('', mine), ore: dir(files(['iron.ore', 'gold.ore', 'mithril.ore']), mine) }, mine);
  tree.children.usr.children.local = dir({ bin: dir({ greet: file('', { mode: 0o755 }), 'forge-tool': file('', { mode: 0o755 }) }) });
  return tree;
}

function actThreeTree() {
  const tree = actTwoTree();
  const person = name => ({ owner: name, group: name, mode: 0o750 });
  const home = tree.children.home.children;
  delete home.alice;
  for (const name of ['mira', 'oren', 'tamsin']) home[name] = dir({}, person(name));
  const scroll = (owner, group, mode) => file('', { owner, group, mode });
  tree.children.srv = dir({
    guild: dir({
      'ledger.txt': scroll('tamsin', 'scribes', 0o640),
      'plans.txt': scroll('mira', 'smiths', 0o640),
      'rules.txt': file(''),
      archive: dir({
        'scroll_k4m.txt': scroll('oren', 'oren', 0o400),
        'scroll_ad7.txt': scroll('mira', 'smiths', 0o604),
        'scroll_fy3.txt': scroll('tamsin', 'scribes', 0o640),
        'scroll_wp9.txt': scroll('mira', 'mira', 0o600),
        'scroll_hu6.txt': scroll('oren', 'oren', 0o044),
      }),
    }),
  });
  const mine = { owner: 'hero' };
  const hero = home.hero.children;
  hero.guild = dir({ 'notice.txt': file('', { owner: 'hero', mode: 0o044 }), 'answer.txt': file('', mine) }, mine);
  hero.hall = dir({
    vault: dir({ 'key.txt': file('', mine) }, { owner: 'hero', mode: 0o600 }),
    archive: dir({ 'old.txt': file('', mine), 'rules.txt': file('', mine) }, { owner: 'hero', mode: 0o555 }),
    shared: dir({}, { owner: 'hero', group: 'scribes', mode: 0o770 }),
    room_k4m: dir({ 'table.txt': file('', mine) }, mine),
    'request.txt': file('', mine),
  }, mine);
  return tree;
}

const scribe = (cwd, edit) => {
  const tree = actThreeTree();
  edit?.(tree.children.home.children.hero.children);
  return { obs: { ...observe(cwd, { tree }), groups: ['hero', 'scribes'] } };
};

const imp = (pid, cmd, key, cpu = 0.3) => ({ pid, ppid: 1, user: 'hero', tty: '?', stat: 'S', cpu, mem: 0.4, cmd, key });
const shell = imp(100, '-bash', 'shell');
const impsAndStubborn = [shell, imp(412, 'imp', 'imp'), imp(413, 'imp', 'imp2'), imp(420, './greedy_imp --eat', 'greedy', 88.1), imp(431, 'stubborn_imp', 'stubborn')];
const disguised = [shell, imp(512, 'imp', 'imp'), imp(519, 'ghostly_imp', 'imp2'), imp(533, 'nibbler', 'daemon', 97.2), imp(540, 'imp', 'imp3')];

const crowd = [...impsAndStubborn, imp(4242, './shadow_daemon', 'daemon', 99.7), imp(450, 'imp', 'imp9'), imp(451, 'imp', 'imp10')];

const daemon = [{ pid: 4242, ppid: 1, user: 'hero', tty: '?', stat: 'R', cpu: 99.7, mem: 12.4, cmd: './shadow_daemon', key: 'daemon' }];

const CASES = {
  cottage: () => ({ obs: observe('/home/hero', { tree: busyTree() }) }),
  forest: () => ({ obs: observe('/home/hero/forest') }),
  river: () => ({ obs: observe('/home/hero/forest/river') }),
  cave: () => ({ obs: observe('/home/hero/forest/cave/deep') }),
  gate: () => ({ obs: observe('/home/hero/gate') }),
  tower: () => ({ obs: observe('/home/hero/tower/floor1'), procs: daemon }),
  camp: () => ({ obs: observe('/home/hero/camp', { tree: busyTree() }) }),
  library: () => ({ obs: observe('/home/hero/library', { tree: busyTree() }) }),
  market: () => ({ obs: observe('/home/hero/market', { tree: busyTree() }) }),
  junk: () => ({ obs: observe('/home/hero/junk') }),
  mirrors: () => ({ obs: observe('/home/hero/mirrors', { tree: actTwoTree() }) }),
  well: () => ({ obs: observe('/home/hero/well', { tree: actTwoTree() }) }),
  den: () => ({ obs: observe('/home/hero/den', { tree: actTwoTree() }), procs: impsAndStubborn }),
  disguised: () => ({ obs: observe('/home/hero/den', { tree: actTwoTree() }), procs: disguised }),
  crowd: () => ({ obs: observe('/home/hero', { tree: busyTree() }), procs: crowd }),
  forge: () => ({ obs: observe('/home/hero/forge', { tree: actTwoTree() }) }),
  ore: () => ({ obs: observe('/home/hero/forge/ore', { tree: actTwoTree() }) }),
  guild: () => ({ obs: observe('/usr/local/bin', { tree: actTwoTree() }) }),
  hall: () => ({ obs: observe('/', { tree: busyTree() }) }),
  srv: () => scribe('/srv'),
  guildhall: () => scribe('/srv/guild'),
  guildarchive: () => scribe('/srv/guild/archive'),
  homes: () => scribe('/home'),
  outpost: () => scribe('/home/hero/guild'),
  commons: () => scribe('/home/hero/hall'),
  blind: () => scribe('/home/hero/hall', hero => { hero.hall.children.vault.mode = 0o300; }),
  strongroom: () => scribe('/home/hero/hall/vault', hero => { hero.hall.children.vault.mode = 0o700; }),
  records: () => scribe('/home/hero/hall/archive'),
  shared: () => scribe('/home/hero/hall/shared', hero => { hero.hall.children.shared.children = { 'plan.txt': file('', { owner: 'hero' }) }; }),
  gatehouse: () => ({ obs: observe('/home') }),
  archive: () => ({ obs: observe('/etc') }),
  scriptorium: () => ({ obs: observe('/var/log') }),
  cellar: () => ({ obs: observe('/var') }),
  scrap: () => ({ obs: observe('/tmp', { tree: busyTree() }), reveal: '/tmp' }),
  armory: () => ({ obs: observe('/usr/bin', { tree: busyTree() }) }),
  workshop: () => ({ obs: observe('/usr') }),
  pit: () => ({ obs: observe('/dev') }),
  vault: () => {
    const tree = sampleTree();
    tree.children.root.mode = 0o755;
    return { obs: observe('/root', { tree }) };
  },
  corridor: () => {
    const tree = sampleTree();
    tree.children.opt = dir({ 'notes.txt': file('') });
    return { obs: observe('/opt', { tree }) };
  },
  dark: () => {
    const tree = sampleTree();
    tree.children.tmp = dir({ loot: file('') }, { mode: 0o711 });
    return { obs: observe('/tmp', { tree }) };
  },
  gone: () => {
    const tree = sampleTree();
    delete tree.children.home.children.hero.children.junk;
    return { obs: observe('/home/hero/junk', { tree }) };
  },
  crowded: () => {
    const tree = busyTree();
    for (const name of ['bin', 'boot', 'lib', 'media', 'mnt', 'opt', 'proc', 'run', 'sbin', 'srv', 'sys']) tree.children[name] = dir({});
    tree.children['swap.img'] = file('', { mode: 0o600 });
    return { obs: observe('/', { tree }) };
  },
};

const only = params.get('only')?.split(',') ?? Object.keys(CASES);
const maps = {};

for (const name of only) {
  const { obs, procs, reveal } = CASES[name]();
  if (procs) obs.procs = procs;
  const figure = document.createElement('figure');
  figure.style.width = `${width}px`;
  figure.innerHTML = `<figcaption>${name}: ${obs.cwd}</figcaption><canvas></canvas>`;
  document.querySelector('#cases').append(figure);
  const map = createMap(figure.querySelector('canvas'), {
    reducedMotion,
    onPick: pick => { document.querySelector('#picked').textContent = JSON.stringify(pick); },
  });
  map.show(obs);
  if (reveal) map.play([{ kind: 'reveal', path: reveal }], obs);
  maps[name] = { map, obs };
}

const focus = params.get('focus');
if (focus) Object.values(maps).forEach(({ map }) => map.focus(focus));

if (params.has('key')) {
  const key = document.createElement('figure');
  key.innerHTML = '<figcaption>key</figcaption><div class="key"></div>';
  document.querySelector('#cases').prepend(key);
  for (const kind of KEY_KINDS) {
    const cell = document.createElement('div');
    cell.innerHTML = `<canvas class="key-art"></canvas><span>${kind}</span>`;
    key.querySelector('.key').append(cell);
    const canvas = cell.querySelector('canvas');
    canvas.width = 48 * devicePixelRatio;
    canvas.height = 48 * devicePixelRatio;
    drawKey(canvas, kind);
  }
}

window.harness = { maps, observe, busyTree, CASES };
