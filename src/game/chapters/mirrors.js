/**
 * Chapter 6, Hall of Mirrors: wildcard patterns (`*`, `?`, `[ ]`), quotes for
 * a name with a space, and previewing a pattern with ls before giving it to
 * rm. Bash expands the pattern before the command runs, so the checks see the
 * matching names, not the pattern. The boss room fills the hall with whole and
 * cracked mirrors under random names: the player removes every cracked one.
 */
import { put, remove, cd, dir, file } from '../../backend/spec.js';
import { token } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const WHOLE = 'whole_';
const CRACKED = 'cracked_';
const WHOLE_TEXT = 'A whole mirror. Your reflection looks back at you.\n';
const CRACKED_TEXT = 'A cracked mirror. Your reflection is in pieces.\n';
const MAGIC = 'magic mirror.txt';

const MIRRORS = {
  'mirror1.txt': 'A tall mirror in a silver frame.\n',
  'mirror2.txt': 'A round mirror, polished bright.\n',
  'mirror3.txt': 'A mirror with a crown carved on top.\n',
  'mirror4.txt': 'A dusty mirror. Someone wrote "hello" in the dust.\n',
  'mirror5.txt': 'A tiny hand mirror on a hook.\n',
  'mirror12.txt': 'A mirror that shows you twelve times over.\n',
  'mirror30.txt': 'An old mirror. Thirty years of faces have looked into it.\n',
};
const SHARDS = {
  'shard_a.shard': 'A sharp sliver of glass.\n',
  'shard_b.shard': 'A jagged piece of glass.\n',
  'shard_c.shard': 'A splinter of glass that glints.\n',
};
const OTHERS = {
  [MAGIC]: 'You found me, space and all. Quotes keep my name in one piece.\n',
  'portrait.txt': 'A portrait of a hero. It is not a mirror, but it looks a lot like you.\n',
};

const hallOf = ctx => `${ctx.home}/mirrors`;
const inHall = (ctx, names) => names.map(name => `${hallOf(ctx)}/${name}`);
const ALL_MIRRORS = Object.keys(MIRRORS);
const ONE_DIGIT = ['mirror1.txt', 'mirror2.txt', 'mirror3.txt', 'mirror4.txt', 'mirror5.txt'];
const ONE_TO_THREE = ['mirror1.txt', 'mirror2.txt', 'mirror3.txt'];
const SHARD_NAMES = Object.keys(SHARDS);
const KEEP = [...ALL_MIRRORS, MAGIC];

const sameSet = (a, b) => a.length === b.length && b.every(path => a.includes(path));
const listsExactly = (ctx, names) => ctx.ran('ls', record => sameSet(ctx.paths(record), inHall(ctx, names)));
const missing = (ctx, paths) => paths.filter(path => !ctx.node(path));
const RESTART = 'and rm has no undo. Restart the chapter to get them back.';

