/* global document, location, window, devicePixelRatio */
import { createMap, drawKey, KEY_KINDS } from '../../src/map/map.js';
import { dir, file, symlink } from '../../src/backend/spec.js';
import { observe, sampleTree, crowded } from './fixtures.js';
import { packTar, gzip } from '../../src/backend/archive.js';

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

// Chapter 18: the throne room with the sword and the order, and the five services, each with a config only root may read.
const crown = cwd => {
  const tree = actThreeTree();
  const mine = { owner: 'hero' };
  tree.children.home.children.hero.children.crown = dir({ 'sword.txt': file('', mine), 'order.txt': file('', mine) }, mine);
  for (const service of ['mill', 'bakery', 'stables', 'lighthouse', 'granary']) tree.children.srv.children[service] = dir({ 'config.txt': file('', { mode: 0o600 }) });
  return { obs: { ...observe(cwd, { tree }), groups: ['hero', 'sudo'] } };
};

// Chapters 17 and 19: the hall of portals with a hard link and a broken link, the boss maze, the study.
const links = cwd => {
  const tree = actThreeTree();
  const mine = { owner: 'hero' };
  const twin = ino => ({ ...file('A map.\n', mine), ino, links: 2 });
  const hero = tree.children.home.children.hero.children;
  hero.portals = dir({ 'scroll.txt': twin(1847), 'copy.txt': twin(1847), old_portal: symlink('/home/hero/portals/scroll.txt', mine) }, mine);
  hero.maze = dir({
    'map.txt': file('', mine),
    gate_k4m: symlink('/home/hero/maze/vaults/vault_ad7', mine),
    gate_fy3: symlink('/home/hero/maze/vaults/vault_wp9', mine),
    gate_hu6: symlink('/home/hero/maze/vaults/vault_old', mine),
    vaults: dir({ vault_ad7: dir({ 'treasure.txt': file('', mine) }, mine), vault_wp9: dir({}, mine) }, { owner: 'hero', mode: 0o311 }),
  }, mine);
  hero.memory = dir({ 'request.txt': file('', mine) }, mine);
  return { obs: { ...observe(cwd, { tree }), groups: ['hero'] } };
};

const imp = (pid, cmd, key, cpu = 0.3) => ({ pid, ppid: 1, user: 'hero', tty: '?', stat: 'S', cpu, mem: 0.4, cmd, key });
const shell = imp(100, '-bash', 'shell');
const impsAndStubborn = [shell, imp(412, 'imp', 'imp'), imp(413, 'imp', 'imp2'), imp(420, './greedy_imp --eat', 'greedy', 88.1), imp(431, 'stubborn_imp', 'stubborn')];
const disguised = [shell, imp(512, 'imp', 'imp'), imp(519, 'ghostly_imp', 'imp2'), imp(533, 'nibbler', 'daemon', 97.2), imp(540, 'imp', 'imp3')];

const crowd = [...impsAndStubborn, imp(4242, './shadow_daemon', 'daemon', 99.7), imp(450, 'imp', 'imp9'), imp(451, 'imp', 'imp10')];

const daemon = [{ pid: 4242, ppid: 1, user: 'hero', tty: '?', stat: 'R', cpu: 99.7, mem: 12.4, cmd: './shadow_daemon', key: 'daemon' }];

// Chapter 20: the busy workshop, with a few rooms and blades, and the player's forge jobs.
const workshop = (doors, withJobs = false) => {
  const tree = busyTree();
  const mine = { owner: 'hero' };
  const rooms = Object.fromEntries(['forge', 'store', 'yard', 'loft', 'cellar', 'kiln', 'shed', 'mill', 'well'].slice(0, doors).map(name => [name, dir({}, mine)]));
  tree.children.home.children.hero.children.workshop = dir({ ...rooms, 'blade.txt': file('', mine), 'order.txt': file('', mine), 'temper.sh': file('', { ...mine, mode: 0o755 }) }, mine);
  const jobs = withJobs ? [{ id: 1, pid: 4301, cmd: 'sleep 600', state: 'running', mark: '-' }, { id: 2, pid: 4302, cmd: 'sleep 300', state: 'stopped', mark: '+' }] : [];
  return { obs: observe('/home/hero/workshop', { tree, jobs }) };
};

// Chapter 21: the travel camp with the archives the chapter makes, and the room they unpack into.
const travel = cwd => {
  const tree = busyTree();
  const mine = { owner: 'hero' };
  const t = Date.UTC(2026, 9, 1, 12, 0);
  const tar = packTar([
    { path: 'library/', type: 'dir', mode: 0o755, owner: 'hero', group: 'hero', mtime: t },
    { path: 'library/scroll_of_ages.txt', type: 'file', mode: 0o644, owner: 'hero', group: 'hero', mtime: t, content: 'Old words.\n' },
  ]);
  const unpacked = dir({ library: dir({ 'scroll_of_ages.txt': file('Old words.\n', mine), 'catalogue.txt': file('', mine) }, mine) }, mine);
  tree.children.home.children.hero.children.travel = dir({
    unpacked,
    'library.tar': file(tar, mine),
    'library.tar.gz': file(gzip(tar), mine),
    'notes.txt.gz': file(gzip('Notes for the road.\n', { name: 'notes.txt' }), mine),
    'packing_list.txt': file('', mine),
  }, mine);
  return { obs: observe(cwd, { tree }) };
};

const job = (id, state, cmd) => ({ id, pid: 4240 + id, cmd, state, mark: ' ' });
const jobs = [job(1, 'running', 'sleep 30'), job(2, 'stopped', 'sleep 100'), job(3, 'running', 'sleep 600')];
const manyJobs = [...jobs, job(4, 'running', 'sleep 9'), job(5, 'stopped', 'sleep 8')];

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
  jobs: () => ({ obs: observe('/home/hero', { tree: busyTree(), jobs }) }),
  'jobs-dungeon': () => ({ obs: observe('/usr/bin', { tree: busyTree(), jobs: manyJobs }) }),
  'jobs-den': () => ({ obs: observe('/home/hero/den', { tree: actTwoTree(), jobs: jobs.slice(0, 2) }), procs: impsAndStubborn }),
  forge: () => ({ obs: observe('/home/hero/forge', { tree: actTwoTree() }) }),
  ore: () => ({ obs: observe('/home/hero/forge/ore', { tree: actTwoTree() }) }),
  guild: () => ({ obs: observe('/usr/local/bin', { tree: actTwoTree() }) }),
  hall: () => ({ obs: observe('/', { tree: busyTree() }) }),
  srv: () => scribe('/srv'),
  guildhall: () => scribe('/srv/guild'),
  guildarchive: () => scribe('/srv/guild/archive'),
  homes: () => scribe('/home'),
  outpost: () => scribe('/home/hero/guild'),
  throne: () => crown('/home/hero/crown'),
  portals: () => links('/home/hero/portals'),
  maze: () => links('/home/hero/maze'),
  vaults: () => links('/home/hero/maze/vaults'),
  study: () => links('/home/hero/memory'),
  smithy: () => workshop(1),
  'smithy-busy': () => workshop(9, true),
  departure: () => travel('/home/hero/travel'),
  unpacked: () => travel('/home/hero/travel/unpacked'),
  'unpacked-library': () => travel('/home/hero/travel/unpacked/library'),
  mill: () => crown('/srv/mill'),
  bakery: () => crown('/srv/bakery'),
  stables: () => crown('/srv/stables'),
  lighthouse: () => crown('/srv/lighthouse'),
  granary: () => crown('/srv/granary'),
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
