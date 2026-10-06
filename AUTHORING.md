# Authoring and code rules

Read `docs/DESIGN.md` first. This file is the contract for chapter content and the code
standards every teammate follows.

## 1. Code standards (all JavaScript)

These are the user's rules (`~/.claude/CLAUDE.md`) applied to JavaScript.

- ES modules, no globals, no classes unless one genuinely reduces complexity. No build step.
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
      hints: ['nudge', 'technique', 'cd forest'],   // level 3 is a line safe to paste
      done: ctx => ctx.cwd === `${ctx.home}/forest`,
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
8. In task goals, hints 1 and 2, spell notes and recap/field meanings, wrap every name the player
   might type in backticks (`` `cd ..` ``). The page renders them in the mono font; the terminal strips
   them, because in bash backticks run a command. Level-3 hints and `solve` lines never use backticks.

## 4. Chapter tests (`test/game/chapters/<id>.test.js`)

Each chapter test file runs against the real simulator (`createSimBackend`) and checks:
1. The module passes the shared contract check (`assertChapter` from `test/helpers/`).
2. Base world + `setup`, then `solve` line by line: every task completes, no line errors unexpectedly.
3. A near-miss for every task does not complete it.
4. Boss: for several seeds, `setup`, then `boss.solve(obs)`: `done` is true; a near-miss is not.
5. Every command shown to the player (lesson code, hints level 3, spells, recap) runs in the
   simulator without "command not found".
