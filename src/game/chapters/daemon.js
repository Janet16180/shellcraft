/**
 * Chapter 13, The Shadow Daemon: processes and signals. ps, ps aux and its
 * %CPU column, pgrep, kill (TERM, a polite request), a process that ignores
 * it, kill -9, and why root's processes are out of reach. The boss room hides
 * the daemon among imps under an imp's name: only its %CPU gives it away.
 */
import { put, remove, proc, stop, cd, dir, file } from '../../backend/spec.js';
import { requestedSignal, parseSignal } from '../../backend/signals.js';
import { shuffle } from '../rng.js';

const NEST = `THE IMP DEN
Imps are small programs that run on their own.
Each one has a number, its PID.
Most are harmless. Some are greedy. One is not an imp at all.
`;

const IMP = 2412;
const GREEDY = 2420;
const STUBBORN = 2431;
const KILL = parseSignal('KILL');
const TERM = parseSignal('TERM');

const CHAPTER_KEYS = ['imp', 'greedy', 'stubborn'];
const DECOY_KEYS = ['imp-a', 'imp-b', 'imp-c'];
const BOSS_KEYS = ['daemon', ...DECOY_KEYS];
const IMP_NAMES = ['sleepy_imp', 'lazy_imp', 'tiny_imp', 'grumpy_imp', 'dusty_imp', 'quiet_imp'];
const DECOY_CPU = [0.3, 0.7, 1.2];
const DAEMON_CPU = 97.4;
const SIGNALLERS = new Set(['kill', 'pkill', 'killall']);

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;

// The PIDs a pkill or killall name matched, in the processes there were before the line.
function matched(ctx, record, names) {
  const fits = record.name === 'pkill' ? (cmd, name) => cmd.includes(name) : (cmd, name) => cmd === name;
  return ctx.before.procs.filter(p => names.some(name => fits(p.cmd, name))).map(p => String(p.pid));
}

// What a kill, pkill or killall line asked for: its signal number and the PIDs it reached, or null for other commands.
function sent(ctx, record) {
  if (!SIGNALLERS.has(record.name)) return null;
  const asked = requestedSignal(record.name, record.args);
  if (asked.status !== 'send') return null;
  return { signal: asked.signal, pids: record.name === 'kill' ? asked.operands : matched(ctx, record, asked.operands) };
}

const kills = (ctx, pid, pred = () => true) => ctx.commands.some(record => {
  const signal = sent(ctx, record);
  return signal !== null && signal.pids.includes(String(pid)) && pred(signal, record);
});
const alive = (ctx, key) => ctx.proc(key) !== null;
const wasAlive = (ctx, key) => ctx.before.procs.some(p => p.key === key);
const ended = (ctx, key) => wasAlive(ctx, key) && !alive(ctx, key);
// ps aux, and ps -aux, which ps also reads as aux.
const psAll = record => record.name === 'ps' && record.args.some(arg => /^-?[a-z]*a[a-z]*$/.test(arg) && /x/.test(arg));
const killedByName = ctx => ctx.tried('kill', record => record.status !== 0 && record.args.some(arg => /[a-z]/.test(arg) && !arg.startsWith('-')));

function denArea(user) {
  return dir({ 'nest.txt': file(NEST, { owner: user }) }, { owner: user });
}

const stopAll = () => [...CHAPTER_KEYS, ...BOSS_KEYS].map(stop);

function setupBoss(random, { home, user }) {
  const names = shuffle(random, IMP_NAMES).slice(0, 4);
  const pids = [];
  while (pids.length < 4) {
    const pid = 3000 + Math.floor(random() * 7000);
    if (!pids.includes(pid)) pids.push(pid);
  }
  const keys = shuffle(random, BOSS_KEYS);
  const cpu = shuffle(random, DECOY_CPU);
  const procs = keys.map((key, i) => (key === 'daemon'
    ? proc({ key, user, cmd: names[i], pid: pids[i], cpu: DAEMON_CPU, mem: 2.1, stat: 'R', ignores: ['TERM', 'INT', 'HUP'] })
    : proc({ key, user, cmd: names[i], pid: pids[i], cpu: cpu.pop() })));
  const daemon = keys.indexOf('daemon');
  return {
    patch: [...stopAll(), remove(`${home}/den`), put(`${home}/den`, denArea(user)), ...procs, cd(`${home}/den`)],
    secret: { pid: pids[daemon], name: names[daemon] },
  };
}

