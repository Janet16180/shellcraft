/**
 * Chapter 18, The Crown: sudo, told honestly. sudo runs one command as root
 * when the system's policy allows you (here, the group sudo), after you type
 * your own password; it remembers it for a while, and sudo -k forgets it. The
 * redirection trap (your shell opens the file, not root) and its fix with
 * tee, and chown, which only root may use to give a file away. The boss: an
 * order to give one service's config to its keeper with the right mode,
 * changing nothing else.
 */
import { put, remove, cd, dir, file, password } from '../../backend/spec.js';
import { realm } from '../people.js';
import { pick } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const PASSWORD = 'dragon';
const SYSLOG = '/var/log/syslog';
const MOTD = '/etc/motd';
const STEWARD = 'The steward is hero.';
const READ_CMDS = ['cat', 'less', 'more', 'head', 'tail'];

const swordOf = ctx => `${ctx.home}/crown/sword.txt`;
const tilde = path => path.replace(/^\/home\/[^/]+/, '~');
const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;

const asRoot = (ctx, name, pred = () => true) => ctx.ran(name, record => record.user === 'root' && pred(record));
const asMe = (ctx, name, pred = () => true) => ctx.tried(name, record => record.user !== 'root' && pred(record));
// sudo itself failed: the password was wrong three times, or it was cancelled.
const sudoRefused = ctx => ctx.tried('sudo', record => record.status !== 0) && !ctx.commands.some(record => record.user === 'root');
const PASSWORD_NOTE = `Your password is ${PASSWORD}. Type it when sudo asks, and press Enter: nothing shows while you type.`;
const passwordFirst = (ctx, rules) => (sudoRefused(ctx) ? PASSWORD_NOTE : firstNote(rules));
const motdText = ctx => ctx.node(MOTD)?.content ?? '';
const motdBefore = ctx => nodeAt(ctx.before.tree, MOTD)?.content ?? '';

const SERVICES = ['mill', 'bakery', 'stables', 'lighthouse', 'granary'];
const KEEPERS = [['mira', 'smiths'], ['oren', 'smiths'], ['tamsin', 'scribes']];
const WRONG_MODES = [0o666, 0o644, 0o777, 0o600];

function setupBoss(random, { home, user }) {
  const service = pick(random, SERVICES);
  const [keeper, group] = pick(random, KEEPERS);
  const config = `/srv/${service}/config.txt`;
  const order = `BY ORDER OF THE GUILD
The keeper of /srv/${service} is ${keeper}, of the ${group}.
Give ${config} to the owner ${keeper} and the group ${group}.
Its mode must be: read and write for ${keeper}, read for the ${group}, nothing for everyone else.
Change nothing else.
`;
  return {
    patch: [
      remove(`/srv/${service}`),
      put(`/srv/${service}`, dir({ 'config.txt': file(`# settings of the ${service}\nopen_at=dawn\n`, { mode: pick(random, WRONG_MODES) }) })),
      put(`${home}/crown/order.txt`, file(order, { owner: user })),
      cd(home),
    ],
    secret: { config, keeper, group },
  };
}

const dirOf = path => path.slice(0, path.lastIndexOf('/'));
const dirUntouched = (ctx, config) => {
  const node = ctx.node(dirOf(config));
  return node?.owner === 'root' && node.group === 'root' && (node.mode & 0o777) === 0o755;
};

// What to undo on the service's directory: its owner and group, its mode, or both.
function dirNote(node, dir) {
  const fixes = [
    (node.owner !== 'root' || node.group !== 'root') && `sudo chown root:root ${dir}`,
    (node.mode & 0o777) !== 0o755 && `sudo chmod 755 ${dir}`,
  ].filter(Boolean);
  return `The order says to change nothing else, and the directory ${dir} changed. Put it back: ${fixes.join(', then ')}.`;
}

function bossDone(ctx, { config, keeper, group }) {
  const node = ctx.node(config);
  return node?.owner === keeper && node.group === group && (node.mode & 0o777) === 0o640 && dirUntouched(ctx, config);
}

