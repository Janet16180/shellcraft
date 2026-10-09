/**
 * An in-memory backend implementing the port (src/backend/port.js) for engine
 * and UI tests. It understands a handful of commands, split on ';' and spaces
 * (no quotes, pipes or redirections): cd, pwd, whoami, echo, ls, cat, touch,
 * mkdir, rm, kill, pkill, killall. Like the simulator it guards `rm -r` of home
 * or of any directory holding it, and any signal that ends or stops the
 * player's shell, reporting them in `blocked`. A guard refusal only becomes a guardian effect; hearts come from
 * src/game/dangers.js.
 *
 * `sudo LINE` asks for hidden input like the port allows; answer() with the
 * password `dragon` then runs LINE, anything else (or null, Ctrl+C) fails.
 * `sleep N; REST` runs for N seconds: poll() ends the sleep and runs REST,
 * signal('INT') ends the line with ^C, signal('TSTP') stops the sleep and runs REST.
 *
 * `loads` and `lines` record what the game asked for, for assertions.
 */
import { dir, file } from '../../src/backend/spec.js';
import { nodeAt, isInside, parentOf, baseName } from '../../src/backend/tree.js';
import { requestedSignal, endsInteractiveShell } from '../../src/backend/signals.js';
import { resolvePath } from '../../src/game/checks.js';
import { processName } from '../../src/game/dangers.js';

const SHELL_PID = 733;


/**
 * Create a fake backend.
 *
 * @param {{user?: string, host?: string, home?: string}} [identity] Who the player is.
 * @returns {object} A Backend plus `loads` (patches applied) and `lines` (lines run).
 */
export function createFakeBackend({ user = 'hero', host = 'kernelia', home = '/home/hero' } = {}) {
  const shell = { pid: SHELL_PID, ppid: 1, user, tty: 'pts/0', stat: 'Ss', cpu: 0, mem: 0.1, cmd: '-bash', key: 'shell' };
  const world = {
    tree: dir({ home: dir({ [user]: dir({}, { owner: user }) }) }),
    cwd: home,
    procs: [shell],
    nextPid: 1000,
  };
  const abs = path => resolvePath(path, world.cwd, home);
  const get = path => nodeAt(world.tree, path);

  function put(path, node) {
    const parent = get(parentOf(path));
    if (parent?.type !== 'dir') throw new Error(`put ${path}: no parent directory`);
    parent.children[baseName(path)] = structuredClone(node);
  }

  const apply = patchOps(world, { put, get });

  const commands = makeCommands({ world, user, home, abs, get, put });
  const prompt = `[sudo] password for ${user}: `;
  let pending = null;
  const sleeping = { now: null };
  const backend = {
    loads: [],
    lines: [],
    poll: async () => endSleep(backend, sleeping, null),
    signal: async name => endSleep(backend, sleeping, name),
    async answer(text) {
      if (pending === null) throw new Error('no line is waiting for input');
      const line = pending;
      pending = null;
      return answerSudo(backend, { line, text, prompt, cwd: world.cwd });
    },
    async load(patch) {
      pending = null;
      sleeping.now = null;
      backend.loads.push(patch);
      for (const op of patch) apply[op.op](op);
    },
    async run(line) {
      if (pending !== null || sleeping.now !== null) throw new Error('a line is waiting for input or running');
      backend.lines.push(line);
      if (/^sleep \d+/.test(line)) return startSleep(sleeping, line, world.cwd);
      if (line.startsWith('sudo ')) {
        pending = line.slice('sudo '.length);
        return { output: [], status: 0, commands: [], blocked: [], input: { prompt, hidden: true } };
      }
      return runWords(line, world, commands);
    },
    async observe() {
      return structuredClone({ user, groups: [user], host, home, cwd: world.cwd, tree: world.tree, procs: world.procs, jobs: [], aliases: {}, vars: {} });
    },
    async complete(line) {
      return { line, candidates: [] };
    },
  };
  return backend;
}

function runWords(line, world, commands) {
  const result = { output: [], status: 0, commands: [], blocked: [] };
  for (const words of line.split(';').map(part => part.trim().split(/\s+/).filter(Boolean)).filter(w => w.length > 0)) {
    const [name, ...args] = words;
    const cwd = world.cwd;
    const out = (Object.hasOwn(commands, name) ? commands[name] : notFound(name))(args, result);
    result.output.push(...out.output);
    result.status = out.status;
    result.commands.push({ name, args, cwd, status: out.status, stdout: out.stdout, pipeline: result.commands.length, stage: 0, stages: 1, redirects: [] });
  }
  return result;
}

function patchOps(world, { put, get }) {
  return {
    put: op => put(op.path, op.node),
    remove: op => { delete get(parentOf(op.path))?.children?.[baseName(op.path)]; },
    proc: op => {
      world.procs = world.procs.filter(p => p.key !== op.proc.key);
      world.procs.push({ pid: world.nextPid++, ppid: 1, tty: '?', stat: 'S', cpu: 0, mem: 0, ...op.proc });
    },
    stop: op => { world.procs = world.procs.filter(p => p.key !== op.key); },
    cd: op => { world.cwd = op.path; },
    endJobs: () => {},
  };
}

function startSleep(sleeping, line, cwd) {
  const [, seconds, rest] = /^sleep (\d+)\s*(?:;(.*))?$/.exec(line);
  sleeping.now = { seconds: Number(seconds), rest: rest ?? '', cwd };
  return { output: [], status: 0, commands: [], blocked: [], running: { seconds: Number(seconds) } };
}