// The imps are harmless: the daemon must end, and they must still be running.
function bossDone(ctx) {
  return ended(ctx, 'daemon') && ctx.commands.some(record => SIGNALLERS.has(record.name)) && DECOY_KEYS.every(key => alive(ctx, key));
}

function bossNear(ctx, { pid }) {
  return bossDone(ctx) ? null : firstNote([
    [() => ended(ctx, 'daemon'), 'The daemon is gone, but so are harmless imps. End only the one using almost all of the CPU: press Restart chapter in the HUD and try again.'],
    [() => DECOY_KEYS.some(key => ended(ctx, key)), 'That was an ordinary imp: its %CPU was low. In ps aux, find the one using almost all of the CPU.'],
    [() => alive(ctx, 'daemon') && kills(ctx, pid, ({ signal }) => signal !== KILL), 'It ignored the polite signal and is still running. Send the one it cannot ignore: signal 9.'],
    [() => killedByName(ctx), 'kill needs the PID, the number in the second column of ps aux.'],
  ]);
}

function solveBoss(obs) {
  const greediest = obs.procs.filter(p => p.user === obs.user).reduce((top, p) => (p.cpu > top.cpu ? p : top));
  return ['ps aux', `kill ${greediest.pid}`, `kill -9 ${greediest.pid}`];
}

// The map shows every process as a creature: one that ignored a signal flashes, one that ended bursts.
function effects(ctx) {
  const keyed = ctx.before.procs.filter(p => p.key && p.key !== 'shell');
  return keyed.flatMap(p => {
    if (!alive(ctx, p.key)) return [{ kind: 'proc-killed', key: p.key }];
    return kills(ctx, p.pid, (_, record) => record.status === 0) ? [{ kind: 'proc-defied', key: p.key }] : [];
  });
}

