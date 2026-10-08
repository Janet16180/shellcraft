/**
 * Chapter 16, The Shared Hall: what r, w and x mean on a directory. Without
 * x you cannot go in or use any name inside; without r you cannot list the
 * names but can still use one you know; removing a file changes its
 * directory, so it needs w on the directory, not on the file. chgrp gives a
 * directory to a faction. The boss room: a faction asks, in a note, for a
 * room with a random name that only they (and you) may use.
 */
import { put, remove, cd, dir, file } from '../../backend/spec.js';
import { realm } from '../people.js';
import { token, pick } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const KEY_TEXT = 'The key of the vault. Whoever knows my name may read me.\n';
const OLD_TEXT = 'An old list nobody needs.\n';
const RULES_TEXT = 'The archive keeps what is written. Nothing leaves it without w on the archive.\n';

const hallOf = ctx => `${ctx.home}/hall`;
const vaultOf = ctx => `${hallOf(ctx)}/vault`;
const keyOf = ctx => `${vaultOf(ctx)}/key.txt`;
const archiveOf = ctx => `${hallOf(ctx)}/archive`;
const oldOf = ctx => `${archiveOf(ctx)}/old.txt`;
const sharedOf = ctx => `${hallOf(ctx)}/shared`;
const tilde = path => path.replace(/^\/home\/[^/]+/, '~');

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;
const modeOf = (ctx, path) => (ctx.node(path) ? ctx.node(path).mode & 0o777 : 0);
const has = (ctx, path, bits) => (modeOf(ctx, path) & bits) === bits;
const letters = (mode, shift) => ['r', 'w', 'x'].map((l, i) => ((mode >> shift) & (4 >> i) ? l : '-')).join('');
const rwx = mode => `d${letters(mode, 6)}${letters(mode, 3)}${letters(mode, 0)}`;

const failed = (ctx, name, path) => ctx.tried(name, record => record.status !== 0 && ctx.hasPath(record, path));
const worked = (ctx, name, path) => ctx.ran(name, record => ctx.hasPath(record, path));
const changed = (ctx, path) => ['chmod', 'chgrp'].some(name => ctx.ran(name, record => ctx.hasPath(record, path)));
const wasThere = (ctx, path) => Boolean(nodeAt(ctx.before.tree, path));

const NO_X = 0o100;
const NO_R = 0o400;
const W = 0o200;

function setupBoss(random, { home, user }) {
  const faction = pick(random, ['smiths', 'scribes']);
  const room = `${home}/hall/room_${token(random, 3)}`;
  const request = `A request from the ${faction}:
Please give us the room ${tilde(room)}.
We must be able to go in, list it, and add and remove things in it.
Nobody else may even go in. You, who own it, may keep everything.
`;
  return {
    patch: [
      put(room, dir({ 'table.txt': file('A long wooden table.\n', { owner: user }) }, { owner: user })),
      put(`${home}/hall/request.txt`, file(request, { owner: user })),
      cd(home),
    ],
    secret: { faction, room },
  };
}

const bossDone = (ctx, { faction, room }) => changed(ctx, room) && ctx.node(room)?.group === faction && modeOf(ctx, room) === 0o770;

// What is still wrong with a shared room's group or mode, or null.
function roomNote(ctx, path, faction, request) {
  const node = ctx.node(path);
  const mode = modeOf(ctx, path);
  const where = tilde(path);
  return firstNote([
    [() => node.group !== faction && node.group !== ctx.home.split('/').pop(), `Its group is ${node.group}, but ${request} the ${faction}: chgrp ${faction} ${where}.`],
    [() => node.group !== faction, `Its group is still ${node.group}. Give it to the ${faction}: chgrp ${faction} ${where}.`],
    [() => (mode & 0o007) !== 0, `Its mode is ${rwx(mode)}: everyone else may still ${letters(mode, 0)}. Take that away: chmod o-rwx ${where}.`],
    [() => (mode & 0o070) !== 0o070, `Its mode is ${rwx(mode)}. The group needs r to list, w to add and remove, and x to go in: chmod g+rwx ${where}.`],
    [() => (mode & 0o700) !== 0o700, `Keep r, w and x for yourself too: chmod u+rwx ${where}.`],
  ]);
}