async function endSleep(backend, sleeping, key) {
  if (sleeping.now === null) throw new Error('no command is running in the foreground');
  const { seconds, rest, cwd } = sleeping.now;
  sleeping.now = null;
  const status = { INT: 130, TSTP: 148 }[key] ?? 0;
  const sleep = { name: 'sleep', args: [String(seconds)], cwd, status, stdout: '', pipeline: 0, stage: 0, stages: 1, redirects: [] };
  if (key) sleep.signal = key;
  const echoed = { INT: [{ stream: 'out', text: '^C\n' }], TSTP: [{ stream: 'out', text: '^Z\n' }, { stream: 'err', text: `[1]+  Stopped                 sleep ${seconds}\n` }] }[key] ?? [];
  const after = key === 'INT' || !rest.trim() ? { output: [], status, commands: [] } : await backend.run(rest);
  return { output: [...echoed, ...after.output], status: after.status, commands: [sleep, ...after.commands], blocked: [] };
}

async function answerSudo(backend, { line, text, prompt, cwd }) {
  const sudo = { name: 'sudo', args: line.split(/\s+/), cwd, status: 1, stdout: '', pipeline: 0, stage: 0, stages: 1, redirects: [] };
  const asked = { stream: 'out', text: `${prompt}\n` };
  if (text !== 'dragon') return { output: [asked, { stream: 'err', text: 'sudo: a password is required\n' }], status: 1, commands: [sudo], blocked: [] };
  const r = await backend.run(line);
  return { ...r, output: [asked, ...r.output], commands: [{ ...sudo, status: r.status }, ...r.commands] };
}

const ok = (stdout = '') => ({ status: 0, stdout, output: stdout ? [{ stream: 'out', text: stdout }] : [] });
const fail = (text, status = 1) => ({ status, stdout: '', output: [{ stream: 'err', text: `${text}\n` }] });
const notFound = name => () => fail(`${name}: command not found`, 127);
const options = args => args.filter(a => a.startsWith('-')).join('');
const operands = args => args.filter(a => !a.startsWith('-'));

function signal(world, name) {
  return (args, result) => {
    const asked = requestedSignal(name, args);
    const sent = asked.status === 'send' && asked.signal !== 0;
    // Like the simulator: kill by PID, killall by exact name, pkill by a name containing the pattern.
    const matches = {
      kill: p => asked.operands.includes(String(p.pid)),
      killall: p => asked.operands.includes(processName(p.cmd)),
      pkill: p => asked.operands.some(pattern => processName(p.cmd).includes(pattern)),
    };
    const named = matches[name];
    const targets = sent ? world.procs.filter(named) : [];
    const shellHit = targets.some(p => p.key === 'shell') && endsInteractiveShell(asked.signal);
    if (shellHit) result.blocked.push('The Guardian kept your shell alive.');
    world.procs = world.procs.filter(p => p.key === 'shell' || !targets.includes(p));
    return asked.status === 'send' ? ok() : fail(`${name}: bad signal`);
  };
}

function makeCommands({ world, user, home, abs, get, put }) {
  const create = (path, node) => {
    if (!get(path)) put(path, node);
    return ok();
  };
  return {
    cd: ([target = home]) => {
      const path = abs(target);
      const found = get(path)?.type === 'dir';
      if (found) world.cwd = path;
      return found ? ok() : fail(`bash: cd: ${target}: No such file or directory`);
    },
    pwd: () => ok(`${world.cwd}\n`),
    whoami: () => ok(`${user}\n`),
    echo: args => ok(`${args.join(' ')}\n`),
    ls: args => {
      const path = abs(operands(args)[0] ?? '.');
      const node = get(path);
      const all = /[aA]/.test(options(args));
      const names = node?.type === 'dir' ? Object.keys(node.children).filter(n => all || !n.startsWith('.')).sort() : [];
      return node ? ok(names.map(n => `${n}\n`).join('')) : fail(`ls: cannot access '${path}': No such file or directory`, 2);
    },
    cat: args => {
      const node = get(abs(operands(args)[0] ?? ''));
      return node?.type === 'file' ? ok(node.content) : fail(`cat: ${args[0]}: No such file or directory`);
    },
    touch: args => create(abs(operands(args)[0]), file('', { owner: user })),
    mkdir: args => create(abs(operands(args)[0]), dir({}, { owner: user })),
    rm: (args, result) => {
      const path = abs(operands(args)[0] ?? '');
      const recursive = /[rR]/.test(options(args));
      const node = get(path);
      let out = ok();
      if (recursive && path !== '/' && isInside(home, path)) {
        result.blocked.push('The Guardian blocked rm -r on your home.');
        out = fail('rm: blocked by the Guardian');
      } else if (recursive && path === '/') out = fail("rm: it is dangerous to operate recursively on '/'");
      else if (!node) out = fail(`rm: cannot remove '${args.at(-1)}': No such file or directory`);
      else if (node.type === 'dir' && !recursive) out = fail(`rm: cannot remove '${args.at(-1)}': Is a directory`);
      else delete get(parentOf(path)).children[baseName(path)];
      return out;
    },
    kill: signal(world, 'kill'),
    pkill: signal(world, 'pkill'),
    killall: signal(world, 'killall'),
  };
}
