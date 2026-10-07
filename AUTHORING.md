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
import { put, remove, cd, dir, file } from '../../backend/spec.js';

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
- `ctx.home`, `ctx.cwd`, `ctx.node(absPath)`, `ctx.proc(key)`.
- `ctx.ran(name, pred?)`: a command with that name exited 0 (and `pred(record)` holds).
- `ctx.tried(name, pred?)`: same, any exit status.
- `ctx.flag(record, letter)`: a short option letter was given (`-la` has `l` and `a`).
- `ctx.hasPath(record, absPath)`: one of its non-option arguments resolves to `absPath`.
- `ctx.read(absPath)`: a reading command (cat, less, more, head, tail) succeeded on that file.
- `ctx.paths(record)`: its non-option arguments as absolute paths.
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
solve` prints the chapter's `solve` lines or `boss.solve`. Skipped parts pay no XP.

Each chapter test file runs against the real simulator (`createSimBackend`) and checks:
1. The module passes the shared contract check (`assertChapter` from `test/helpers/`).
2. Base world + `setup`, then `solve` line by line: every task completes, no line errors unexpectedly.
3. A near-miss for every task does not complete it.
4. Boss: for several seeds, `setup`, then `boss.solve(obs)`: `done` is true; a near-miss is not.
5. Every command shown to the player (lesson code, hints level 3, spells, recap) runs in the
   simulator without "command not found".
