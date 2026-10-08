# Authoring and code rules

Read `docs/DESIGN.md` first. This file is the contract for chapter content and the code
standards every teammate follows.

## 1. Code standards (all JavaScript)

These are the user's rules (`~/.claude/CLAUDE.md`) applied to JavaScript.

- ES modules, no globals, no classes unless one genuinely reduces complexity. No build step for
  development; only publishing bundles (`npm run bundle`, DESIGN section 1).
- Flat control flow: guard clauses for invalid input at the top, then one path to a single
  return at the end. No deep nesting.
- Design by contract, in the user's reading: a precondition catches a bug (a state that should
  be impossible) and **raises**. Expected outcomes (a wrong command, an unsolved task, a
  missing file the player typed) are normal logic with one return, never exceptions.
- Validate at the boundary (the save file, the player's line), trust inside.
- Catch only specific, expected errors (storage that throws `SecurityError` in a private
  window). Never swallow errors.
- Every exported function has a JSDoc block: description, `@param`, `@returns`, `@throws` when
  it raises. Types in JSDoc.
- Minimal comments: only for non-obvious reasons (a regex, a workaround). No section-divider
  comments, no emojis anywhere.
- One rule lives in one place (DRY); repeated constants get one name.
- Tests: `node:test` + `node:assert/strict`, one test file per source module under `test/`
  mirroring `src/`, named as sentences about behaviour, independent, no shared mutable fixtures.
  Test first: watch it fail, then make it pass. A bug fix starts with a reproducing test.
- `npm test` and `npm run lint` must pass before you report.

## 2. Chapter modules (`src/game/chapters/<id>.js`)

```js
import { put, remove, cd, dir, file, symlink, link } from '../../backend/spec.js';

export default {
  id: 'forest',
  act: 1,
  title: 'The Whispering Forest',
  // Patch applied when the chapter starts, on top of the base world from world.js.
  // It must work on a fresh world and on a world the player changed in earlier chapters.
  setup: (random, { home, user }) => [ /* patch ops */ ],
  lesson: `<p>...</p>`,                 // trusted HTML shown in the Quest panel
  tasks: [
    {
      goal: 'Enter the forest',
      tip: 'cd followed by a directory name walks you into it.',  // one sentence, shown with the goal
      hints: ['nudge', 'technique', 'cd forest'],   // level 3 is a line safe to paste
      done: ctx => ctx.cwd === `${ctx.home}/forest`,
      near: ctx => null,                    // optional: a note when the line got close the wrong way
    },
  ],
  solve: ['cd forest'],                 // lines a player would type to finish every task, in order
                                        // a tab character (\t) in a line means the player presses Tab there;
                                        // tests type such lines with typeLine() from test/helpers
  boss: {
    title: 'Lost in the Dungeon',
    briefing: `<p>...</p>`,
    setup: (random, { home, user }) => ({ patch: [ /* ops */ ], secret: { /* what done() compares against */ } }),
    hints: ['nudge', 'technique', secret => `cd ${secret.target}`],  // an entry may be a function of the secret
    done: (ctx, secret) => boolean,
    near: (ctx, secret) => null,        // optional, like a task's near
    hidden: secret => ['/abs/path'],    // optional: kept off the map until an ls lists their directory
    solve: obs => ['lines'],            // derived from the observation like a player would, never from the secret
  },
  recap: [['cd dir', 'enter a directory']],
  why: `<p>...</p>`,                   // trusted HTML for the adventure log: why the system works this way
  field: [['cd -', 'jump back to the previous directory on a real machine']],
  spells: [{ name: 'cd', summary: 'Change directory.', examples: [['cd forest', 'relative path']] }],
};
```

The check context `ctx` (implemented in `src/game/checks.js`) sees only the port's data:
- `ctx.commands`: the `CommandRecord`s of this line; `ctx.obs` / `ctx.before`: observations after and before it.
- `ctx.home`, `ctx.cwd`, `ctx.node(absPath)`, `ctx.proc(key)`. `ctx.node` follows symbolic links like `cat`
  does (a dangling link gives `null`). `ctx.cwd` is the logical path, as `pwd` prints it: after `cd portal`
  it is `~/portal`, not where the link leads.
- `ctx.inode(absPath)`: the inode number the path leads to (links followed), or `null`. Two paths are one
  file (hard links) when their numbers are equal: `ctx.inode(a) === ctx.inode(b) && ctx.inode(a) !== null`.
- `ctx.linkTarget(absPath)`: the target text of the symbolic link at that path, exactly as created
  (`'/home/hero/forest/cave/deep'`, `'../scroll.txt'`), or `null` if the path is not a link.
- `ctx.archive(absPath)`: the members of the tar archive at that path (links followed; plain or gzip,
  however it is named), in archive order, or `null` when the path is missing or not a tar archive.
  Each member is `{ path, type, mode, owner, group, mtime, size }` plus `content` (a file) or `target`
  (a link); `path` is the name exactly as `tar -t` lists it, so a directory ends with a slash
  (`'camp/'`, `'camp/notes.txt'`). "the archive holds the notes" is
  `` ctx.archive(`${ctx.home}/camp.tgz`)?.some(m => m.path === 'camp/notes.txt') ?? false ``.
  A member keeps the owner and mode it had when stored; `tar -x` by the player makes the files theirs.
- `ctx.gzipped(absPath)`: the original text of the gzip data at that path (`gzip FILE`, `tar -czf`),
  or `null` if it is not gzip data. A `.tar.gz` gives the tar archive's text: use `ctx.archive` for it.
- `ctx.ran(name, pred?)`: a command with that name exited 0 (and `pred(record)` holds).
  Every record has `user`, the user it ran as. `sudo chown mira f` gives two records: `sudo`
  (`user: 'hero'`, `asUser: 'root'`, the target even when sudo refused) and, if sudo ran it, `chown`
  (`user: 'root'`, `via: 'sudo'`), sharing the pipeline place and redirections. "chown ran as root" is
  `ctx.ran('chown', r => r.user === 'root')`; a plain `chown` by the player has `user: 'hero'`.
- `ctx.tried(name, pred?)`: same, any exit status.
- `ctx.jobs`: the shell's jobs after the line, `[{ id, pid, cmd, state, mark }]`, `state` being
  `'running'`, `'stopped'` or `'done'` (the process is gone, not yet reported) and `mark` `'+'`
  (current), `'-'` (previous) or `' '`. `ctx.job(1)` is job `%1`, or `null`.
- `ctx.ended(id)`: job `id` ended on this line: its process went (`kill %1`, `kill -9 %1`, or it
  finished), or bash reported its end (`[1]+  Done ...` after a job that finished while the player
  typed). A new job that took the number does not count.
- `ctx.pressed(key, name?)`: the player pressed Ctrl+C (`'INT'`) or Ctrl+Z (`'TSTP'`) while a
  command (named `name`, if given) ran in the foreground: `ctx.pressed('TSTP', 'sleep')`.
  The record of that command has `signal: 'INT'|'TSTP'` and status 130 or 148. A command of a
  job started with `&` has `background: true` and `job: N`: "started sleep in the background" is
  `ctx.ran('sleep', r => r.background)`.
- `ctx.hasPath(record, absPath)`: one of its non-option arguments resolves to `absPath`; for commands that read their input (cat, grep, sort, uniq, wc, head, tail...), also a file sent in with `<` or by a plain `cat` piped into it.
- `ctx.streams(record)`: `{out, err}`, where the command's output and errors went after its redirections in typed order (`2>&1`, `&>` included); `null` is the screen.
- `ctx.onScreen(record)`: the record's output reached the screen: last stage of its pipeline, stdout not redirected.
- `ctx.shown(absPath)`: like `ctx.read`, but the text reached the screen: the reader was the last stage and was not redirected into a file. Use it for notes like "cat prints the whole file".
- `ctx.flag(record, letter)`: a short option letter, or the long option players type for it (`--all`, `--recursive`, `--lines=3`...).
  tar's letters count with or without a dash: `tar czf a.tgz dir` and `tar --create --gzip --file=a.tgz dir`
  both have `c`, `z` and `f`.
- `ctx.piped(record)`: the absolute paths a plain `cat` (no options) piped straight into this stage, e.g. `cat a.txt | sort` gives sort `[a.txt]`; `[]` otherwise. Accept `cat file | cmd` wherever `cmd file` is accepted.
- `ctx.read(absPath)`: a reading command (cat, less, more, head, tail) succeeded on that file.
- `ctx.paths(record)`: its non-option arguments as absolute paths (for `tar czf a.tgz dir`, the archive and `dir`).
- `ctx.line`: the line's text as typed. Judge records and state first; use the text only for what
  leaves no record, like a variable assignment (`wish=gold`) or which `$` name was expanded.
- `ctx.completions`: the Tab presses since the previous line, `[{ line, completed }]`. They come
  from the page's own terminal; a real terminal (termlab) would handle Tab inside bash and report
  none, so only use this where losing the task in that mode is acceptable (today: forest's Tab task).

A task is checked after every line until it passes once; tasks complete in any order but the
panel highlights the first unfinished one.

`tip` is required: one sentence of at most 140 characters that teaches what the task needs, shown
next to the goal in the task strip above the terminal, so the player never has to scroll back to
the lesson to start. The lesson stays as the full reference.

`near` is optional. When the line reached the goal's place or result by a method the task does not
accept (a relative path where it asks for an absolute one, `cd forest` typed out where it asks for
Tab), return one short sentence saying what the task wants; otherwise `null`. A task must never
fail silently when the player did almost the right thing. The session asks only the current task
(the first unfinished one, which the panel highlights) or, in the boss room, the boss: a note about
another task would answer a question the player was not asking. At most one coach note per line:
that `near` note first, else a generic note from `src/game/coach.js`.

### Users and groups

/etc/passwd and /etc/group in the tree are the user and group database: `id`, `groups`, `ls -l`,
`chown`, `chgrp`, `~name` and the permission checks all read them. To add people, write both files
with `accounts()` from `src/game/world.js` (the base accounts plus yours; it throws on a taken name or
id). The shell's groups are fixed at login, as on Linux, so follow it with `login()` from spec.js
when the player joins a group:

```js
setup: (random, player) => [
  ...accounts(player, {
    users: [{ name: 'mira', uid: 1001, group: 'smiths' }, { name: 'oren', uid: 1002, group: 'scribes' }],
    groups: [{ name: 'smiths', gid: 1001 }, { name: 'scribes', gid: 1002, members: [player.user] }],
  }),
  login(),
  put(`${player.home}/hall/blade.txt`, file('...', { owner: 'mira', group: 'smiths', mode: 0o640 })),
],
```

Node owners and groups are names; use digits (`owner: '1234'`) for a file whose owner has no
account, which `ls -l` shows as a number. `accounts()` does not create homes. The base world ends with
`login()`, so a fresh world resets the player's groups. `accounts()` also writes `/etc/shadow` (mode
640, `root:shadow`) with a made-up hash per person; it never holds the real password.

### sudo and the player's password

The policy is the tree's: `/etc/sudoers` (the base world has Ubuntu 24.04's, with `%sudo
ALL=(ALL:ALL) ALL` and `@includedir /etc/sudoers.d`) and the files in `/etc/sudoers.d`. So the player
is an administrator when they are in the group `sudo`: `accounts(player, { sudo: [player.user] })`, or
`realm(player, { sudo: true })`, then `login()` (realm does it). Rules in `/etc/sudoers.d` may give less
(least privilege): `%smiths ALL=(root) /usr/bin/chown` lets the smiths run only chown as root, and
`sudo -l` lists it. Understood: `WHO HOST=(RUNAS) [NOPASSWD:] COMMANDS` with WHO a user, `%group` or
ALL, COMMANDS ALL or full paths (optionally with exact arguments), plain `Defaults` lines.

