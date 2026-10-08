import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePatch, login } from '../../src/backend/spec.js';
import { baseWorld, restore, accounts, HOME_NAMES } from '../../src/game/world.js';
import { createSimBackend } from '../../src/shell/backend.js';
import { PLAYER } from '../../src/backend/player.js';


function nodeIn(patch, path) {
  const top = patch.find(op => op.op === 'put' && (path === op.path || path.startsWith(`${op.path}/`)));
  if (!top) return undefined;
  const rest = path.slice(top.path.length).split('/').filter(Boolean);
  return rest.reduce((node, name) => node?.children?.[name], top.node);
}

function walk(node, path, visit) {
  visit(node, path);
  for (const [name, child] of Object.entries(node.children ?? {})) walk(child, `${path}/${name}`, visit);
}

test('the base world is a well-formed patch that ends with the player at home', () => {
  const patch = baseWorld(PLAYER);
  assert.equal(validatePatch(patch), patch);
  assert.deepEqual(patch.at(-1), { op: 'cd', path: '/home/hero' });
});

test('the base world logs the player in again, so a fresh world brings fresh groups', () => {
  assert.ok(baseWorld(PLAYER).some(op => op.op === 'login'));
});

test('the base world leaves /usr and /dev to the backend', () => {
  const paths = baseWorld(PLAYER).filter(op => op.op === 'put').map(op => op.path);
  assert.deepEqual(paths.sort(), ['/etc', '/home', '/root', '/tmp', '/var']);
});

test('the home starts with the cottage files and every overworld area', () => {
  const home = nodeIn(baseWorld(PLAYER), '/home/hero');
  assert.deepEqual(Object.keys(home.children).sort(), [...HOME_NAMES].sort());
  for (const name of ['readme.txt', '.secret_map', '.bashrc', 'forest', 'junk', 'library', 'tower', 'market', 'gate']) {
    assert.ok(HOME_NAMES.includes(name), name);
  }
  assert.equal(nodeIn(baseWorld(PLAYER), '/home/hero/forest/cave/deep/ancient_key.txt').type, 'file');
});

test('everything in the home belongs to the player, and the home itself is private to them', () => {
  const home = nodeIn(baseWorld(PLAYER), '/home/hero');
  assert.equal(home.mode, 0o750);
  walk(home, '/home/hero', (node, path) => {
    assert.equal(node.owner, 'hero', path);
    assert.equal(node.group, 'hero', path);
  });
});

test('nothing outside the home belongs to the player', () => {
  for (const op of baseWorld(PLAYER).filter(o => o.op === 'put')) {
    walk(op.node, op.path, (node, path) => {
      if (path === '/home/hero' || path.startsWith('/home/hero/')) return;
      assert.notEqual(node.owner, 'hero', path);
    });
  }
});

test('the dungeon has the owners and modes of Ubuntu 24.04', () => {
  const patch = baseWorld(PLAYER);
  const expect = {
    '/home': ['root', 'root', 0o755],
    '/root': ['root', 'root', 0o700],
    '/tmp': ['root', 'root', 0o1777],
    '/etc/passwd': ['root', 'root', 0o644],
    '/var/log': ['root', 'syslog', 0o775],
    '/var/log/syslog': ['syslog', 'adm', 0o640],
    '/var/log/auth.log': ['syslog', 'adm', 0o640],
    '/var/log/dpkg.log': ['root', 'root', 0o644],
  };
  for (const [path, [owner, group, mode]] of Object.entries(expect)) {
    const node = nodeIn(patch, path);
    assert.deepEqual([node.owner, node.group, node.mode], [owner, group, mode], path);
  }
});

test('the system files name the player, their home and the host', () => {
  const patch = baseWorld(PLAYER);
  assert.match(nodeIn(patch, '/etc/passwd').content, /^hero:x:1000:1000:Hero,,,:\/home\/hero:\/bin\/bash$/m);
  assert.match(nodeIn(patch, '/etc/group').content, /^hero:x:1000:$/m);
  assert.doesNotMatch(nodeIn(patch, '/etc/group').content, /[:,]hero(,|$)/m, 'hero is in no other group, as the simulator says');
  assert.equal(nodeIn(patch, '/etc/hostname').content, 'kernelia\n');
  assert.match(nodeIn(patch, '/etc/hosts').content, /^127\.0\.0\.1 localhost\n127\.0\.1\.1 kernelia\n/);
  assert.match(nodeIn(patch, '/home/hero/readme.txt').content, /-- The Guardian of Root\n$/);
});

test('every line of the syslog has the rsyslog timestamp, the host and a tag', () => {
  const lines = nodeIn(baseWorld(PLAYER), '/var/log/syslog').content.trimEnd().split('\n');
  for (const line of lines) assert.match(line, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}\+00:00 kernelia [\w-]+(\[\d+\])?: /, line);
});