export default {
  id: 'daemon',
  act: 2,
  title: 'The Shadow Daemon',
  setup: (_random, { home, user }) => [
    ...stopAll(),
    remove(`${home}/den`),
    put(`${home}/den`, denArea(user)),
    proc({ key: 'imp', user, cmd: 'imp', pid: IMP, cpu: 0.4 }),
    proc({ key: 'greedy', user, cmd: 'greedy_imp', pid: GREEDY, cpu: 88.6, stat: 'R' }),
    proc({ key: 'stubborn', user, cmd: 'stubborn_imp', pid: STUBBORN, cpu: 0.2, ignores: ['TERM'] }),
    cd(`${home}/den`),
  ],
  effects,
  lesson: `<p>A program that is running is a <b>process</b>. Every process has a number, its <b>PID</b> (process ID). You are in the imp den, <code>~/den</code>, and the imps around you are processes too.</p>
<ul>
<li><code>ps</code> lists the processes of this terminal: your shell, <code>bash</code>, and <code>ps</code> itself. Careful: that <code>bash</code> is your own shell, and <code>kill -9</code> on it would close your terminal.</li>
<li><code>ps aux</code> lists every process on the machine, from every user. Read these columns: <code>USER</code> who owns it, <code>PID</code> its number, <code>%CPU</code> how much of the processor it uses, and <code>COMMAND</code> what it runs.</li>
<li><code>pgrep imp</code> prints only the PIDs of the processes with <code>imp</code> in their name, so it finds <code>greedy_imp</code> too.</li>
</ul>
<p>To stop a process, you send it a <b>signal</b> with <code>kill</code> and its PID:</p>
<ul>
<li><code>kill 2420</code> sends signal 15, <code>TERM</code>: a polite request to stop. Most programs stop, but a program may ignore it.</li>
<li><code>kill -9 2420</code> sends signal 9, <code>KILL</code>, which no program can catch or ignore. Use it last: the program gets no chance to clean up.</li>
<li>You may only signal your own processes. The ones owned by <code>root</code> are out of your reach.</li>
</ul>
<p>Here the imps' PIDs stay the same each time, so you can follow along. On a real machine, PIDs change every time a program starts: always look them up first.</p>
<p>One more signal you already know: <b>Ctrl+C</b> asks the program running in your terminal to stop, with signal 2, <code>INT</code>.</p>`,
  tasks: [
    {
      goal: 'List the processes of your terminal (`ps`)',
      tip: 'Plain `ps` shows only your terminal: your shell and the `ps` you just ran.',
      hints: [
        'One short command, with nothing after it.',
        'The name means "process status".',
        'ps',
      ],
      done: ctx => ctx.ran('ps', record => record.args.length === 0),
    },
    {
      goal: 'List every process on the machine, from every user (`ps aux`)',
      tip: 'In `ps aux`, `a` means every user, `u` adds the owner and `%CPU` columns, and `x` adds processes with no terminal.',
      hints: [
        'The same command, with three letters after it.',
        '`ps` and then `aux`, with no dash.',
        'ps aux',
      ],
      done: ctx => ctx.ran('ps', psAll),
      near: ctx => (ctx.ran('ps', record => record.args.includes('-ef')) ? 'That lists everything too, but without the %CPU column. Use ps aux.' : null),
    },
    {
      goal: 'Print the PIDs of every process with `imp` in its name (`pgrep imp`)',
      tip: '`pgrep` matches part of the name, so `imp` also finds `greedy_imp` and `stubborn_imp`.',
      hints: [
        '`pgrep` takes a part of the name and prints PIDs.',
        '`pgrep`, then the word `imp`.',
        'pgrep imp',
      ],
      done: ctx => ctx.ran('pgrep', record => record.args.includes('imp')),
    },
    {
      goal: '`greedy_imp` is eating the CPU: see its `%CPU` in `ps aux`. End it with `kill` and its PID, `2420`',
      tip: '`kill PID` sends `TERM`, a polite request to stop, and prints nothing when it works.',
      hints: [
        'Its PID is in the second column of `ps aux`: 2420.',
        '`kill`, then the PID.',
        `kill ${GREEDY}`,
      ],
      done: ctx => ended(ctx, 'greedy') && kills(ctx, GREEDY),
      near: ctx => firstNote([
        [() => killedByName(ctx), `kill needs the PID, a number: kill ${GREEDY}.`],
        [() => ended(ctx, 'imp'), `That was the quiet imp. greedy_imp is PID ${GREEDY}.`],
      ]),
    },
    {
      goal: 'Ask `stubborn_imp` (PID 2431) to stop with a plain `kill`, and see that it ignores you',
      tip: 'A program may ignore `TERM`, so check with `ps aux` that a process has really gone.',
      hints: [
        'The same as for the greedy imp, with another PID.',
        '`kill` and `2431`, with no signal number.',
        `kill ${STUBBORN}`,
      ],
      done: ctx => alive(ctx, 'stubborn') && kills(ctx, STUBBORN, ({ signal }, record) => signal === TERM && record.status === 0),
      near: ctx => firstNote([
        [() => ended(ctx, 'stubborn'), 'kill -9 ended it before you saw it ignore a plain kill. Press Restart chapter in the HUD to bring it back.'],
        [() => killedByName(ctx), `kill needs the PID, a number: kill ${STUBBORN}.`],
      ]),
    },
    {
      goal: '`stubborn_imp` is still running (check with `ps aux`). End it with signal 9, which no program can ignore (`kill -9`)',
      tip: '`kill -9` cannot be ignored, but the program gets no chance to clean up, so try a plain `kill` first.',
      hints: [
        'Put the signal number, with a dash, between `kill` and the PID.',
        '`kill`, then `-9`, then `2431`.',
        `kill -9 ${STUBBORN}`,
      ],
      done: ctx => ended(ctx, 'stubborn') && kills(ctx, STUBBORN, ({ signal }) => signal === KILL),
      near: ctx => (alive(ctx, 'stubborn') && kills(ctx, STUBBORN, ({ signal }) => signal !== KILL) ? 'It ignored that one again. Add -9 before the PID.' : null),
    },
    {
      goal: 'Even signal 9 works only on your own processes: try `kill -9` on PID `1`, the first process, owned by `root`',
      tip: 'You may signal only your own processes, so a `kill` of root\'s processes fails with `Operation not permitted`.',
      hints: [
        'PID 1 starts first, when the machine boots.',
        'The same as before, with the PID `1`.',
        'kill -9 1',
      ],
      done: ctx => kills(ctx, 1, (_, record) => record.status !== 0),
    },
  ],
  solve: [
    'ps',
    'ps aux',
    'pgrep imp',
    `kill ${GREEDY}`,
    `kill ${STUBBORN}`,
    `kill -9 ${STUBBORN}`,
    'kill -9 1',
  ],
  boss: {
    title: 'The Shadow Daemon',
    briefing: `<p>One of the imps in the den is not an imp at all: the Shadow Daemon hides under an imp's name. A name can lie, but the work a process does cannot: the daemon uses almost all of the CPU. Find it in <code>ps aux</code> and end it. It ignores polite requests.</p>`,
    setup: setupBoss,
    hints: [
      'Every name looks like an imp. Look at the `%CPU` column of `ps aux` instead.',
      'Find the line with the very high `%CPU`, then `kill -9` its PID.',
      ({ pid }) => `kill -9 ${pid}`,
    ],
    done: bossDone,
    near: bossNear,
    solve: solveBoss,
  },
  recap: [
    ['ps', 'the processes of this terminal'],
    ['ps aux', 'every process, with its owner, PID and `%CPU`'],
    ['pgrep imp', 'the PIDs of processes with `imp` in their name'],
    [`kill ${GREEDY}`, 'ask a process to stop (signal 15, `TERM`)'],
    [`kill -9 ${STUBBORN}`, 'end it, no matter what (signal 9, `KILL`)'],
  ],
  why: `<p>Why ask politely first? A program that gets <code>TERM</code> can save its work, close its files and then stop. <code>KILL</code> stops it at once, in the middle of whatever it was doing, so a file it was writing may be left half done.</p>
<p>Why can't you end root's processes? The same reason you can't read <code>/root</code>: Linux checks who you are. Otherwise any user could stop the programs everybody needs.</p>
<p>Why is it called a <b>daemon</b>? On Unix, a daemon is a program that runs in the background with no terminal, like <code>cron</code> and <code>sshd</code> in <code>ps aux</code>. Most daemons are friendly helpers; this one is not.</p>`,
  field: [
    ['top', 'a live list of processes, the busiest on top; press q to quit'],
    ['pkill imp', 'send a signal to every process with `imp` in its name'],
    ['kill -l', 'list every signal by name and number'],
    ['ps -ef', 'another way to list every process, with the parent PID'],
    ['pgrep -l imp', 'PIDs together with names'],
  ],
  spells: [
    { name: 'ps', summary: 'List processes.', examples: [['ps', 'this terminal only'], ['ps aux', 'every process, with `%CPU`']] },
    { name: 'pgrep', summary: 'Print the PIDs of processes by name.', examples: [['pgrep imp', 'every PID with `imp` in its name']] },
    { name: 'kill', summary: 'Send a signal to a process by its PID.', examples: [[`kill ${GREEDY}`, 'a polite request to stop'], [`kill -9 ${STUBBORN}`, 'stop now; cannot be ignored']] },
  ],
};
