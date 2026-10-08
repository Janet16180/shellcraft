/**
 * Chapter 20, Background Tasks: job control. A long command with & runs in
 * the background, jobs lists it, Ctrl+Z pauses the foreground command, bg
 * lets it go on in the background, fg brings a job to the front, Ctrl+C
 * interrupts it, kill %N ends a job by its number, and bash reports a job
 * that ends by itself as Done. sleep stands in for long work. The boss: the
 * smith's orders, with two tasks of random length; one is cancelled.
 */
import { put, remove, cd, dir, file, endJobs } from '../../backend/spec.js';
import { pick } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const SIGN = `THE WORKSHOP
Some work takes a long time: the bellows must blow, the steel must cool.
A smith does not stand and wait. Start the long work in the background,
and keep using your terminal.
(sleep N waits N seconds: here it stands in for long work.)
`;

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;
const jobsBefore = ctx => ctx.before.jobs ?? [];
const startedInBackground = (ctx, name) => ctx.ran(name, record => record.background === true);
const jobSpec = arg => /^%/.test(arg);
// The job a spec names among the jobs there were before the line: %N, %+ %% (current), %- (previous), %?text, %text.
function jobOfSpec(jobs, spec) {
  const word = spec.slice(1);
  if (/^\d+$/.test(word)) return Number(word);
  const pickBy = pred => jobs.find(pred)?.id ?? null;
  if (word === '' || word === '+' || word === '%') return pickBy(j => j.mark === '+');
  if (word === '-') return pickBy(j => j.mark === '-');
  if (word.startsWith('?')) return pickBy(j => j.cmd.includes(word.slice(1)));
  return pickBy(j => j.cmd.startsWith(word));
}
const killedJob = ctx => ctx.commands.filter(r => r.name === 'kill')
  .flatMap(r => r.args.filter(jobSpec).map(arg => jobOfSpec(jobsBefore(ctx), arg))).filter(id => id !== null);
const resumed = ctx => jobsBefore(ctx).some(was => was.state === 'stopped' && ctx.job(was.id)?.pid === was.pid && ctx.job(was.id).state === 'running');

const DURATIONS = [400, 500, 600, 700, 800, 900];

function workshop(user, extra = {}) {
  return dir({ 'sign.txt': file(SIGN, { owner: user }), ...extra }, { owner: user });
}

function setupBoss(random, { home, user }) {
  const first = pick(random, DURATIONS);
  const second = pick(random, DURATIONS.filter(d => d !== first));
  const cancelFirst = random() < 0.5;
  const [cancel, keep] = cancelFirst ? [first, second] : [second, first];
  const orders = `THE SMITH'S ORDERS
1. Start two tasks in the background, in this order: sleep ${first} &, then sleep ${second} &.
2. Bring sleep ${keep} to the front, and pause it with Ctrl+Z: it must wait for the steel.
3. The order for sleep ${cancel} was cancelled: end that job with kill and its job number.
`;
  return {
    patch: [endJobs(), remove(`${home}/workshop`), put(`${home}/workshop`, workshop(user, { 'orders.txt': file(orders, { owner: user }) })), cd(home)],
    secret: { cancel, keep, cancelJob: cancelFirst ? 1 : 2 },
  };
}

const jobOf = (jobs, seconds) => jobs.find(j => j.cmd === `sleep ${seconds}`) ?? null;

function bossDone(ctx, { cancel, keep }) {
  const was = jobOf(jobsBefore(ctx), cancel);
  return ctx.job(jobOf(ctx.jobs, keep)?.id)?.state === 'stopped'
    && was !== null && ctx.ended(was.id) && killedJob(ctx).includes(was.id);
}

function bossNear(ctx, secret) {
  const { cancel, keep } = secret;
  const kept = jobOf(ctx.jobs, keep);
  const wasKept = jobOf(jobsBefore(ctx), keep);
  const cancelled = jobOf(ctx.jobs, cancel);
  if (bossDone(ctx, secret)) return null;
  return firstNote([
    [() => wasKept !== null && kept === null, `That ended sleep ${keep}, but the orders cancel only sleep ${cancel}. Start sleep ${keep} & again.`],
    [() => kept === null, `Start the tasks of the orders first: sleep ${keep} & is not running.`],
    [() => kept.state === 'stopped' && cancelled === null, `sleep ${keep} waits, good. The orders go in order: pause first, then kill. Start sleep ${cancel} & again and end it with kill and its job number.`],
    [() => kept.state === 'stopped', `sleep ${keep} waits, good. Now end sleep ${cancel}: kill %${cancelled?.id}.`],
    [() => cancelled === null, `Bring sleep ${keep} to the front with fg %${kept?.id} and pause it with Ctrl+Z, then end sleep ${cancel} with kill.`],
    [() => true, `Bring sleep ${keep} to the front with fg %${kept?.id} and pause it with Ctrl+Z, then end sleep ${cancel} with kill.`],
  ]);
}

