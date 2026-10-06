/**
 * An in-memory backend implementing the port (src/backend/port.js) for engine
 * and UI tests. It understands a handful of commands, split on ';' and spaces
 * (no quotes, pipes or redirections): cd, pwd, whoami, echo, ls, cat, touch,
 * mkdir, rm, kill. Like the simulator it guards `rm -r` of home or of any
 * directory holding it, and `kill -9` of the player's shell, reporting them in
 * `blocked`. A guard refusal only becomes a guardian effect; hearts come from
 * src/game/dangers.js.
 *
 * `loads` and `lines` record what the game asked for, for assertions.
 */
import { dir, file } from '../../src/backend/spec.js';
import { nodeAt, isInside } from '../../src/backend/tree.js';
import { resolvePath } from '../../src/game/checks.js';

const SHELL_PID = 733;

const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';
const baseName = path => path.slice(path.lastIndexOf('/') + 1);

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

  const apply = {
    put: op => put(op.path, op.node),
    remove: op => { delete get(parentOf(op.path))?.children?.[baseName(op.path)]; },
    proc: op => {
      world.procs = world.procs.filter(p => p.key !== op.proc.key);
      world.procs.push({ pid: world.nextPid++, ppid: 1, tty: '?', stat: 'S', cpu: 0, mem: 0, ...op.proc });
    },
    stop: op => { world.procs = world.procs.filter(p => p.key !== op.key); },
    cd: op => { world.cwd = op.path; },
  };

  const commands = makeCommands({ world, user, home, abs, get, put });
  const backend = {
    loads: [],
    lines: [],
    async load(patch) {
      backend.loads.push(patch);
      for (const op of patch) apply[op.op](op);
    },
    async run(line) {
      backend.lines.push(line);
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
    },
    async observe() {
      return structuredClone({ user, groups: [user], host, home, cwd: world.cwd, tree: world.tree, procs: world.procs });
    },
    async complete(line) {
      return { line, candidates: [] };
    },
  };
  return backend;
}

const ok = (stdout = '') => ({ status: 0, stdout, output: stdout ? [{ stream: 'out', text: stdout }] : [] });
const fail = (text, status = 1) => ({ status, stdout: '', output: [{ stream: 'err', text: `${text}\n` }] });
const notFound = name => () => fail(`${name}: command not found`, 127);
const options = args => args.filter(a => a.startsWith('-')).join('');
const operands = args => args.filter(a => !a.startsWith('-'));

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
    kill: (args, result) => {
      const pid = Number(operands(args)[0]);
      const shellKill = pid === SHELL_PID && options(args) === '-9';
      if (shellKill) result.blocked.push('The Guardian revived your shell.');
      else world.procs = world.procs.filter(p => p.pid !== pid);
      return ok();
    },
  };
}
