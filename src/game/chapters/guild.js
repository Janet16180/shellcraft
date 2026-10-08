/**
 * Chapter 15, The Guild: users and groups. Other people live on the machine
 * (ls -l /home), each file has an owner and a group, id and groups say who is
 * in which group, and exactly one set of three letters counts for you: the
 * owner's if you own it, else the group's if you are in its group, else
 * everyone else's. The boss room fills an archive with scrolls under random
 * names: the player finds the one oren may read and writes its name down.
 */
import { put, remove, cd, dir, file, login } from '../../backend/spec.js';
import { accounts } from '../world.js';
import { token, shuffle, pick } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';
import { allows } from '../../backend/access.js';

const GUILD = '/srv/guild';
const LEDGER = `${GUILD}/ledger.txt`;
const PLANS = `${GUILD}/plans.txt`;
const ARCHIVE = `${GUILD}/archive`;
const OREN_GROUPS = ['oren', 'smiths'];

const LEDGER_TEXT = `THE SCRIBES' LEDGER
New member: hero, apprentice scribe. Welcome!
Ink: 3 pots. Quills: 12. Candles: low.
`;
const PLANS_TEXT = 'Plans of the smiths: a new blade for the guild master.\n';
const RULES_TEXT = `RULES OF THE GUILD
1. Every scroll has an owner and a group.
2. Smiths read what is for smiths. Scribes read what is for scribes.
3. What is for everyone, anyone may read.
`;
const NOTICE_TEXT = 'Notice from hero: I joined the scribes today.\n';

const PEOPLE = {
  users: [
    { name: 'mira', uid: 1001, group: 'mira' },
    { name: 'oren', uid: 1002, group: 'oren' },
    { name: 'tamsin', uid: 1003, group: 'tamsin' },
  ],
  groups: [
    { name: 'mira', gid: 1001 },
    { name: 'oren', gid: 1002 },
    { name: 'tamsin', gid: 1003 },
    { name: 'smiths', gid: 1100, members: ['mira', 'oren'] },
    { name: 'scribes', gid: 1101, members: ['tamsin', 'hero'] },
  ],
};

const guildOf = ctx => `${ctx.home}/guild`;
const noticeOf = ctx => `${guildOf(ctx)}/notice.txt`;
const answerOf = ctx => `${guildOf(ctx)}/answer.txt`;

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;
const READ_CMDS = ['cat', 'less', 'more', 'head', 'tail'];
const refused = (ctx, path) => ctx.commands.some(r => READ_CMDS.includes(r.name) && r.status !== 0 && ctx.hasPath(r, path));
const listsLong = (ctx, path) => ctx.ran('ls', record => ctx.flag(record, 'l') && !ctx.flag(record, 'd')
  && (ctx.hasPath(record, path) || (ctx.paths(record).length === 0 && record.cwd === path)));
const lists = (ctx, path) => ctx.ran('ls', record => ctx.hasPath(record, path) || (ctx.paths(record).length === 0 && record.cwd === path));
const asksAbout = (ctx, name, pred) => ['id', 'groups'].some(cmd => ctx.ran(cmd, record => pred(record.args.filter(a => !a.startsWith('-')), name)));
const modeOf = (ctx, path) => (ctx.node(path) ? ctx.node(path).mode & 0o777 : null);

// The mode letters of one class: 6 is the owner, 3 the group, 0 everyone else.
const letters = (mode, shift) => ['r', 'w', 'x'].map((l, i) => ((mode >> shift) & (4 >> i) ? l : '-')).join('');

// The archive's scrolls. Exactly one kind of winner and the decoys are picked for each room.
const WINNERS = {
  owner: { owner: 'oren', group: 'oren', mode: 0o400 },
  group: { owner: 'tamsin', group: 'smiths', mode: 0o640 },
  everyone: { owner: 'mira', group: 'mira', mode: 0o604 },
};
const DECOYS = {
  owner: { owner: 'oren', group: 'oren', mode: 0o044 },
  group: { owner: 'mira', group: 'smiths', mode: 0o604 },
  other: { owner: 'tamsin', group: 'scribes', mode: 0o640 },
  private: { owner: 'mira', group: 'mira', mode: 0o600 },
};