The password sudo asks for is the player's own, set with `password()` from spec.js. The machine keeps it
outside the tree: it is in no file and not in the Observation. Set it in the setup of every chapter
that uses sudo (a reload rebuilds the world from setup):

```js
import { password } from '../../backend/spec.js';
import { realm } from '../people.js';

setup: (random, player) => [
  ...realm(player, { factions: ['smiths'], sudo: true }),   // hero in group sudo, logged in again
  password('dragon'),
],
```

Without a password, sudo skips the prompt with a note (chapter 11's `sudo ls` relies on this). With
one, `sudo` prints `[sudo] password for hero: ` and the terminal reads a hidden line; three wrong
tries end with `sudo: 3 incorrect password attempts`; Ctrl+C ends with `sudo: a password is required`.
A correct password is remembered for 15 minutes of the game clock; `sudo -k` forgets it.

Not simulated: a root shell (`sudo -i`, `sudo -s` end with a note: put sudo in front of the one
command that needs root), `sudo -ll`, sudo's environment handling (`env_reset`, `SUDO_USER`), and
options like `-E`, `-g`, `-D` (a note). Redirections belong to the player's shell, as in bash: `sudo
echo x > /etc/f` is refused, `echo x | sudo tee /etc/f` works. sudo logs to `/var/log/auth.log` like
Ubuntu (readable with `sudo cat`).

### Links

`symlink(target, { owner, group })` from spec.js describes a symbolic link. The target text is kept
exactly as written (like `ln -s TARGET NAME`): a relative one is read from the link's own directory,
and it may point at nothing (a dangling link). Use it anywhere a node goes, also inside `dir()`.
`link('/abs/path')` is a hard link: another name for the node already at that path, sharing its
inode, content, mode and owner. It may only be the node a `put` places, after its target exists,
and the target may not be a directory (the backend raises).

```js
setup: (random, { home }) => [
  put(`${home}/portal`, symlink(`${home}/forest/cave/deep`, { owner: 'hero' })),  // ~/portal -> ~/forest/cave/deep
  put(`${home}/scroll.txt`, file('A map.\n', { owner: 'hero' })),
  put(`${home}/copy.txt`, link(`${home}/scroll.txt`)),                         // a second name, same inode
],
```

In the Observation tree (`src/backend/port.js` TreeNode) every node has `ino` and `links`; a symbolic
link is `{type: 'symlink', target, ...}`. `ctx.node(path)` follows links like `cat` would;
`ctx.inode(path)` and `ctx.linkTarget(path)` answer "same file?" and "where does this link point?".

### Time and jobs

The game's clock is the real one: `sleep 30 &` is `Done` 30 seconds later, and a foreground `sleep 5`
holds the prompt for 5 seconds (Ctrl+C ends it, Ctrl+Z stops it as a job). Pick lengths a learner
can wait for when a task needs the end (`sleep 20 &`), and long ones when it must not end on its
own (`sleep 600` to stop with Ctrl+Z, `sleep 600 &` to `kill %1`). bash reports a finished job after
the next line, so a lesson can say "press Enter". A job's commands run at once in the simulator;
only its sleeps take time, so `sleep 3 && echo hi &` prints `hi` at once (real bash: after 3 s).

### Explainers (optional)

A chapter may add `explainer: 'links'`, the id of an explainer in `src/intro/explainers.js` (game code
may not import that layer; `withExplainers` in the composition root swaps the id for the explainer). It plays before
the lesson the first time the chapter opens (the save remembers it in `explainersSeen`, like
`introSeen`) and comes back from "Watch the explainer" in the Quest panel. The player moves with
Back, Next and Skip; nothing moves on by itself. An explainer is
`{ id, title, draw, steps }`, where `draw(diagram, timing)` returns the diagram's HTML, and each
step is:

```js
{
  title: '<code>ln</code> adds a second name',  // trusted HTML: code, kbd, b, em only
  text: ['One to three short sentences, in plain words.'],
  term: [{ type: 'ls -i', output: ['1847 copy.txt  1847 scroll.txt'] }], // optional; also user, cwd, fails, wait
  diagram: { show: 'signs', ... },              // passed to draw
  sound: 'create',                              // optional; default 'page', one cue per step
}
```

`timing.at(i)` is when line `i` of `term` shows its output and `timing.end` when the strip is done,
so the diagram moves in step with the terminal. Diagrams are CSS: the base style is the final
frame, so reduced motion shows still frames. `assertChapter` checks a declared explainer with
`assertExplainer`.

## 3. Content rules

1. **Correct on the reference system** (Ubuntu 24.04, bash 5.2, coreutils 9.4, `LC_ALL=C.UTF-8`).
   Check every sentence against the man page and a real run (use the difftest Docker image).
   Avoid "always", "never", "only" unless verified. Log each claim in `docs/verification/<id>.md`
   with its evidence.
2. **Teach first.** The lesson introduces every command and option a task needs. The boss uses
   only what this and earlier chapters taught.
3. **Checks prove the claim.** If a task says "search the tower", the check requires the tower
   as the target. Every task gets a near-miss test that must not pass.
4. **Hints:** nudge (what to think about), technique (which command or option), command (the
   exact line). Placeholders are UPPERCASE words (`kill PID`), never `<angle brackets>`, which
   the shell reads as redirection.
5. **Randomize what matters** in boss rooms (targets, names, PIDs, passwords) with the `random`
   argument only, never `Math.random`. Random tokens use the alphabet `acdefhjkmnprtuvwxy34679`
   (no 0/O, 1/l/I, 2/Z, 5/S, 8/B).
6. **Flavour is a skin over facts.** Story text is fact-checked like lessons. The real names stay
   visible (a door labelled `forest/` is the directory `forest`).
7. Plain English, short sentences, second person, no emojis.
   **No riddles.** A challenge tests the commands, not the reading: say directly what to find
   and what to do once found. The user found chapter 1's first boss (forged letters whose real one
   asked for "the manual page of the spell that prints your user name") confusing because of its
   wording, and it was removed (2026-10-06). Ask "could a beginner misread this?" for every
   briefing, and have the teaching reviewer answer it too. A boss is the chapter's own tasks
   again with one small twist (an unknown name to find, a random target), never a puzzle and
   never an arbitrary rule; the user approves each boss briefing before it is built.
8. In task goals, hints 1 and 2, spell notes and recap/field meanings, wrap every name the player
   might type in backticks (`` `cd ..` ``). The page renders them in the mono font; the terminal strips
   them, because in bash backticks run a command. Level-3 hints and `solve` lines never use backticks.
9. **Missions are simple, with plenty of clues** (the user, 2026-10-07). The player is learning.
   - **Chapter 1 is practice:** every goal shows its command in parentheses, like "Look around
     your home (`ls`)".
   - **From chapter 2 on**, a goal names the target (a path, a file, a place), not the command:
     "Jump to the river with an absolute path `~/forest/river`". Knowing that `cd` plus that path
     does it is the player's part. The tip under the goal may name the command. The one exception
     so far is `cd -`, whose goal names it because a dash as a place is too odd to guess.
   - **A command or option new in the chapter** gets a clue in its first goal, in parentheses: a
     hint, not the whole line, like "Reveal the hidden files in your home (`ls` with `-a`, for
     all)" or "(`mkdir` makes directories)". A complex line (a redirection, two paths) may be shown
     in full the first time: "(`echo wood > ~/camp/supplies.txt`)". Later goals of the chapter
     that use it again name only the target (the user, 2026-10-07).
   - The full command line waits for hint 3.
10. **Plain words for actions** (the user, 2026-10-07). Goals, hints and notes say what the
    command does: "Remove the file", "List", "Read", not "Sweep up", "Throw away" or "Break up".
    The story lives in the lesson and the boss briefing, never in place of the action. Name game
    things by what they are in the terminal, in backticks: "the `.shard` files", "the directory
    `~/junk/cobwebs`", not "the shards" or "the cobwebs".

## 4. Chapter tests (`test/game/chapters/<id>.test.js`)

To play a new chapter by hand, open the game with `?dev` (http://localhost:8765/?dev). Dev mode keeps
its own save (the player's is untouched), opens every written chapter in Chapters, and adds terminal
commands: `dev skip` finishes the next task (or the boss), `dev boss` jumps to the boss room, `dev
solve` prints the chapter's `solve` lines or `boss.solve`. Skipped parts pay no XP. Add
`&explainer=perms` or `&explainer=links` (`?dev&explainer=links`) to open an explainer over the
title screen.

A line that asks for the password needs an answer in tests. `type(backend, line, { password: 'dragon' })`
from `test/game/chapters/harness.js` answers each prompt in order (`{ password: ['wrong', 'dragon'] }`
for several tries, `null` for Ctrl+C) and returns the parts of the line joined; a prompt the test did
not answer raises. `play()` and the session playthrough answer with the password the chapter's setup
sets (`passwordOf(chapter)`), so `solve` lines may use sudo.

Commands that take time run on a test clock that stands still until the test moves it. `startChapter`
returns a backend with `tick`: `await backend.tick(30)` lets 30 seconds pass, so a `sleep 30 &` job is
`Done` on the next line. A line whose command runs in the foreground (`sleep 5`, `fg`, `wait`) runs to
its end on that clock, unless the test presses keys while it runs: `type(backend, 'sleep 100', { keys:
['ctrl-z'] })`, or `{ keys: [30, 'ctrl-c'] }` to let 30 seconds pass first. A line that never ends by
itself (`sleep infinity`) needs a key, and keys the line did not use raise. In `solve` lines, Ctrl+C
(`\u0003`) and Ctrl+Z (`\u001a`) at the end of the line are pressed while it runs: `'sleep 100\u001a'`.
`play()`, the session playthrough and `dev solve` (which prints them as "(then Ctrl+Z)") follow them.
`errors(result)` leaves out bash's job notices (`[1] 4242`, `[1]+  Done ...`), which go to standard
error but are no errors.

Each chapter test file runs against the real simulator (`createSimBackend`) and checks:
1. The module passes the shared contract check (`assertChapter` from `test/helpers/`).
2. Base world + `setup`, then `solve` line by line: every task completes, no line errors unexpectedly.
3. A near-miss for every task does not complete it.
4. Boss: for several seeds, `setup`, then `boss.solve(obs)`: `done` is true; a near-miss is not.
5. Every command shown to the player (lesson code, hints level 3, spells, recap) runs in the
   simulator without "command not found".