function bossNear(ctx, secret) {
  const { config, keeper, group } = secret;
  const node = ctx.node(config);
  const mode = node ? node.mode & 0o777 : 0;
  const tried = ['chown', 'chgrp', 'chmod'].some(name => ctx.tried(name));
  if (!tried || bossDone(ctx, secret)) return passwordFirst(ctx, []);
  return passwordFirst(ctx, [
    [() => ['chown', 'chgrp', 'chmod'].some(name => asMe(ctx, name, r => r.status !== 0)), `config.txt is root's, so only root may change it: put sudo in front.`],
    [() => !dirUntouched(ctx, config), dirNote(ctx.node(dirOf(config)), dirOf(config))],
    [() => node.owner !== keeper, `Its owner is ${node.owner}, but the order names ${keeper}: sudo chown ${keeper}:${group} ${config}.`],
    [() => node.group !== group, `Its group is ${node.group}, but the order names the ${group}: sudo chown ${keeper}:${group} ${config}.`],
    [() => (mode & 0o007) !== 0, `Everyone else may still use it (mode ${mode.toString(8)}). Read and write for the owner, read for the group, nothing for everyone else is 640: sudo chmod 640 ${config}.`],
    [() => mode !== 0o640, `Its mode is ${mode.toString(8)}. The order asks for 640: read and write for ${keeper}, read for the ${group}.`],
  ]);
}

function solveBoss(obs) {
  const order = nodeAt(obs.tree, `${obs.home}/crown/order.txt`).content;
  const [, config, keeper, group] = order.match(/Give (\S+) to the owner (\w+) and the group (\w+)\./);
  return ['cat ~/crown/order.txt', `sudo chown ${keeper}:${group} ${config}`, `sudo chmod 640 ${config}`];
}