function setupBoss(random, { home }) {
  const winnerKind = pick(random, Object.keys(WINNERS));
  const decoyKinds = shuffle(random, Object.keys(DECOYS)).slice(0, 3 + Math.floor(random() * 2));
  const names = new Set();
  while (names.size < decoyKinds.length + 1) names.add(`scroll_${token(random, 3)}.txt`);
  const [winner, ...decoys] = shuffle(random, [...names]);
  const kinds = { [winner]: winnerKind, ...Object.fromEntries(decoys.map((name, i) => [name, decoyKinds[i]])) };
  const scrolls = Object.fromEntries(Object.entries(kinds).map(([name, kind]) => {
    const spec = name === winner ? WINNERS[kind] : DECOYS[kind];
    return [name, file(`A scroll of the guild archive: ${name}.\n`, spec)];
  }));
  return {
    patch: [put(ARCHIVE, dir(scrolls)), remove(`${home}/guild/answer.txt`), cd(home)],
    secret: { winner, kinds },
  };
}

const answered = ctx => {
  const text = ctx.node(answerOf(ctx))?.type === 'file' ? ctx.node(answerOf(ctx)).content.trim() : null;
  return text === null ? null : text.slice(text.lastIndexOf('/') + 1);
};

const bossDone = (ctx, { winner }) => answered(ctx) === winner;

// Which letters count for oren on a scroll, said in plain words.
function orenNote(node, name) {
  const mode = node.mode & 0o777;
  if (node.owner === 'oren') return `oren owns it, so only the owner letters count for him: ${letters(mode, 6)}. He may not read ${name}.`;
  if (OREN_GROUPS.includes(node.group)) return `oren is in ${node.group}, the group of ${name}, so only the group letters count for him: ${letters(mode, 3)}. What everyone else may do does not matter for him.`;
  return `oren is not the owner of ${name} (${node.owner}) and not in its group (${node.group}), so he gets the everyone else letters: ${letters(mode, 0)}.`;
}

function bossNear(ctx, secret) {
  const answer = answered(ctx);
  if (answer === null || bossDone(ctx, secret)) return null;
  const node = ctx.node(`${ARCHIVE}/${answer}`);
  return node ? orenNote(node, answer) : 'answer.txt should hold the name of one scroll in /srv/guild/archive, like scroll_abc.txt.';
}

function groupsOf(tree, user) {
  const lines = nodeAt(tree, '/etc/group').content.trim().split('\n').map(line => line.split(':'));
  const primary = nodeAt(tree, '/etc/passwd').content.split('\n').find(line => line.startsWith(`${user}:`)).split(':')[3];
  return lines.filter(([, , gid, members]) => gid === primary || members.split(',').includes(user)).map(([name]) => name);
}

function solveBoss(obs) {
  const who = { user: 'oren', groups: groupsOf(obs.tree, 'oren') };
  const scrolls = nodeAt(obs.tree, ARCHIVE).children;
  const name = Object.keys(scrolls).find(n => allows(scrolls[n], 'r', who));
  return ['id oren', 'ls -l /srv/guild/archive', `echo ${name} > ~/guild/answer.txt`];
}

