/**
 * Chapter 19, The Scribe's Memory: working faster in the shell. history and
 * its numbers, !N and !!, Ctrl+R to search, alias for a shortcut, export so
 * that programs you start see a variable, and ~/.bashrc with source to keep
 * both for every new shell. The boss: a request for a random shortcut and a
 * random exported variable, kept in ~/.bashrc and loaded now.
 */
import { put, remove, cd, dir, file } from '../../backend/spec.js';
import { restore } from '../world.js';
import { pick } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;
const bashrcOf = ctx => `${ctx.home}/.bashrc`;
const bashrc = ctx => ctx.node(bashrcOf(ctx))?.content ?? '';
const kept = ctx => bashrc(ctx).includes('export EDITOR=nano');
// source returns the status of the file's last line, so a failing line elsewhere still loads the rest.
const sourced = ctx => ['source', '.'].some(name => ctx.tried(name, record => ctx.hasPath(record, bashrcOf(ctx))));
// The keys as typed: !! and !N are gone from ctx.line, which holds the line after history expansion.
const typed = (ctx, pattern) => pattern.test((ctx.typed ?? ctx.line).trim());
const ranAny = ctx => ctx.commands.length > 0;
const childEcho = (ctx, text) => ctx.ran('bash', record => record.args[0] === '-c' && /\$\{?realm\b/.test(record.args[1] ?? '') && record.stdout === `${text}\n`);
// bash -c "echo $realm": your shell put the value in before the new bash started.
const doubleQuoted = ctx => ctx.ran('bash', record => record.args[0] === '-c' && /\bKernelia\b/.test(record.args[1] ?? '') && /\$\{?realm/.test(ctx.line));
const DOUBLE_NOTE = 'With double quotes, your shell replaced $realm before the new bash started, so that proves nothing. Use single quotes: bash -c \'echo $realm\'.';
const UP_LINE = /^alias up=(['"])cd \.\.\1$/m;
// The shortcut is loaded in this shell, and its line is kept in .bashrc for new shells.
const upLoaded = ctx => ctx.alias('up') === 'cd ..';
const REPLACED = 'Your .bashrc lost its first lines: > replaced the whole file. Press Restart chapter in the HUD to get it back, then add with >>.';

const PLACES = ['gate', 'tower', 'library', 'market', 'forest'];
const KEEPERS = ['mira', 'oren', 'tamsin'];

function setupBoss(random, { home, user }) {
  const place = pick(random, PLACES);
  const alias = `to${place}`;
  const keeper = pick(random, KEEPERS);
  const request = `A request from the scribes:
1. Make a shortcut ${alias} that runs: cd ~/${place}
2. Make the variable KEEPER, with the value ${keeper}, and export it, so programs you start see it.
Keep both in ~/.bashrc, so every new shell has them, and load them now.
`;
  return {
    patch: [
      ...restore('.bashrc', { home, user }),
      remove(`${home}/memory`),
      put(`${home}/memory`, dir({ 'request.txt': file(request, { owner: user }) }, { owner: user })),
      cd(home),
    ],
    secret: { alias, place, keeper },
  };
}

// Judged by the effect: the alias goes to the place, KEEPER is exported with the value, and both
// have a line in .bashrc, in whatever form the player wrote them.
const aliasGoes = (ctx, { alias, place }) => {
  const match = /^cd\s+(\S+)$/.exec((ctx.alias(alias) ?? '').trim());
  const target = match?.[1].replace(/^["']|["']$/g, '').replace(/^(~|\$HOME|\$\{HOME\})(?=\/|$)/, ctx.home).replace(/\/$/, '');
  return target === `${ctx.home}/${place}`;
};
const keeperSet = (ctx, { keeper }) => ctx.variable('KEEPER')?.value === keeper && ctx.variable('KEEPER').exported;
const bossFile = (ctx, { alias }) => kept(ctx) && new RegExp(`^\\s*alias ${alias}=`, 'm').test(bashrc(ctx)) && /\bKEEPER=/.test(bashrc(ctx)) && /\bexport\b.*\bKEEPER\b/.test(bashrc(ctx));
const bossDone = (ctx, secret) => bossFile(ctx, secret) && sourced(ctx) && aliasGoes(ctx, secret) && keeperSet(ctx, secret);

function bossNear(ctx, secret) {
  const wrote = ctx.commands.some(record => ctx.streams(record).out === bashrcOf(ctx)) || sourced(ctx);
  if (!wrote || bossDone(ctx, secret)) return null;
  return firstNote([
    [() => !kept(ctx), REPLACED],
    [() => !new RegExp(`^\\s*alias ${secret.alias}=`, 'm').test(bashrc(ctx)), `~/.bashrc has no line alias ${secret.alias}='cd ~/${secret.place}' yet. Add it with echo "..." >> ~/.bashrc.`],
    [() => !/\bKEEPER=/.test(bashrc(ctx)) || !/\bexport\b.*\bKEEPER\b/.test(bashrc(ctx)), `~/.bashrc has no line export KEEPER=${secret.keeper} yet. Add it with >> too.`],
    [() => !sourced(ctx), 'Both lines are in ~/.bashrc. Load them into this shell now: source ~/.bashrc.'],
    [() => !aliasGoes(ctx, secret), `After source, ${secret.alias} does not run cd ~/${secret.place}. Read the line back with tail ~/.bashrc.`],
    [() => !keeperSet(ctx, secret), `After source, KEEPER is not exported with the value ${secret.keeper}. Read the line back with tail ~/.bashrc.`],
  ]);
}

function solveBoss(obs) {
  const request = nodeAt(obs.tree, `${obs.home}/memory/request.txt`).content;
  const [, alias, place] = request.match(/shortcut (\w+) that runs: cd ~\/(\w+)/);
  const keeper = request.match(/the value (\w+)/)[1];
  return [
    'cat ~/memory/request.txt',
    `echo "alias ${alias}='cd ~/${place}'" >> ~/.bashrc`,
    `echo "export KEEPER=${keeper}" >> ~/.bashrc`,
    'source ~/.bashrc',
  ];
}

export default {
  id: 'memory',
  act: 3,
  title: 'The Scribe\'s Memory',
  setup: (_random, player) => [...restore('.bashrc', player), remove(`${player.home}/memory`), cd(player.home)],
  lesson: `<p>The shell remembers what you type. These keys and commands save you typing:</p>
<ul>
<li><kbd>↑</kbd> and <kbd>↓</kbd> walk through the lines you typed before.</li>
<li><code>history</code> lists them, each with a number. <code>!</code> and a number runs that line again, like <code>!2</code>; <code>!!</code> runs the last line again. Bash prints the line before it runs it.</li>
<li><kbd>Ctrl</kbd>+<kbd>R</kbd> searches backwards: type part of a line and it shows the newest match. <kbd>Ctrl</kbd>+<kbd>R</kbd> again finds an older one, <kbd>Enter</kbd> runs it, and <kbd>Ctrl</kbd>+<kbd>G</kbd> gives up. Try it once now.</li>
<li><kbd>Ctrl</kbd>+<kbd>A</kbd> and <kbd>Ctrl</kbd>+<kbd>E</kbd> jump to the start and the end of the line; <kbd>Ctrl</kbd>+<kbd>L</kbd> clears the screen.</li>
</ul>
<p><code>alias NAME='COMMAND'</code> makes a shortcut: after <code>alias up='cd ..'</code>, typing <code>up</code> runs <code>cd ..</code>. The quotes keep the command in one piece. A new alias works from the next line on.</p>
<p>A variable you make with <code>realm=Kernelia</code> lives only in this shell. Programs you start, like a new <code>bash</code>, do not see it. <code>export realm</code> hands it down to every program you start from now on.</p>
<p>Aliases and variables are gone when the shell ends. Every new bash first reads <code>~/.bashrc</code>, so lines you add there come back each time. <code>source ~/.bashrc</code> reads it into the shell you have now.</p>`,
  tasks: [
    {
      goal: 'List the lines you typed so far, with their numbers (`history`)',
      tip: '`history` prints every line you typed, oldest first, each with a number.',
      hints: [
        'One word lists them.',
        'Type `history`.',
        'history',
      ],
      done: ctx => ctx.ran('history'),
    },
    {
      goal: 'Run an earlier line again by its number (`!` and the number, like `!2`)',
      tip: '`!N` runs line number N of the history again, and bash prints the line first.',
      hints: [
        'Look at the numbers `history` printed.',
        '`!`, then the number, with no space.',
        '!1',
      ],
      done: ctx => typed(ctx, /^!\d+$/) && ranAny(ctx),
      near: ctx => (typed(ctx, /^!\d+$/) && !ranAny(ctx) ? 'There is no line with that number. history shows the numbers you may use.' : null),
    },
    {
      goal: 'Run the last line again (`!!`)',
      tip: '`!!` is the line you typed last.',
      hints: [
        'Two exclamation marks.',
        'Type `!!` and press Enter.',
        '!!',
      ],
      done: ctx => typed(ctx, /^!!$/) && ranAny(ctx),
    },
    {
      goal: 'Make a shortcut `up` that runs `cd ..` (`alias up=\'cd ..\'`), then use it',
      tip: 'An alias works from the next line on: make it, then type its name.',
      hints: [
        'Two lines: first the alias, then the shortcut.',
        'After `alias up=\'cd ..\'`, type `up`.',
        'alias up=\'cd ..\'',
      ],
      done: ctx => typed(ctx, /^up$/) && ctx.ran('cd', record => record.args.length === 1 && record.args[0] === '..'),
      near: ctx => firstNote([
        [() => ctx.tried('alias', record => record.status !== 0 || record.args.includes('..')), 'Put the command in quotes, so it stays one piece: alias up=\'cd ..\'.'],
        [() => ctx.ran('alias', record => record.args.some(arg => arg.startsWith('up='))), 'The shortcut is ready. Now type up.'],
      ]),
    },
    {
      goal: 'Make a variable `realm=Kernelia`, then see that a new shell cannot see it (`bash -c \'echo $realm\'`)',
      tip: '`bash -c` starts a new shell that runs one command, and a plain variable is not handed to it.',
      hints: [
        'Two lines: make the variable, then ask a new bash to print it.',
        'First `realm=Kernelia`, then `bash -c` with `\'echo $realm\'` in single quotes.',
        'realm=Kernelia; bash -c \'echo $realm\'',
      ],
      done: ctx => childEcho(ctx, '') && ctx.variable('realm')?.value === 'Kernelia' && !ctx.variable('realm').exported,
      // realm = Kernelia runs a command named realm.
      near: ctx => (/^realm\s+=|^realm=\s/.test(ctx.line.trim()) ? 'No spaces around =: realm=Kernelia.' : null) ?? (doubleQuoted(ctx) ? DOUBLE_NOTE : null) ?? firstNote([
        [() => childEcho(ctx, 'Kernelia'), 'realm is exported already, from an earlier try. Run unset realm, then make it again with realm=Kernelia.'],
        [() => childEcho(ctx, '') && ctx.variable('realm') === null, 'There is no realm variable yet, so this shows nothing. First realm=Kernelia, then ask the new shell.'],
      ]),
    },
    {
      goal: 'Hand `realm` down to new programs (`export realm`), then ask a new shell again',
      tip: '`export` hands a variable to every program you start from now on.',
      hints: [
        'Export it, then run the same `bash -c` line.',
        '`export realm`, then `bash -c \'echo $realm\'`.',
        'export realm && bash -c \'echo $realm\'',
      ],
      done: ctx => childEcho(ctx, 'Kernelia'),
      near: ctx => (doubleQuoted(ctx) ? DOUBLE_NOTE : null) ?? (childEcho(ctx, '') ? 'The new shell still sees nothing. Run export realm first (and realm=Kernelia, if it is gone).' : null),
    },
    {
      goal: 'Keep `up` for every new shell: add the line `alias up=\'cd ..\'` to the end of `~/.bashrc`, then load it now (`source ~/.bashrc`)',
      tip: 'Every new bash reads `~/.bashrc`; `>>` adds a line to its end, and `source` reads it now.',
      hints: [
        'Use `echo` with the whole alias line in double quotes, and `>>`, never `>`.',
        `\`echo "alias up='cd ..'" >> ~/.bashrc\`, then \`source ~/.bashrc\`.`,
        'echo "alias up=\'cd ..\'" >> ~/.bashrc && source ~/.bashrc',
      ],
      done: ctx => kept(ctx) && /^alias up=/m.test(bashrc(ctx)) && upLoaded(ctx) && sourced(ctx),
      near: ctx => {
        const wrote = ctx.commands.some(record => ctx.streams(record).out === bashrcOf(ctx)) || sourced(ctx) || UP_LINE.test(bashrc(ctx));
        return !wrote ? null : firstNote([
          [() => !kept(ctx), REPLACED],
          [() => !UP_LINE.test(bashrc(ctx)), 'The line alias up=\'cd ..\' is not in ~/.bashrc yet: echo "alias up=\'cd ..\'" >> ~/.bashrc.'],
          [() => !sourced(ctx), 'The line is saved. Load it into this shell now: source ~/.bashrc.'],
        ]);
      },
    },
  ],
  solve: [
    'history',
    '!1',
    '!!',
    'alias up=\'cd ..\'',
    'cd forest',
    'up',
    'realm=Kernelia',
    'bash -c \'echo $realm\'',
    'export realm',
    'bash -c \'echo $realm\'',
    'echo "alias up=\'cd ..\'" >> ~/.bashrc',
    'source ~/.bashrc',
  ],
  boss: {
    title: 'The Scribes\' Request',
    briefing: `<p>The scribes left a request in <code>~/memory/request.txt</code>. It asks for a shortcut that goes to one place, and for an exported variable <code>KEEPER</code> with a name in it. Keep both in <code>~/.bashrc</code>, so every new shell has them, and load them into this shell.</p>`,
    setup: setupBoss,
    hints: [
      'Read the request with `cat ~/memory/request.txt`. You need two new lines at the end of `~/.bashrc`.',
      'One line `alias NAME=\'cd ~/PLACE\'`, one line `export KEEPER=VALUE`, each added with `echo "..." >> ~/.bashrc`; then `source ~/.bashrc`.',
      ({ alias, place }) => `echo "alias ${alias}='cd ~/${place}'" >> ~/.bashrc`,
    ],
    done: bossDone,
    near: bossNear,
    solve: solveBoss,
  },
  recap: [
    ['history', 'every line you typed, with numbers'],
    ['!!', 'run the last line again'],
    ['alias up=\'cd ..\'', 'a shortcut, from the next line on'],
    ['export realm', 'hand a variable down to programs you start'],
    ['bash -c \'echo $realm\'', 'ask a new shell what it sees'],
    ['source ~/.bashrc', 'read ~/.bashrc into this shell now'],
  ],
  why: `<p>Why does a new shell not see a plain variable? Each program gets a copy of the <b>environment</b> from the program that started it, and only exported variables are in it. That keeps a shell's own helper variables from leaking into every program.</p>
<p>Why <code>~/.bashrc</code>? A shell forgets everything when it ends. Bash reads <code>~/.bashrc</code> each time a new terminal opens, so it is the place for what you want every time. A mistake in it shows in every new terminal, so add lines with <code>&gt;&gt;</code> and read the file back.</p>`,
  field: [
    ['history | grep ssh', 'find old lines by a word'],
    ['unalias up', 'remove a shortcut'],
    ['env', 'every exported variable'],
    ['unset realm', 'remove a variable'],
    ['nano ~/.bashrc', 'edit .bashrc in a text editor (Ctrl+O saves, Ctrl+X quits)'],
  ],
  spells: [
    { name: 'history', summary: 'List the lines you typed.', examples: [['history', 'with numbers'], ['!!', 'run the last line again']] },
    { name: 'alias', summary: 'Make a shortcut for a command.', examples: [['alias up=\'cd ..\'', 'type up for cd ..'], ['alias', 'list the shortcuts']] },
    { name: 'export', summary: 'Hand a variable down to programs you start.', examples: [['export realm', 'new programs see realm']] },
    { name: 'source', summary: 'Run a file\'s lines in this shell.', examples: [['source ~/.bashrc', 'load .bashrc now']] },
  ],
};