// An operand that still holds a pattern character and names no file: bash
// passed the pattern on because nothing matched, or because it was quoted.
const PATTERN_CHAR = /[*?[]/;
function unexpandedNote(ctx) {
  const record = ctx.commands.find(r => r.status !== 0 && ctx.paths(r).some(path => PATTERN_CHAR.test(path) && !ctx.node(path)));
  return record
    ? `${record.name} got the pattern itself, not names: either nothing matched, so bash left it as it was, or quotes stopped bash from expanding it.`
    : null;
}

// A ~ inside quotes stays a plain character, so the path starts with a literal ~.
const quotedTilde = (ctx, name) => ctx.tried(name, record => record.status !== 0 && record.args.some(arg => arg.startsWith('~')));
const TILDE_NOTE = 'Inside quotes, ~ is just a character. Keep it outside them: ~/mirrors/"magic mirror.txt".';

const countOf = n => `${n} ${n === 1 ? 'name' : 'names'}`;

function listNote(ctx, names, advice) {
  const expected = inHall(ctx, names);
  const inside = path => path.startsWith(`${hallOf(ctx)}/`);
  const listing = ctx.commands.find(r => r.name === 'ls' && r.status === 0 && ctx.paths(r).some(inside) && !sameSet(ctx.paths(r), expected));
  let note = null;
  if (missing(ctx, expected).length > 0) note = `Some of these files are gone, ${RESTART}`;
  else if (quotedTilde(ctx, 'ls')) note = 'Inside quotes, ~ is just a character, and quotes stop a pattern too. Leave both unquoted.';
  else if (unexpandedNote(ctx)) note = unexpandedNote(ctx);
  else if (ctx.ran('echo', record => sameSet(ctx.paths(record), expected))) note = 'echo showed exactly the right names. Now list them with ls.';
  else if (ctx.ran('ls', record => ctx.paths(record).includes(hallOf(ctx)))) note = `That lists the whole hall. Add a pattern to the path: ${advice}`;
  else if (listing) note = `That listed ${countOf(ctx.paths(listing).length)}, but the task wants ${names.length}. ${advice}`;
  return note;
}

function sweepDone(ctx) {
  const shards = inHall(ctx, SHARD_NAMES);
  return ctx.tried('rm', record => shards.every(path => ctx.hasPath(record, path)))
    && missing(ctx, shards).length === shards.length
    && missing(ctx, inHall(ctx, KEEP)).length === 0;
}

function sweepNear(ctx) {
  let note = null;
  if (missing(ctx, inHall(ctx, KEEP)).length > 0) note = `That removed mirror files too, ${RESTART}`;
  else if (unexpandedNote(ctx)) note = unexpandedNote(ctx);
  else if (missing(ctx, inHall(ctx, SHARD_NAMES)).length > 0) note = 'Remove all three .shard files with one rm and one pattern. Restart the chapter to bring back the .shard files already removed.';
  return note;
}

function readNear(ctx) {
  const magic = `${hallOf(ctx)}/${MAGIC}`;
  const split = ctx.commands.find(record => record.status !== 0 && ctx.paths(record).includes(`${hallOf(ctx)}/magic`));
  let note = null;
  if (!ctx.node(magic)) note = 'The magic mirror is gone, and rm has no undo. Restart the chapter to get it back.';
  else if (split) note = `Bash split the name at the space, so ${split.name} looked for two files: magic and mirror.txt. Put the name in quotes.`;
  else if (quotedTilde(ctx, 'cat')) note = TILDE_NOTE;
  return note;
}

function tokens(random, count) {
  const found = new Set();
  while (found.size < count) found.add(token(random, 2));
  return [...found];
}

function setupBoss(random, { home, user }) {
  const wholeCount = 4 + Math.floor(random() * 3);
  const crackedCount = 3 + Math.floor(random() * 3);
  const names = tokens(random, wholeCount + crackedCount);
  const whole = names.slice(0, wholeCount).map(t => `${WHOLE}${t}.mirror`);
  const cracked = names.slice(wholeCount).map(t => `${CRACKED}${t}.mirror`);
  const children = Object.fromEntries([
    ...whole.map(name => [name, file(WHOLE_TEXT, { owner: user })]),
    ...cracked.map(name => [name, file(CRACKED_TEXT, { owner: user })]),
  ]);
  const hall = `${home}/mirrors`;
  const patch = [remove(hall), put(hall, dir(children, { owner: user })), cd(home)];
  return { patch, secret: { whole: whole.map(name => `${hall}/${name}`), cracked: cracked.map(name => `${hall}/${name}`) } };
}

const crackedLeft = ctx => Object.keys(ctx.node(hallOf(ctx))?.children ?? {}).filter(name => name.startsWith(CRACKED));
const wholeKept = (ctx, whole) => whole.every(path => ctx.node(path)?.content === WHOLE_TEXT);

function bossNear(ctx, { whole }) {
  const left = crackedLeft(ctx).length;
  let note = null;
  if (!wholeKept(ctx, whole)) note = 'A whole mirror is gone or changed, and rm has no undo. Restart the chapter to get the hall back.';
  else if (unexpandedNote(ctx)) note = unexpandedNote(ctx);
  else if (ctx.tried('rm') && left > 0) note = `${left} cracked ${left === 1 ? 'mirror is' : 'mirrors are'} still there. ls ~/mirrors/cracked_* shows them.`;
  else if (ctx.ran('ls', record => ctx.paths(record).includes(hallOf(ctx)))) note = 'Every cracked mirror starts with cracked_. Preview that pattern with ls, then give rm the same pattern.';
  return note;
}

export default {
  id: 'mirrors',
  act: 1,
  title: 'Hall of Mirrors',
  setup: (_random, { home, user }) => [
    remove(`${home}/mirrors`),
    put(`${home}/mirrors`, dir(Object.fromEntries(Object.entries({ ...MIRRORS, ...SHARDS, ...OTHERS })
      .map(([name, text]) => [name, file(text, { owner: user })])), { owner: user })),
    cd(home),
  ],
  lesson: `<p>The hall is full of mirrors with names that look alike. Instead of typing every name, give bash a <b>pattern</b>: a name with wildcards in it.</p>
<ul>
<li><code>*</code> matches any characters, any number of them, even none. <code>mirror*</code> matches <code>mirror1.txt</code> and <code>mirror30.txt</code>; <code>*.shard</code> matches every name that ends in <code>.shard</code>.</li>
<li><code>?</code> matches exactly one character. <code>mirror?.txt</code> matches <code>mirror4.txt</code>, but not <code>mirror12.txt</code>.</li>
<li><code>[1-3]</code> matches one character from the brackets: 1, 2 or 3. <code>[ac]</code> matches <code>a</code> or <code>c</code>.</li>
</ul>
<p>The key idea: <b>bash</b> expands the pattern, not the command. Before it runs <code>ls ~/mirrors/mirror?.txt</code>, bash replaces the pattern with every matching name, in order. So <code>ls</code> receives five file names and never sees the <code>?</code>. Given file names, <code>ls</code> lists just those names. If nothing matches, bash leaves the pattern as it is, and <code>ls</code> says it cannot find a file with that odd name.</p>
<p>Quotes stop the expansion: inside quotes, <code>*</code> is just a star. Quotes also keep a name with a space in one piece. Bash splits a line into words at spaces, so <code>cat magic mirror.txt</code> asks for two files, <code>magic</code> and <code>mirror.txt</code>. Write <code>cat "magic mirror.txt"</code> instead. Careful: inside quotes, <code>~</code> is just a character too, so keep it outside them: <code>cat ~/mirrors/"magic mirror.txt"</code>.</p>
<p><code>rm</code> with a pattern removes every match at once, for good. So look before you remove: run the pattern with <code>ls</code> first, and when it lists exactly what should go, give the same pattern to <code>rm</code>.</p>`,
  tasks: [
    {
      goal: 'List only the mirror files, the names that start with `mirror` (`*` matches any characters: `ls ~/mirrors/mirror*`)',
      tip: 'Bash swaps `mirror*` for every name that starts with mirror, then runs `ls` on those names.',
      hints: [
        'Every mirror\'s name starts with `mirror`.',
        'Give `ls` the path `~/mirrors/` with `mirror*` at the end.',
        'ls ~/mirrors/mirror*',
      ],
      done: ctx => listsExactly(ctx, ALL_MIRRORS),
      near: ctx => listNote(ctx, ALL_MIRRORS, 'Every mirror starts with mirror: ~/mirrors/mirror*.'),
    },
    {
      goal: 'List only the `.shard` files in `~/mirrors`, the names that end in `.shard`',
      tip: 'A `*` can come first too, so the pattern matches every name with the same ending.',
      hints: [
        'The `.shard` files share an ending, not a beginning.',
        'Put `*` before `.shard`, after the path `~/mirrors/`.',
        'ls ~/mirrors/*.shard',
      ],
      done: ctx => listsExactly(ctx, SHARD_NAMES),
      near: ctx => listNote(ctx, SHARD_NAMES, 'Put * before the ending: ~/mirrors/*.shard.'),
    },
    {
      goal: 'List only the mirror files with a one-digit number, like `mirror4.txt` (`?` matches exactly one character)',
      tip: '`?` stands for exactly one character, so a two-digit number does not fit in it.',
      hints: [
        '`mirror*` also matches `mirror12.txt` and `mirror30.txt`.',
        'Put one `?` where the digit goes: `mirror?.txt`.',
        'ls ~/mirrors/mirror?.txt',
      ],
      done: ctx => listsExactly(ctx, ONE_DIGIT),
      near: ctx => listNote(ctx, ONE_DIGIT, '? matches exactly one character: ~/mirrors/mirror?.txt.'),
    },
    {
      goal: 'List only `mirror1.txt`, `mirror2.txt` and `mirror3.txt` (`[1-3]` matches one character from 1 to 3)',
      tip: 'Brackets match one character from the set inside them, and `1-3` means 1, 2 or 3.',
      hints: [
        'Like `?`, the brackets stand for one character, but only one you allow.',
        'Put `[1-3]` where the digit goes in the mirror names.',
        'ls ~/mirrors/mirror[1-3].txt',
      ],
      done: ctx => listsExactly(ctx, ONE_TO_THREE),
      near: ctx => listNote(ctx, ONE_TO_THREE, '[1-3] matches one character from 1 to 3: ~/mirrors/mirror[1-3].txt.'),
    },
    {
      goal: 'Read the file `~/mirrors/magic mirror.txt` (its name has a space: put the name in quotes)',
      tip: 'Quotes keep a name with a space as one word; keep `~` outside them, because inside quotes it is just a character.',
      hints: [
        'Without quotes, bash splits the name at the space, and `cat` looks for two files.',
        'Quote the name after the path: `~/mirrors/"magic mirror.txt"`.',
        'cat ~/mirrors/"magic mirror.txt"',
      ],
      done: ctx => ctx.read(`${hallOf(ctx)}/${MAGIC}`),
      near: readNear,
    },
    {
      goal: 'Remove all the `.shard` files with one `rm` command (use the same pattern you listed them with)',
      tip: 'Preview with `ls`, then give `rm` the very same pattern, and every match goes at once.',
      hints: [
        'You listed the `.shard` files with a pattern in the second task.',
        'Give that same pattern to `rm` instead of `ls`.',
        'rm ~/mirrors/*.shard',
      ],
      done: sweepDone,
      near: sweepNear,
    },
  ],
  solve: [
    'ls ~/mirrors/mirror*',
    'ls ~/mirrors/*.shard',
    'ls ~/mirrors/mirror?.txt',
    'ls ~/mirrors/mirror[1-3].txt',
    'cat ~/mirrors/"magic mirror.txt"',
    'rm ~/mirrors/*.shard',
  ],
  boss: {
    title: 'The Cracked Hall',
    briefing: `<p>Overnight the hall filled with new mirrors, and some of them cracked. In <code>~/mirrors</code>, every name starts with <code>whole_</code> or <code>cracked_</code>, followed by random letters and digits. Remove every cracked mirror, and keep every whole one. The names are random, so list the hall first, and preview your pattern with <code>ls</code> before you give it to <code>rm</code>.</p>`,
    setup: setupBoss,
    hints: [
      'Only names that start with `cracked_` must go. Look first: `ls ~/mirrors`.',
      'Preview the pattern `~/mirrors/cracked_*` with `ls`, then give the same pattern to `rm`.',
      'rm ~/mirrors/cracked_*',
    ],
    done: (ctx, { whole }) => ctx.tried('rm') && crackedLeft(ctx).length === 0 && wholeKept(ctx, whole),
    near: bossNear,
    hidden: ({ whole, cracked }) => [...whole, ...cracked],
    solve: obs => {
      const hall = nodeAt(obs.tree, `${obs.home}/mirrors`);
      const cracked = Object.keys(hall.children).some(name => name.startsWith(CRACKED));
      return cracked ? ['ls ~/mirrors', 'ls ~/mirrors/cracked_*', 'rm ~/mirrors/cracked_*'] : ['ls ~/mirrors'];
    },
  },
  recap: [
    ['ls ~/mirrors/mirror*', '`*` matches any characters, even none'],
    ['ls ~/mirrors/mirror?.txt', '`?` matches exactly one character'],
    ['ls ~/mirrors/mirror[1-3].txt', '`[1-3]` matches one character from 1 to 3'],
    ['cat ~/mirrors/"magic mirror.txt"', 'quotes keep a name with a space in one piece; `~` stays outside them'],
    ['rm ~/mirrors/*.shard', 'remove every match at once: preview the pattern with `ls` first'],
  ],
  why: `<p>Why does bash expand patterns, and not each command? Because then every command gets patterns for free. <code>ls</code>, <code>rm</code>, <code>cp</code>, <code>cat</code>, and any program you will ever run, simply receive a list of names. The rule lives in one place.</p>
<p>Why do spaces need quotes? Bash splits a line into words at spaces before it runs anything, and each word becomes one argument. A name with a space would be cut in two, so quotes, or a backslash before the space (<code>magic\\ mirror.txt</code>), keep it whole. That is why many people write <code>_</code> instead of spaces in file names.</p>
<p>Why preview first? A pattern can match more than you think: <code>mirror*</code> also matches <code>mirror30.txt</code>. And <code>rm</code> has no undo. <code>ls</code> or <code>echo</code> with the same pattern shows exactly the names <code>rm</code> would get.</p>`,
  field: [
    ['echo ~/mirrors/*.txt', 'see the names a pattern expands to, without touching the files'],
    ['ls *.txt', 'every name in this directory that ends in `.txt`'],
    ['ls -d ~/f*', 'list matching directories by name, instead of what is inside them'],
    ['rm -i *.tmp', 'ask before removing each match'],
  ],
  spells: [
    { name: '*', summary: 'Pattern: any characters, any number of them, even none.', examples: [['ls ~/mirrors/mirror*', 'names that start with mirror'], ['ls ~/mirrors/*.shard', 'names that end in .shard']] },
    { name: '?', summary: 'Pattern: exactly one character.', examples: [['ls ~/mirrors/mirror?.txt', 'mirror1.txt to mirror5.txt, not mirror12.txt']] },
    { name: '[ ]', summary: 'Pattern: one character from the set in the brackets.', examples: [['ls ~/mirrors/mirror[1-3].txt', 'mirror1.txt, mirror2.txt and mirror3.txt']] },
    { name: 'quotes', summary: 'Keep a name with a space in one piece, and stop bash expanding patterns.', examples: [['cat ~/mirrors/"magic mirror.txt"', 'one name with a space'], ['echo "*"', 'prints a star: the quotes stop the expansion']] },
  ],
};