export default {
  id: 'guild',
  act: 3,
  title: 'The Guild',
  explainer: 'perms',
  setup: (_random, player) => {
    const { home, user } = player;
    const own = name => ({ owner: name, group: name, mode: 0o750 });
    return [
      ...accounts(player, PEOPLE),
      login(),
      ...PEOPLE.users.map(({ name }) => put(`/home/${name}`, dir({}, own(name)))),
      put('/srv', dir({
        guild: dir({
          'ledger.txt': file(LEDGER_TEXT, { owner: 'tamsin', group: 'scribes', mode: 0o640 }),
          'plans.txt': file(PLANS_TEXT, { owner: 'mira', group: 'smiths', mode: 0o640 }),
          'rules.txt': file(RULES_TEXT),
        }),
      })),
      put(`${home}/guild`, dir({ 'notice.txt': file(NOTICE_TEXT, { owner: user, mode: 0o044 }) }, { owner: user })),
      cd(home),
    ];
  },
  lesson: `<p>You are not alone on this machine any more. Each person who logs in is a <b>user</b>, with a name and a home in <code>/home</code>. Users can belong to a <b>group</b>, like a faction of the guild: <code>smiths</code> or <code>scribes</code>. You just joined the scribes.</p>
<pre class="perm-line"><span class="perm-type">-</span><span class="perm-owner">rw-</span><span class="perm-group">r--</span><span class="perm-other">---</span> 1 <span class="perm-owner">mira</span> <span class="perm-group">smiths</span> 55 Oct  7 09:00 plans.txt</pre>
<ul>
<li>In <code>ls -l</code>, the first name is the file's <b class="perm-owner">owner</b> (here <code>mira</code>) and the second is its <b class="perm-group">group</b> (here <code>smiths</code>).</li>
<li><code>id</code> prints your user and every group you are in. <code>id mira</code> does the same for <code>mira</code>. <code>groups</code> and <code>groups mira</code> print only the group names.</li>
</ul>
<p>When you open a file, Linux asks up to three questions, in order, and stops at the first yes:</p>
<ol>
<li>Are you the <b class="perm-owner">owner</b>? Then the owner letters count.</li>
<li>Otherwise, is the file's <b class="perm-group">group</b> one of your groups? Then the group letters count.</li>
<li>Otherwise, you are <b class="perm-other">everyone else</b>, and the last three letters count.</li>
</ol>
<p>Only one set of letters ever counts for you. So if you own a file whose owner letters are <code>---</code>, you may not read it, even when everyone else may. As the owner, you can fix that with <code>chmod</code>.</p>`,
  tasks: [
    {
      goal: 'See who lives here: list the homes in `/home` in detail (`ls -l`: the first name on each line is the owner)',
      tip: 'Each person has a home directory in `/home`, and each home is owned by that person.',
      hints: [
        'The long listing shows the owner of every directory.',
        'Use `ls` with `-l` and the path `/home`.',
        'ls -l /home',
      ],
      done: ctx => listsLong(ctx, '/home'),
      near: ctx => (lists(ctx, '/home') && !listsLong(ctx, '/home') ? 'Add -l for the long listing: it shows who owns each home.' : null),
    },
    {
      goal: 'Find out which groups you are in now (`id`)',
      tip: '`id` prints your user, then every group you belong to: you should see `scribes`.',
      hints: [
        'You joined a faction of the guild. One short command lists your groups.',
        'Type `id`, or `groups`.',
        'id',
      ],
      done: ctx => asksAbout(ctx, 'hero', (names, me) => names.length === 0 || names.includes(me)),
      near: ctx => (ctx.ran('whoami') ? 'whoami prints only your name. id prints your groups too.' : null),
    },
    {
      goal: 'Find out which groups `mira` is in (`id mira`: `id` with a user name)',
      tip: 'With a user name after it, `id` prints that person\'s groups instead of yours.',
      hints: [
        'The same command as before, about someone else.',
        'Type `id`, a space, and the name `mira`.',
        'id mira',
      ],
      done: ctx => asksAbout(ctx, 'mira', (names, who) => names.includes(who)),
      near: ctx => (asksAbout(ctx, 'mira', names => names.length === 0) ? 'That printed your own groups. Put the name mira after id.' : null),
    },
    {
      goal: 'Look at the guild hall `/srv/guild` in detail: who owns each file, and which group it has',
      tip: 'In `ls -l`, the first name is the owner and the second is the group.',
      hints: [
        'The long listing of a directory shows the owner and the group of everything in it.',
        'Use `ls -l` and the path of the guild hall.',
        'ls -l /srv/guild',
      ],
      done: ctx => listsLong(ctx, GUILD),
      near: ctx => (lists(ctx, GUILD) && !listsLong(ctx, GUILD) ? 'Add -l to see the owner and the group of each file.' : null),
    },
    {
      goal: 'Read the scribes\' ledger `/srv/guild/ledger.txt`',
      tip: 'You do not own it, but its group is `scribes` and you are a scribe, so its group letters `r--` count for you.',
      hints: [
        'Its mode is `-rw-r-----`: the group may read it. Are you in its group?',
        'Read it the usual way, with `cat` and its path.',
        'cat /srv/guild/ledger.txt',
      ],
      done: ctx => ctx.read(LEDGER),
      near: ctx => (refused(ctx, PLANS) ? 'That is the smiths\' plans. The ledger is /srv/guild/ledger.txt.' : null),
    },
    {
      goal: 'Try to read the smiths\' plans `/srv/guild/plans.txt`, and read why it refuses',
      tip: 'You are not `mira` and not a smith, so you are everyone else, and its last three letters are `---`.',
      hints: [
        'Compare its owner and group with what `id` says about you.',
        'Try to read it with `cat`. It will fail, and that is the point.',
        'cat /srv/guild/plans.txt',
      ],
      done: ctx => refused(ctx, PLANS),
    },
    {
      goal: 'Try to read your own notice `~/guild/notice.txt`, and see that even you are refused',
      tip: 'You own it, so only the owner letters count for you, and they are `---`.',
      hints: [
        'Look at its mode first with `ls -l ~/guild`: `----r--r--`.',
        'Try to read it with `cat`.',
        'cat ~/guild/notice.txt',
      ],
      done: ctx => refused(ctx, noticeOf(ctx)),
    },
    {
      goal: 'Give yourself read on `~/guild/notice.txt` (`chmod u+r`: `u` is you, the owner), then read it',
      tip: 'As the owner you may change the mode, and `u+r` adds read to the owner letters only.',
      hints: [
        'The owner letters are the only ones that count for you. Add `r` to them.',
        '`chmod u+r` and the path, then `cat` it. Two commands, or one line with `&&`.',
        'chmod u+r ~/guild/notice.txt && cat ~/guild/notice.txt',
      ],
      done: ctx => ctx.read(noticeOf(ctx)),
      near: ctx => {
        const mode = modeOf(ctx, noticeOf(ctx));
        const changed = ctx.ran('chmod', record => ctx.hasPath(record, noticeOf(ctx)));
        return firstNote([
          [() => changed && (mode & 0o400) === 0, `That did not change the owner letters, and only they count for you. Use chmod u+r ~/guild/notice.txt.`],
          [() => changed && ctx.commands.length === 1, 'Now you may read it. Read it with cat ~/guild/notice.txt.'],
        ]);
      },
    },
  ],
  solve: [
    'ls -l /home',
    'id',
    'id mira',
    'ls -l /srv/guild',
    'cat /srv/guild/ledger.txt',
    'cat /srv/guild/plans.txt',
    'cat ~/guild/notice.txt',
    'chmod u+r ~/guild/notice.txt',
    'cat ~/guild/notice.txt',
  ],
  boss: {
    title: 'Oren\'s Errand',
    briefing: `<p>Oren the smith needs one scroll from the guild archive, <code>/srv/guild/archive</code>, but he may read only one of them. Find out which groups <code>oren</code> is in, look at the owner, group and mode of every scroll, and find the one scroll <code>oren</code> may read. Write its name into <code>~/guild/answer.txt</code>.</p>`,
    setup: setupBoss,
    hints: [
      'First `id oren`, then `ls -l /srv/guild/archive`. For each scroll, ask the three questions for oren: owner? group? everyone else?',
      'The scroll you want has `r` in the one set of letters that counts for oren. Write its name with `echo NAME > ~/guild/answer.txt`.',
      ({ winner }) => `echo ${winner} > ~/guild/answer.txt`,
    ],
    done: bossDone,
    near: bossNear,
    solve: solveBoss,
  },
  recap: [
    ['ls -l /home', 'the owner of each home: every person has one'],
    ['id', 'your user and all your groups'],
    ['id mira', 'the groups of another user'],
    ['groups mira', 'only the group names of a user'],
    ['ls -l /srv/guild', 'the owner (first name) and the group (second name) of each file'],
    ['chmod u+r FILE', 'add read to the owner letters, if you own the file'],
  ],
  why: `<p>Why groups? A team often needs to share files. Without groups, a file could be open to its owner only, or to everyone. A group lets the owner share it with exactly the people on the team.</p>
<p>Why does only one set of letters count? Linux checks the owner first, then the group, then everyone else, and stops at the first that fits. This keeps the rule simple and fast, and it lets an owner lock themselves out by accident, as you saw.</p>
<p>Why did you need to log in again after joining the scribes? A shell gets its groups when it starts. On a real machine, after someone adds you to a group, you log out and in again before <code>id</code> shows it.</p>`,
  field: [
    ['getent group scribes', 'the members of a group, from the system\'s user database'],
    ['ls -ld DIR', 'the owner, group and mode of a directory itself'],
    ['newgrp GROUP', 'start a new shell with a group you were just added to'],
  ],
  spells: [
    { name: 'id', summary: 'Print a user and their groups.', examples: [['id', 'you'], ['id mira', 'another user']] },
    { name: 'groups', summary: 'Print only the group names of a user.', examples: [['groups', 'your groups'], ['groups oren', 'oren\'s groups']] },
    { name: 'ls -l', summary: 'Long listing: the owner and the group of each file.', examples: [['ls -l /srv/guild', 'owner first, then group']] },
    { name: 'chmod u+r', summary: 'Add read to the owner letters.', examples: [['chmod u+r ~/guild/notice.txt', 'read for you, the owner']] },
  ],
};