function solveBoss(obs) {
  const orders = nodeAt(obs.tree, `${obs.home}/workshop/orders.txt`).content;
  const [, first, second] = orders.match(/sleep (\d+) &, then sleep (\d+) &/);
  const keep = orders.match(/Bring sleep (\d+) to the front/)[1];
  const next = Math.max(0, ...(obs.jobs ?? []).map(j => j.id)) + 1;
  const idOf = seconds => (seconds === first ? next : next + 1);
  const cancel = keep === first ? second : first;
  return ['cat ~/workshop/orders.txt', `sleep ${first} &`, `sleep ${second} &`, `fg %${idOf(keep)}\u001a`, `kill %${idOf(cancel)}`];
}

export default {
  id: 'errands',
  act: 3,
  title: 'Background Tasks',
  setup: (_random, { home, user }) => [remove(`${home}/workshop`), put(`${home}/workshop`, workshop(user)), cd(home)],
  lesson: `<p>Some commands take a long time. While one runs in the <b>foreground</b>, the prompt is busy and you wait. Here <code>sleep 3000</code>, which waits 3000 seconds (almost an hour), stands in for long work.</p>
<ul>
<li>A <code>&amp;</code> at the end runs a command in the <b>background</b>: bash prints <code>[1] 2345</code>, the <b>job number</b> and the PID, and gives the prompt back at once.</li>
<li><code>jobs</code> lists your jobs: <code>Running</code> or <code>Stopped</code>. The <code>+</code> marks the current job, the one <code>fg</code> and <code>bg</code> use when you name none.</li>
<li><kbd>Ctrl</kbd>+<kbd>Z</kbd> pauses the foreground command: it becomes a stopped job. <code>bg</code> lets it go on in the background; <code>fg</code> brings a job back to the front (<code>fg %2</code> for job 2).</li>
<li><kbd>Ctrl</kbd>+<kbd>C</kbd> interrupts the foreground command: it ends.</li>
<li><code>kill %1</code> ends job 1. With <code>%</code>, the number is a job number; without it, <code>kill</code> takes a PID.</li>
</ul>
<p>When a background job ends by itself, bash tells you before the next prompt: <code>[1]+  Done   sleep 5</code>.</p>`,
  tasks: [
    {
      goal: 'Start a long task in the background (`sleep 3000 &`: the `&` gives you the prompt back)',
      tip: 'A `&` at the end of a line runs it in the background, and bash prints its job number and PID.',
      hints: [
        'Put `&` at the end of the command.',
        '`sleep 3000`, a space, then `&`.',
        'sleep 3000 &',
      ],
      done: ctx => startedInBackground(ctx, 'sleep'),
    },
    {
      goal: 'List your jobs (`jobs`)',
      tip: '`jobs` shows each job with its number, Running or Stopped, and the command.',
      hints: [
        'One word lists them.',
        'Type `jobs`.',
        'jobs',
      ],
      done: ctx => ctx.ran('jobs') && ctx.jobs.length > 0,
      near: ctx => (ctx.ran('jobs') && ctx.jobs.length === 0 ? 'You have no jobs right now. Start one first: sleep 3000 &.' : null),
    },
    {
      goal: 'Run `sleep 2000` in the foreground, then pause it with Ctrl+Z',
      tip: 'Ctrl+Z pauses the command in front: it becomes a stopped job, and you get the prompt back.',
      hints: [
        'This time, no `&`: the prompt waits. Then press the keys.',
        'Type `sleep 2000`, press Enter, then hold Ctrl and press Z.',
        'sleep 2000',
      ],
      done: ctx => ctx.pressed('TSTP'),
      near: ctx => (ctx.pressed('INT') ? 'Ctrl+C ended it. Ctrl+Z pauses it instead: run sleep 2000 again.' : null),
    },
    {
      goal: 'Let the stopped job go on, in the background (`bg`)',
      tip: '`bg` sends the current stopped job to the background, where it runs on.',
      hints: [
        '`jobs` shows a Stopped job. One word resumes it behind the prompt.',
        'Type `bg`.',
        'bg',
      ],
      done: ctx => ctx.ran('bg') && resumed(ctx),
      near: ctx => (ctx.tried('bg') && !resumed(ctx) ? 'There is no stopped job to resume. Pause one first: sleep 2000, then Ctrl+Z.' : null),
    },
    {
      goal: 'Bring a job to the front (`fg`), then interrupt it with Ctrl+C',
      tip: '`fg` puts a job in front again, where Ctrl+C reaches it.',
      hints: [
        '`fg` brings the current job back; the prompt waits again.',
        'Type `fg`, press Enter, then Ctrl+C.',
        'fg',
      ],
      done: ctx => ctx.tried('fg', record => record.signal === 'INT'),
      near: ctx => firstNote([
        [() => ctx.tried('fg', record => record.signal === 'TSTP'), 'Ctrl+Z paused it again. Bring it back with fg, and press Ctrl+C to end it.'],
        [() => ctx.tried('fg', record => record.status !== 0), 'There is no job to bring back: your jobs ended. Start one (sleep 3000 &), then fg and Ctrl+C.'],
      ]),
    },
    {
      goal: 'End a background job by its job number (`kill %1`)',
      tip: 'With `%`, kill takes a job number from `jobs`; without it, a PID.',
      hints: [
        '`jobs` shows the numbers in square brackets.',
        '`kill`, then `%` and the job number.',
        'kill %1',
      ],
      done: ctx => killedJob(ctx).some(id => ctx.ended(id)),
      near: ctx => firstNote([
        [() => ctx.tried('kill') && jobsBefore(ctx).length === 0, 'You have no jobs left: they ended. Start one again (sleep 3000 &), then kill %1.'],
        [() => ctx.tried('kill', record => record.status !== 0 && record.args.some(jobSpec)), 'There is no job with that number: jobs shows the numbers.'],
        [() => ctx.tried('kill', record => record.args.some(arg => /^\d+$/.test(arg))), 'Without %, kill takes a PID. This task uses the job number, with %: kill %1.'],
      ]),
    },
    {
      goal: 'Start a short job (`sleep 5 &`), wait a few seconds, and press Enter to see bash report it Done',
      tip: 'Bash tells you about a background job that ended before it shows the next prompt.',
      hints: [
        'Start it with `&`, wait more than 5 seconds, then press Enter on an empty line.',
        '`sleep 5 &`, then wait and press Enter.',
        'sleep 5 &',
      ],
      done: ctx => !ctx.tried('kill') && !ctx.tried('fg') && jobsBefore(ctx).some(j => j.state === 'running' && ctx.ended(j.id)),
    },
  ],
  solve: [
    'sleep 3000 &',
    'jobs',
    'sleep 2000\u001a',
    'bg',
    'fg\u0003',
    'kill %1',
    'sleep 5 &',
    'sleep 6',
  ],
  boss: {
    title: 'The Smith\'s Orders',
    briefing: `<p>The smith left orders in <code>~/workshop/orders.txt</code>: two long tasks to start in the background, one to pause, and one that was cancelled. Follow them in order. <code>jobs</code> shows the job numbers you need.</p>`,
    setup: setupBoss,
    hints: [
      'Read the orders with `cat ~/workshop/orders.txt`, then start both tasks with `&`.',
      '`fg %N` brings job N to the front; then Ctrl+Z. Last, `kill %N` for the cancelled job (with no other jobs, the first task is job 1).',
      ({ cancelJob }) => `kill %${cancelJob}`,
    ],
    done: bossDone,
    near: bossNear,
    solve: solveBoss,
  },
  recap: [
    ['sleep 3000 &', 'run a command in the background'],
    ['jobs', 'list your jobs and their numbers'],
    ['bg', 'let a stopped job go on in the background'],
    ['fg %2', 'bring job 2 to the front'],
    ['kill %1', 'end job 1'],
  ],
  why: `<p>Why pause instead of end? Ctrl+Z keeps everything the program has done so far. You can check something at the prompt, then bring it back with <code>fg</code> as if nothing happened.</p>
<p>Why <code>%</code>? Job numbers are small and belong to your shell; PIDs belong to the whole machine. The <code>%</code> tells <code>kill</code> which kind of number you mean, so <code>kill 1</code> never means job 1.</p>`,
  field: [
    ['long_command > log.txt 2>&1 &', 'run in the background and keep its output in a file'],
    ['nohup long_command &', 'keep it running after you close the terminal'],
    ['wait', 'wait until every background job is done'],
    ['echo $!', 'the PID of the last background job'],
  ],
  spells: [
    { name: '&', summary: 'Run a command in the background.', examples: [['sleep 3000 &', 'prints [1] and the PID']] },
    { name: 'jobs', summary: 'List the jobs of this shell.', examples: [['jobs', 'Running or Stopped, with numbers']] },
    { name: 'fg / bg', summary: 'Bring a job to the front, or let it run behind.', examples: [['fg %2', 'job 2 to the front'], ['bg', 'the stopped job runs on']] },
    { name: 'kill %N', summary: 'End a job by its number.', examples: [['kill %1', 'end job 1']] },
  ],
};