export default {
  id: 'crown',
  act: 3,
  title: 'The Crown',
  setup: (_random, player) => [
    ...realm(player, { factions: ['smiths', 'scribes'], sudo: true }),
    password(PASSWORD),
    put(`${player.home}/crown`, dir({ 'sword.txt': file('The steward\'s sword, for mira the smith to sharpen.\n', { owner: player.user }) }, { owner: player.user })),
    cd(player.home),
  ],
  lesson: `<p>The guild made you its steward: an <b>administrator</b>. On Ubuntu, administrators are the members of the <code>sudo</code> group, and the rules in <code>/etc/sudoers</code> let them run any command as <b>root</b>, who may read and change anything.</p>
<ul>
<li><code>sudo COMMAND</code> runs one command as root. Only that one command; the next line is you again.</li>
<li>It asks for <b>your own password</b>, not root's. Yours is <code>dragon</code>. Nothing shows while you type it, not even stars. Then press Enter.</li>
<li>sudo remembers the password for 15 minutes, so the next <code>sudo</code> does not ask. <code>sudo -k</code> makes it forget now.</li>
<li><code>sudo -l</code> lists what you are allowed to run as root.</li>
</ul>
<p>A trap: in <code>sudo echo hi &gt;&gt; /etc/motd</code>, only <code>echo</code> runs as root. The <code>&gt;&gt;</code> is done by <b>your</b> shell, before sudo starts, and you may not write <code>/etc/motd</code>. The fix is <code>tee</code>, which copies what it reads to the screen and into a file: <code>echo hi | sudo tee -a /etc/motd</code> runs <code>tee</code> as root, and <code>-a</code> adds to the end instead of replacing the file.</p>
<p><code>chown USER FILE</code> (change owner) gives a file to someone else, and only root may do that: <code>sudo chown mira FILE</code>. <code>chown mira:smiths FILE</code> sets the owner and the group at once.</p>
<p>Root can break anything, so use sudo only for the one command that needs it, and give the fewest permissions that work. <code>chmod 777</code> "fixes" a refusal by letting everyone do everything: never use it to make an error go away.</p>`,
  tasks: [
    {
      goal: 'See what you may run as root (`sudo -l`); when it asks, type your password `dragon`: nothing shows as you type',
      tip: 'sudo asks for your own password, shows nothing while you type it, and waits for Enter.',
      hints: [
        'Type the command, press Enter, then type the password and press Enter again.',
        '`sudo -l`, then the password `dragon`.',
        'sudo -l',
      ],
      done: ctx => ctx.ran('sudo', record => ctx.flag(record, 'l')),
      near: ctx => passwordFirst(ctx, []),
    },
    {
      goal: 'Read the system log `/var/log/syslog`, which refused you before, as root (`sudo` in front of the command)',
      tip: 'Put `sudo` in front of a command and that one command runs as root.',
      hints: [
        'In chapter 10, `cat /var/log/syslog` said Permission denied. Root may read it.',
        'The same `cat` line, with `sudo` in front.',
        'sudo cat /var/log/syslog',
      ],
      done: ctx => [...READ_CMDS, 'grep', 'wc'].some(name => asRoot(ctx, name, record => ctx.hasPath(record, SYSLOG))),
      near: ctx => passwordFirst(ctx, [
        [() => READ_CMDS.some(name => asMe(ctx, name, record => record.status !== 0 && ctx.hasPath(record, SYSLOG))), 'You may not read it, but root may: sudo cat /var/log/syslog.'],
      ]),
    },
    {
      goal: 'Find out who you are while a command runs through sudo (`sudo whoami`)',
      tip: 'Under `sudo`, the command runs as the user root.',
      hints: [
        '`whoami` prints the user running it.',
        'Put `sudo` in front of `whoami`.',
        'sudo whoami',
      ],
      done: ctx => asRoot(ctx, 'whoami') || asRoot(ctx, 'id'),
      near: ctx => passwordFirst(ctx, [[() => ctx.ran('whoami'), 'That is you. Put sudo in front to see who runs the command then.']]),
    },
    {
      goal: 'Try to add a line to `/etc/motd` with `sudo echo hi >> /etc/motd`, and read why it fails',
      tip: 'Your shell does the `>>` before sudo starts, and your shell may not write `/etc/motd`.',
      hints: [
        'Type the line exactly. It will fail, and that is the point.',
        'Look at the error: it comes from bash, not from sudo or echo.',
        'sudo echo hi >> /etc/motd',
      ],
      done: ctx => /\bsudo\b[^|]*>>?\s*\/etc\/motd/.test(ctx.line) && motdText(ctx) === motdBefore(ctx),
      near: ctx => (/>>?\s*\/etc\/motd/.test(ctx.line) && !/\bsudo\b/.test(ctx.line)
        ? 'That fails too, but this task is about sudo: put sudo in front of echo and see that it does not help.' : null),
    },
    {
      goal: 'Add the line `The steward is hero.` to the end of `/etc/motd` (`echo ... | sudo tee -a /etc/motd`)',
      tip: '`sudo tee -a FILE` runs `tee` as root, so root opens the file, and `-a` adds to its end.',
      hints: [
        '`echo` prints the line, and `|` hands it to `tee`, which runs as root.',
        '`echo The steward is hero.`, then `| sudo tee -a /etc/motd`.',
        `echo ${STEWARD} | sudo tee -a /etc/motd`,
      ],
      done: ctx => asRoot(ctx, 'tee', record => ctx.flag(record, 'a') && ctx.hasPath(record, MOTD)) && motdText(ctx).endsWith(`${STEWARD}\n`),
      near: ctx => passwordFirst(ctx, [
        [() => asMe(ctx, 'tee', record => ctx.hasPath(record, MOTD)), '/etc/motd is root\'s, so tee must run as root: | sudo tee -a /etc/motd.'],
        [() => asRoot(ctx, 'tee', record => !ctx.flag(record, 'a') && ctx.hasPath(record, MOTD)), 'Without -a, tee replaced the whole file with your line. Add -a to add to the end: run it again with sudo tee -a.'],
        [() => asRoot(ctx, 'tee', record => ctx.hasPath(record, MOTD)), `The line must be exactly ${STEWARD}`],
        [() => ctx.ran('sudo', record => ['sh', 'bash'].includes(record.args.find(a => !a.startsWith('-')))) && motdText(ctx) !== motdBefore(ctx), 'That works too: sudo sh -c runs the whole line, >> included, as root. This task practises tee: echo ... | sudo tee -a /etc/motd.'],
      ]),
    },
    {
      goal: 'Give `~/crown/sword.txt` to `mira` (`sudo chown mira`: only root may give a file away)',
      tip: '`chown USER FILE` makes USER the owner; only root may do it, so put `sudo` in front.',
      hints: [
        'The sword is yours. Its new owner should be `mira`.',
        '`sudo chown`, the name `mira`, then the path.',
        'sudo chown mira ~/crown/sword.txt',
      ],
      done: ctx => ctx.node(swordOf(ctx))?.owner === 'mira' && asRoot(ctx, 'chown', record => ctx.hasPath(record, swordOf(ctx))),
      near: ctx => passwordFirst(ctx, [
        [() => asMe(ctx, 'chown', record => record.status !== 0), 'Only root may give a file away, even your own: put sudo in front.'],
        [() => !['mira', 'hero'].includes(ctx.node(swordOf(ctx))?.owner), `The sword is for mira to sharpen: sudo chown mira ${tilde(swordOf(ctx))}.`],
      ]),
    },
    {
      goal: 'Make sudo forget your password now, so the next `sudo` asks again (`sudo -k`)',
      tip: 'On a shared machine, `sudo -k` before you walk away keeps others from using your sudo.',
      hints: [
        'One short sudo option does it, and it asks for no password.',
        '`sudo` with `-k`.',
        'sudo -k',
      ],
      done: ctx => ctx.ran('sudo', record => ctx.flag(record, 'k') || ctx.flag(record, 'K')),
    },
  ],
  solve: [
    'sudo -l',
    'sudo cat /var/log/syslog',
    'sudo whoami',
    'sudo echo hi >> /etc/motd',
    `echo ${STEWARD} | sudo tee -a /etc/motd`,
    'sudo chown mira ~/crown/sword.txt',
    'sudo -k',
  ],
  boss: {
    title: 'The Steward\'s Order',
    briefing: `<p>The guild sent you an order, <code>~/crown/order.txt</code>. It names a service in <code>/srv</code>, its keeper and the keeper's faction. Its file <code>config.txt</code> belongs to root, with the wrong mode. Give it to the keeper and the faction, and set the mode the order asks for. Change nothing else.</p>`,
    setup: setupBoss,
    hints: [
      'Read the order with `cat ~/crown/order.txt`, then look at the file with `ls -l`.',
      'Two commands as root: `sudo chown KEEPER:FACTION FILE`, then `sudo chmod` with three digits: 6 for the owner, 4 for the group, 0 for everyone else.',
      ({ keeper, group, config }) => `sudo chown ${keeper}:${group} ${config}`,
    ],
    done: bossDone,
    near: bossNear,
    solve: solveBoss,
  },
  recap: [
    ['sudo -l', 'what you may run as root'],
    ['sudo cat /var/log/syslog', 'run one command as root'],
    ['sudo whoami', 'under sudo, you are root'],
    ['echo hi | sudo tee -a /etc/motd', 'write a root file: tee runs as root, -a adds to the end'],
    ['sudo chown mira ~/crown/sword.txt', 'give a file to another user'],
    ['sudo -k', 'forget the password now'],
  ],
  why: `<p>Why your own password? sudo checks that the person at the keyboard is you, and the sudoers rules decide what you may do. Nobody has to know root's password, and the system log records who ran what with sudo.</p>
<p>Why not stay root? Root's mistakes are never refused. A typo like <code>rm -r / tmp</code>, with a space too many, would remove everything. Running as yourself and asking for root one command at a time keeps such mistakes small.</p>`,
  field: [
    ['sudo -i', 'open a shell as root (type exit to leave it); use with care'],
    ['sudo -u mira COMMAND', 'run a command as another user'],
    ['sudo apt install PACKAGE', 'install a program on Ubuntu'],
    ['sudo visudo', 'edit /etc/sudoers safely: it checks the file before saving'],
    ['passwd', 'change your own password'],
  ],
  spells: [
    { name: 'sudo', summary: 'Run one command as root, with your own password.', examples: [['sudo cat /var/log/syslog', 'read a root-only file'], ['sudo -l', 'what you may run'], ['sudo -k', 'forget the password']] },
    { name: 'tee', summary: 'Copy what it reads to the screen and into a file.', examples: [['echo hi | sudo tee -a /etc/motd', 'add a line to a root file']] },
    { name: 'chown', summary: 'Change the owner (and group) of a file; only root may.', examples: [['sudo chown mira ~/crown/sword.txt', 'give it to mira'], ['sudo chown mira:smiths FILE', 'owner and group at once']] },
  ],
};
