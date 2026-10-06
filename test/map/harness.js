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
  tree.children.home.children.hero.children.camp = dir({ 'campfire.txt': file('', { owner: 'hero' }) }, { owner: 'hero' });
  tree.children.home.children.hero.children.library = dir({ 'scroll_of_ages.txt': file('', { owner: 'hero' }), 'librarian.txt': file('', { owner: 'hero' }) }, { owner: 'hero' });
  tree.children.home.children.hero.children.market = dir({ 'inventory.txt': file('', { owner: 'hero' }) }, { owner: 'hero' });
  return tree;
}

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
  hall: () => ({ obs: observe('/', { tree: busyTree() }) }),
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