test('a home that is not /home/USER, or a missing host, is a bug and raises', () => {
  assert.throws(() => baseWorld({ ...PLAYER, home: '/root' }), /home/);
  assert.throws(() => baseWorld({ home: '/home/hero', user: 'hero' }), /host/);
  assert.throws(() => baseWorld({ ...PLAYER, host: '' }), /host/);
  assert.throws(() => restore('forest', { home: '/home/other', user: 'hero' }), /home/);
});

test('restoring an area puts it back exactly as the base world has it', () => {
  const [op] = restore('forest', PLAYER);
  assert.deepEqual(op, { op: 'put', path: '/home/hero/forest', node: nodeIn(baseWorld(PLAYER), '/home/hero/forest') });
  assert.equal(validatePatch(restore('readme.txt', PLAYER)).length, 1);
});

test('restoring a name the home never had raises', () => {
  assert.throws(() => restore('camp', PLAYER), /unknown/);
});

test('another machine name reaches every file that names the host, and kernelia appears nowhere', () => {
  const patch = baseWorld({ ...PLAYER, host: 'lab7' });
  assert.equal(nodeIn(patch, '/etc/hostname').content, 'lab7\n');
  assert.match(nodeIn(patch, '/etc/hosts').content, /^127\.0\.1\.1 lab7$/m);
  assert.match(nodeIn(patch, '/etc/motd').content, /lab7/);
  assert.match(nodeIn(patch, '/var/log/syslog').content, / lab7 guardian: /);
  assert.match(nodeIn(patch, '/var/log/auth.log').content, / lab7 CRON\[/);
  for (const op of patch.filter(o => o.op === 'put')) {
    walk(op.node, op.path, (node, path) => assert.doesNotMatch(node.content ?? '', /kernelia/, path));
  }
});

test('/etc/hosts is the file Ubuntu\'s server installer writes, owned by root', () => {
  const hosts = nodeIn(baseWorld(PLAYER), '/etc/hosts');
  assert.deepEqual([hosts.owner, hosts.mode], ['root', 0o644]);
  assert.equal(hosts.content.split('\n').length, 10);
  assert.match(hosts.content, /^::1 {5}ip6-localhost ip6-loopback$/m);
});

test('another player gets their own name and home in every owned node', () => {
  const player = { ...PLAYER, home: '/home/ada', user: 'ada' };
  const home = nodeIn(baseWorld(player), '/home/ada');
  walk(home, '/home/ada', (node, path) => assert.equal(node.owner, 'ada', path));
  assert.match(nodeIn(baseWorld(player), '/home/ada/forest/river/fish.txt').content, /\/home\/ada\/forest\/river/);
});

const names = listing => listing.split(/\s+/).filter(Boolean);

async function simulator() {
  const backend = createSimBackend({ now: () => Date.UTC(2026, 9, 6, 12) });
  await backend.load(baseWorld(PLAYER));
  const run = async line => {
    const result = await backend.run(line);
    const text = stream => result.output.filter(c => c.stream === stream).map(c => c.text).join('');
    return { status: result.status, out: text('out'), err: text('err') };
  };
  return { backend, run };
}

test('on the simulator, the top of the tree holds the dungeon rooms beside the backend\'s own', async () => {
  const { run } = await simulator();
  assert.deepEqual(names((await run('ls /')).out), ['dev', 'etc', 'home', 'root', 'tmp', 'usr', 'var']);
});

test('on the simulator, the player starts at home and sees the cottage and the areas', async () => {
  const { backend, run } = await simulator();
  assert.equal((await backend.observe()).cwd, '/home/hero');
  assert.deepEqual(names((await run('ls')).out), ['forest', 'gate', 'junk', 'library', 'market', 'readme.txt', 'tower']);
});

test('on the simulator, the player may enter and read the open rooms of the dungeon', async () => {
  const { run } = await simulator();
  for (const path of ['/etc', '/var/log', '/var/log/apt', '/tmp', '/home']) assert.equal((await run(`cd ${path}`)).status, 0, path);
  assert.equal((await run('cat /etc/hostname')).out, 'kernelia\n');
  assert.equal((await run('cat /var/log/dpkg.log')).status, 0);
});

test('on the simulator, root\'s home and the system logs are locked to the player', async () => {
  const { run } = await simulator();
  assert.match((await run('cd /root')).err, /Permission denied/);
  assert.match((await run('cat /var/log/syslog')).err, /Permission denied/);
  assert.match((await run('cat /var/log/auth.log')).err, /Permission denied/);
  assert.match((await run('touch /etc/motd')).err, /Permission denied/);
});

test('on the simulator, the name, host and groups agree with /etc/passwd, /etc/hostname and /etc/group', async () => {
  const { run } = await simulator();
  assert.equal((await run('whoami')).out, 'hero\n');
  assert.equal((await run('hostname')).out, (await run('cat /etc/hostname')).out);
  assert.equal((await run('id')).out, 'uid=1000(hero) gid=1000(hero) groups=1000(hero)\n');
});

test('on the simulator, restoring an area brings back what the player deleted', async () => {
  const { backend, run } = await simulator();
  await run('rm -r forest');
  await backend.load(restore('forest', PLAYER));
  assert.match((await run('cat forest/cave/deep/ancient_key.txt')).out, /The Ancient Key/);
});

const GUILD = {
  users: [{ name: 'mira', uid: 1001, group: 'smiths' }, { name: 'oren', uid: 1002, group: 'scribes' }],
  groups: [{ name: 'smiths', gid: 1001 }, { name: 'scribes', gid: 1002, members: ['hero', 'oren'] }],
};

test('accounts writes the base users and groups plus the new ones', () => {
  const [passwd, group] = accounts(PLAYER, GUILD);
  assert.equal(passwd.path, '/etc/passwd');
  assert.match(passwd.node.content, /^root:x:0:0:root:\/root:\/bin\/bash\n/);
  assert.match(passwd.node.content, /\nhero:x:1000:1000:Hero,,,:\/home\/hero:\/bin\/bash\nmira:x:1001:1001:Mira,,,:\/home\/mira:\/bin\/bash\noren:x:1002:1002:Oren,,,:\/home\/oren:\/bin\/bash\n$/);
  assert.match(group.node.content, /\nhero:x:1000:\nsmiths:x:1001:\nscribes:x:1002:hero,oren\n$/);
  assert.deepEqual(validatePatch(accounts(PLAYER, GUILD)).map(op => op.path), ['/etc/passwd', '/etc/group', '/etc/shadow']);
});

test('accounts writes /etc/shadow, root-only, with a made-up hash for each person, never the password', () => {
  const shadow = accounts(PLAYER, GUILD)[2].node;
  assert.deepEqual([shadow.mode, shadow.owner, shadow.group], [0o640, 'root', 'shadow']);
  assert.match(shadow.content, /^root:\*:20713:0:99999:7:::\n/);
  assert.match(shadow.content, /\nhero:\$y\$j9T\$[./0-9A-Za-z]{22}\$[./0-9A-Za-z]{43}:20713:0:99999:7:::\nmira:\$y\$j9T\$/);
  assert.notEqual(shadow.content.match(/^hero:(\S+?):/m)[1], shadow.content.match(/^mira:(\S+?):/m)[1]);
});

test('accounts adds sudoers to the sudo group, which must name known users', () => {
  const group = accounts(PLAYER, { ...GUILD, sudo: ['hero'] })[1].node.content;
  assert.match(group, /\nsudo:x:27:hero\n/);
  assert.match(accounts(PLAYER)[1].node.content, /\nsudo:x:27:\n/);
  assert.throws(() => accounts(PLAYER, { sudo: ['ghost'] }), /ghost/);
});

test("the base world has Ubuntu's sudoers, its README directory and a root-only shadow file", () => {
  const etc = baseWorld(PLAYER).find(op => op.path === '/etc').node.children;
  assert.deepEqual([etc.sudoers.mode, etc.sudoers.owner, etc.sudoers.group], [0o440, 'root', 'root']);
  assert.match(etc.sudoers.content, /\n%sudo\tALL=\(ALL:ALL\) ALL\n/);
  assert.equal(etc['sudoers.d'].children.README.mode, 0o440);
  assert.equal(etc.shadow.mode, 0o640);
});

test('accounts raises for a taken name or id, an unknown primary group or an unknown member', () => {
  assert.throws(() => accounts(PLAYER, { users: [{ name: 'hero', uid: 1005, group: 'hero' }] }), /taken/);
  assert.throws(() => accounts(PLAYER, { users: [{ name: 'mira', uid: 1000, group: 'hero' }] }), /taken/);
  assert.throws(() => accounts(PLAYER, { groups: [{ name: 'sudo', gid: 2000 }] }), /taken/);
  assert.throws(() => accounts(PLAYER, { users: [{ name: 'mira', uid: 1001, group: 'nosuch' }] }), /group nosuch/);
  assert.throws(() => accounts(PLAYER, { groups: [{ name: 'g', gid: 2000, members: ['ghost'] }] }), /ghost/);
});

test('on the simulator, accounts and login() put the player in the new group', async () => {
  const backend = createSimBackend({ now: () => 0, random: () => 0.5 });
  await backend.load(baseWorld(PLAYER));
  await backend.load([...accounts(PLAYER, GUILD), login()]);
  const r = await backend.run('id; id mira');
  assert.equal(r.output.map(c => c.text).join(''), 'uid=1000(hero) gid=1000(hero) groups=1000(hero),1002(scribes)\nuid=1001(mira) gid=1001(smiths) groups=1001(smiths)\n');
});