function bossNear(ctx, secret) {
  if (bossDone(ctx, secret) || !changed(ctx, secret.room)) return null;
  return roomNote(ctx, secret.room, secret.faction, 'the request in ~/hall/request.txt is from');
}

function solveBoss(obs) {
  const request = nodeAt(obs.tree, `${obs.home}/hall/request.txt`).content;
  const faction = request.match(/from the (\w+)/)[1];
  const room = request.match(/room (\S+)\./)[1];
  return ['cat ~/hall/request.txt', `chgrp ${faction} ${room}`, `chmod 770 ${room}`];
}

export default {
  id: 'hall',
  act: 3,
  title: 'The Shared Hall',
  setup: (_random, player) => {
    const { home, user } = player;
    const mine = { owner: user };
    return [
      ...realm(player, { factions: ['smiths', 'scribes'] }),
      put(`${home}/hall`, dir({
        vault: dir({ 'key.txt': file(KEY_TEXT, mine) }, mine),
        archive: dir({ 'old.txt': file(OLD_TEXT, mine), 'rules.txt': file(RULES_TEXT, mine) }, { owner: user, mode: 0o555 }),
        shared: dir({}, mine),
      }, mine)),
      remove(`${home}/hall/request.txt`),
      cd(home),
    ];
  },
  lesson: `<p>The guild gave you a hall of your own, <code>~/hall</code>, and the smiths took you in too: you are in both factions now. (<code>groups</code> shows it.)</p>
<p>A directory is a list of names. Its letters mean something a little different from a file's:</p>
<table class="chmod-ways dir-perms">
<tr><th>Letter</th><th>On a file</th><th>On a directory</th></tr>
<tr><td><code>r</code></td><td>read what is in it</td><td>list the names in it (<code>ls</code>)</td></tr>
<tr><td><code>w</code></td><td>change what is in it</td><td>add, remove or rename names in it</td></tr>
<tr><td><code>x</code></td><td>run it as a program</td><td>go into it (<code>cd</code>) and use the names in it</td></tr>
</table>
<ul>
<li>Without <code>x</code>, you cannot go into a directory or open anything inside it, even when <code>ls</code> can still list the names.</li>
<li>Without <code>r</code> but with <code>x</code>, <code>ls</code> is refused, but a file whose name you know can still be read.</li>
<li>Removing a file takes its name out of the directory, so it needs <code>w</code> on the <b>directory</b>. The file's own <code>w</code> does not matter for that.</li>
</ul>
<p><code>chgrp</code> (change group) gives a file or directory to another group: <code>chgrp scribes FILE</code>. You may do it for what you own, and only to a group you are in. Then the group letters decide what that faction may do.</p>`,
  tasks: [
    {
      goal: 'Take `x` away from the directory `~/hall/vault` (`chmod u-x`), then try to go into it with `cd`',
      tip: 'Without `x` on a directory, `cd` is refused, and so is every name inside it.',
      hints: [
        'Two steps: take away your own `x`, then try `cd`.',
        '`chmod u-x` and the vault\'s path, then `cd` and the same path.',
        'chmod u-x ~/hall/vault && cd ~/hall/vault',
      ],
      done: ctx => failed(ctx, 'cd', vaultOf(ctx)) && !has(ctx, vaultOf(ctx), NO_X),
      near: ctx => firstNote([
        [() => worked(ctx, 'cd', vaultOf(ctx)), `You still have x on the vault, so cd worked. Take it away first: chmod u-x ${tilde(vaultOf(ctx))}.`],
        [() => worked(ctx, 'ls', vaultOf(ctx)) && !has(ctx, vaultOf(ctx), NO_X), 'r lets ls read the names, so that still works. Now try to go in: cd ~/hall/vault.'],
      ]),
    },
    {
      goal: 'Give `x` back to `~/hall/vault` and take `r` away (`chmod u+x,u-r`), then try to list it with `ls`',
      tip: 'Without `r` on a directory, `ls` may not read its list of names.',
      hints: [
        'Two changes in one `chmod`, joined by a comma, then `ls`.',
        '`chmod u+x,u-r` and the path, then `ls` and the same path.',
        'chmod u+x,u-r ~/hall/vault && ls ~/hall/vault',
      ],
      done: ctx => failed(ctx, 'ls', vaultOf(ctx)) && has(ctx, vaultOf(ctx), NO_X) && !has(ctx, vaultOf(ctx), NO_R),
      near: ctx => firstNote([
        [() => worked(ctx, 'ls', vaultOf(ctx)), `You still have r on the vault, so ls listed it. Take it away: chmod u-r ${tilde(vaultOf(ctx))}.`],
        [() => failed(ctx, 'ls', vaultOf(ctx)) && !has(ctx, vaultOf(ctx), NO_X), `This task wants x back first: chmod u+x ${tilde(vaultOf(ctx))}, then ls again.`],
      ]),
    },
    {
      goal: 'Read `~/hall/vault/key.txt`, although you cannot list the vault',
      tip: 'With `x` but no `r`, you cannot list the names, but you can still open a name you know.',
      hints: [
        'You know the file\'s name, and you have `x` on the vault.',
        'Read it with `cat` and its full path.',
        'cat ~/hall/vault/key.txt',
      ],
      done: ctx => ctx.read(keyOf(ctx)) && has(ctx, vaultOf(ctx), NO_X) && !has(ctx, vaultOf(ctx), NO_R),
      near: ctx => firstNote([
        [() => ctx.read(keyOf(ctx)), `The vault still has r, so that is no surprise. Take r away first: chmod u-r ${tilde(vaultOf(ctx))}.`],
        [() => failed(ctx, 'cat', keyOf(ctx)), `To use a name inside, you need x on the directory: chmod u+x ${tilde(vaultOf(ctx))}.`],
      ]),
    },
    {
      goal: 'Try to remove `~/hall/archive/old.txt`, and read why it refuses',
      tip: 'The archive is `r-x` for you: no `w`, so no name may be added to it or removed from it.',
      hints: [
        'Look at the archive with `ls -ld ~/hall/archive` first: `dr-xr-xr-x`.',
        'Try `rm` and the file\'s path. It will fail, and that is the point.',
        'rm ~/hall/archive/old.txt',
      ],
      done: ctx => failed(ctx, 'rm', oldOf(ctx)) && Boolean(ctx.node(oldOf(ctx))) && !has(ctx, archiveOf(ctx), W),
      near: ctx => (!ctx.node(oldOf(ctx)) && wasThere(ctx, oldOf(ctx))
        ? 'old.txt is gone: you had already given yourself w on the directory. Press Restart chapter in the HUD to see the refusal.' : null),
    },
    {
      goal: 'Give yourself `w` on the directory `~/hall/archive`, then remove `old.txt` from it',
      tip: 'Removing a file changes the directory\'s list of names, so the directory needs `w`.',
      hints: [
        'The file is fine. It is the archive directory that is missing a letter.',
        '`chmod u+w` and the archive\'s path, then `rm` the file.',
        'chmod u+w ~/hall/archive && rm ~/hall/archive/old.txt',
      ],
      done: ctx => !ctx.node(oldOf(ctx)) && wasThere(ctx, oldOf(ctx)) && ctx.tried('rm', record => ctx.hasPath(record, oldOf(ctx))),
      near: ctx => firstNote([
        [() => worked(ctx, 'chmod', oldOf(ctx)), `That changed the file. Removing it changes the directory: chmod u+w ${tilde(archiveOf(ctx))}.`],
        [() => failed(ctx, 'rm', oldOf(ctx)) && has(ctx, oldOf(ctx), W), `old.txt already has w. rm needs w on its directory: chmod u+w ${tilde(archiveOf(ctx))}.`],
      ]),
    },
    {
      goal: 'Give the directory `~/hall/shared` to the `scribes` (`chgrp`: change group)',
      tip: '`chgrp`, the group, then the path: you may give what you own to a group you are in.',
      hints: [
        'The shared room\'s group is `hero`. It should be `scribes`.',
        '`chgrp`, the group name, then the path.',
        'chgrp scribes ~/hall/shared',
      ],
      done: ctx => ctx.node(sharedOf(ctx))?.group === 'scribes' && worked(ctx, 'chgrp', sharedOf(ctx)),
      near: ctx => (worked(ctx, 'chgrp', sharedOf(ctx)) ? 'This room is for the scribes: chgrp scribes ~/hall/shared.' : null),
    },
    {
      goal: 'Let the scribes do everything in `~/hall/shared`, and everyone else nothing (`chmod 770`, or with letters)',
      tip: '`770` is `rwx` for you, `rwx` for the group, and nothing for everyone else.',
      hints: [
        'The group needs `r`, `w` and `x` on the room. Everyone else needs none.',
        'With numbers: 7 for you, 7 for the group, 0 for the rest.',
        'chmod 770 ~/hall/shared',
      ],
      done: ctx => worked(ctx, 'chmod', sharedOf(ctx)) && ctx.node(sharedOf(ctx))?.group === 'scribes' && modeOf(ctx, sharedOf(ctx)) === 0o770,
      near: ctx => (worked(ctx, 'chmod', sharedOf(ctx)) && modeOf(ctx, sharedOf(ctx)) !== 0o770) || (worked(ctx, 'chmod', sharedOf(ctx)) && ctx.node(sharedOf(ctx))?.group !== 'scribes')
        ? roomNote(ctx, sharedOf(ctx), 'scribes', 'this room is for') : null,
    },
  ],
  solve: [
    'chmod u-x ~/hall/vault',
    'cd ~/hall/vault',
    'chmod u+x,u-r ~/hall/vault',
    'ls ~/hall/vault',
    'cat ~/hall/vault/key.txt',
    'rm ~/hall/archive/old.txt',
    'chmod u+w ~/hall/archive',
    'rm ~/hall/archive/old.txt',
    'chgrp scribes ~/hall/shared',
    'chmod 770 ~/hall/shared',
  ],
  boss: {
    title: 'The Faction Room',
    briefing: `<p>A faction has left a request in <code>~/hall/request.txt</code>. It names a room in your hall and the faction that wants it. Read it, then make the room theirs: the faction may go in, list it, and add and remove things in it; everyone else may not even go in. You keep everything.</p>`,
    setup: setupBoss,
    hints: [
      'Read the request with `cat ~/hall/request.txt`. Two changes follow: the room\'s group, then its mode.',
      '`chgrp` with the faction and the room, then `chmod 770` and the room.',
      ({ faction, room }) => `chgrp ${faction} ${tilde(room)} && chmod 770 ${tilde(room)}`,
    ],
    done: bossDone,
    near: bossNear,
    solve: solveBoss,
  },
  recap: [
    ['chmod u-x DIR', 'nobody of your class may go into it or use names inside'],
    ['chmod u-r DIR', 'ls is refused, but known names still work (with x)'],
    ['chmod u+w DIR', 'you may add and remove names in it'],
    ['chgrp scribes FILE', 'give it to a group you are in'],
    ['chmod 770 DIR', 'everything for you and the group, nothing for everyone else'],
  ],
  why: `<p>Why does removing a file need <code>w</code> on the directory? A directory is a list of names, each pointing at a file. Removing a file takes its name off that list, so it is the list, the directory, that changes.</p>
<p>Why are <code>r</code> and <code>x</code> separate for directories? <code>r</code> reads the list of names, and <code>x</code> lets you pass through to use them. A directory with only <code>x</code> is like a hall of closed doors: you may open a door whose name you know, but you cannot see the list.</p>`,
  field: [
    ['ls -ld DIR', 'the mode of a directory itself'],
    ['chown :scribes FILE', 'another way to change only the group'],
    ['chmod g+s DIR', 'new files inside take the directory\'s group (setgid)'],
    ['chgrp -R scribes DIR', 'change the group of a directory and everything in it'],
  ],
  spells: [
    { name: 'chgrp', summary: 'Give a file or directory to another group.', examples: [['chgrp scribes ~/hall/shared', 'its group becomes scribes']] },
    { name: 'chmod on a directory', summary: 'r lists, w adds and removes, x goes in.', examples: [['chmod u-x ~/hall/vault', 'no going in'], ['chmod 770 ~/hall/shared', 'you and the group only']] },
  ],
};
