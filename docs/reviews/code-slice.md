# Code review: the vertical slice

A read-only review of `src/` and `test/` on `main` at commit `df81ccf` ("Add task tips, near-miss
notes and the coach to the contracts"), against the user's rules (`~/.claude/CLAUDE.md`: keep it
simple, single responsibility, orthogonal layers, DRY, TDD, design by contract), the user's
reading of design by contract (a precondition raises for an impossible state; expected outcomes
are normal logic with one return), DESIGN.md sections 2 and 8, and AUTHORING.md section 1.

Round 2 (coach notes, task tips, near-miss notes, simulator option fixes, UI wording) was in
flight in other worktrees and is not part of this commit. Where a finding overlaps that work, it
says so, so the lead can check the change closes it.

## How it was done

- Mapped the import graph of `src/` by layer with a small script, and probed the ESLint layer
  rules by linting snippets through `--stdin`.
- Read every module of `src/game`, `src/backend`, `src/ui`, `src/intro`, `src/main.js`, the
  shell's executor, guards, options, grep, arithmetic and HTML helpers, and the map's public
  module, room reader and journey.
- Drove the real simulator with hostile and beginner input (5000-digit numbers, deep nesting,
  markup in file names, `rm -r` and `kill` spellings, copying a directory into itself).
- Mutation-tested 48 of the most important guards in a scratch copy: revert one guard, run the
  suite. 46 were caught; the 2 survivors are in the low findings.
- Every finding below was reproduced or checked against the code before it was written down.

Severity follows the Ring Zero audit. High: wrong behaviour or data, or a hole in a contract the
user asked for. Medium: a real maintainability cost, or a bug with a narrow trigger. Low: style,
consistency, or a cosmetic bug.

## Strengths

- **The import graph points downward.** Nothing above the port imports `src/shell` except
  `src/main.js`, the composition root. `src/game` imports only `src/backend` (the port types and
  `spec.js`); the map only `port.js` and `access.js`. There are no cycles.
- **The core is clean of the browser.** `src/shell`, `src/game` and `src/backend` use no DOM,
  storage, timers or globals. Only `TextEncoder`, and the `Date.now`/`Math.random` defaults that
  `createSimBackend` lets callers inject.
- **Checks see only port data.** Chapters read `ctx` (CommandRecords and Observations), never
  notes or HTML. The Observation snapshot exposes only the fields `port.js` declares.
- **The line-level rules hold.** All 205 exported functions have JSDoc, and only one function that
  raises lacks `@throws` (L10). ESLint reports 0 errors and 0 warnings, with max depth 3, 60-line
  functions and complexity 15. No classes. Two try/catch blocks, each catching one specific
  error (`SyntaxError` in the save parser, `DOMException` in the storage adapter).
- **Contracts raise.** `payout`, `loseHeart`, `rankFor`, `setSound`, `startChapter`,
  `validatePatch`, `allows` and `restore` raise on impossible input. The save is parsed and
  validated once, at the boundary.
- **The tests are strong.** 758 tests run in 3.3 s. The mutation run caught reverts of every
  danger rule, both simulator guards, the payout floor, replay pay, save validation and v1
  migration, chapter locking, the boss anti-shortcut rules, escaping in both layers, and Tab
  tracking.
- **Escaping is consistent.** Every `innerHTML` sink that can carry player text escapes it:
  crumbs, picks, prompt, the terminal echo, and the simulator's `ls`, `ls -l`, `ls -F`, `dir`,
  `tree` and `grep` markup. I tested file names like `<img src=x onerror=alert(1)>`.
- **Hostile input mostly holds.** 5000-digit numbers in `head -n` and `$(( ))` return at once.
  `find /` is bounded, alias loops end, and `cp -r`/`mv` of a directory into itself is refused
  with GNU's message.

## High

### H1. Whether a line costs a heart depends on the backend: the danger rule lives in three places that disagree

- **Rule:** orthogonal software (the user's requirement that a real bash can replace the
  simulator without touching game rules), DRY ("a rule lives in exactly one place"), single
  responsibility.
- **Where:** `src/game/session.js:141`, `src/game/effects.js:13,84-120`,
  `src/shell/commands/procs.js:54-58,70-75`, `src/shell/commands/files.js:129,160-162`,
  `test/helpers/fake-backend.js:122-134`, `docs/DESIGN.md:53`.
- **Evidence:** `const danger = result.blocked[0] ?? dangers(ctx)[0];` — the simulator's refusals
  win, and they cover more than the game's rule:
  ```
  node --input-type=module -e "import {createSimBackend} from './src/shell/backend.js'; import {baseWorld} from './src/game/world.js'; import {makeContext} from './src/game/checks.js'; import {dangers} from './src/game/effects.js'; const b=createSimBackend(); await b.load(baseWorld({home:'/home/hero',user:'hero'})); for (const line of ['kill -HUP \$\$','pkill -9 bash','rm -r ~']) { const before=await b.observe(); const r=await b.run(line); console.log(line,r.blocked,dangers(makeContext({commands:r.commands,before,obs:await b.observe()}))); }"
  kill -HUP $$   blocked: ["SIGHUP would stop the player's own shell (PID 505)"]   dangers: []
  pkill -9 bash  blocked: ["SIGKILL would stop the player's own shell (PID 505)"]  dangers: []
  rm -r ~        blocked: ["rm -r /home/hero would delete the home directory ..."]  dangers: ["rm -r on your home directory, ... there is no undo."]
  ```
- **Failure scenario:** on a termlab backend, `blocked` is always empty. Then `kill -HUP $$`,
  `kill -STOP $$`, `pkill -9 bash` and `killall -9 bash` cost no heart, though each costs one
  today. The heart message for `rm -r ~` also changes from the simulator's terse line to the
  game's beginner text (`REASONS` in effects.js, which the simulator path never shows). Making
  one more command dangerous means editing effects.js, files.js or procs.js, and the fake
  backend, which already differs: it does not guard `rm -r /home`. DESIGN 2.1 also says the
  simulator refuses `rm -rf /`, but a test asserts it is a real refusal, not a block.
- **Simplest fix:** hearts come only from the game's rule. Move `dangers` and `REASONS` out of
  `effects.js` into their own module (`src/game/dangers.js`), so effects.js only derives
  animations. Decide there which kills of the shell are dangerous (pkill, killall, terminating
  signals other than KILL), reading `ctx.before.procs`. `blocked` then produces only the
  `guardian` effect, never a heart. Update DESIGN 2.1 and the fake backend's comment to match.
- **Owner:** lead (the decision and DESIGN 2.1), engine (`effects.js`, `session.js`, fake
  backend), shell (its guard keeps protecting the world, without game text).

### H2. `grep` colours matches inside HTML entities, so lines with quotes or `<` show `&quot;` on screen

- **Rule:** correctness of what a beginner sees; validate and escape at one boundary.
- **Where:** `src/shell/commands/grep.js:84`.
- **Evidence:** the regex runs over `esc(line)`, not over the line:
  ```
  marked = esc(line).replace(new RegExp(re.global.source, ...), m => `<span class="g-match">${m}</span>`)
  $ grep o library/librarian.txt      (shipped world file)
  html: The librarian whispers: &qu<span class="g-match">o</span>t;N<span ...>o</span>body ...
  ```
- **Failure scenario:** the browser renders `&qu<span>o</span>t;` as the literal text `&quot;`.
  This happens whenever the pattern matches a letter of `quot`, `lt`, `gt` or `amp` on a line
  with `"`, `<`, `>` or `&`. Several world files contain quotes (`librarian.txt`,
  `mushroom.txt`, `fish.txt`). `grep "<" file` never highlights. It is not an XSS: the escaped
  text holds no `<` to inject.
- **Simplest fix:** split the raw line on the matches and escape every piece. Matches go
  through `span('g-match', m)`, as the `-o` path at line 81 already does. Add a test with
  `grep o` on a line holding `"`.
- **Owner:** shell.

## Medium

### M1. Session calls can overlap: with a backend that takes time, a reset during a running line leaves an impossible state

- **Rule:** design by contract (the session states "Callers await each call before making the
  next one" at `src/game/session.js:6`, but nothing enforces it, and the UI breaks it).
- **Where:** `src/ui/app.js:300` (chapter list), `:227-231` (New game), `:333` (Reset) call the
  session directly. Only typed lines go through the terminal's queue (`src/ui/terminal.js:151`).
- **Evidence:** a script wrapped the simulator so that each call takes 30 ms, like a socket. It
  played chapter 1 up to the last task, called `submit('clear')`, then `reset()` 5 ms later:
  ```
  turn events: [{"kind":"task","index":6,...,"xp":10},{"kind":"boss-start",...}]
  after: xp 10   tasks done false,false,false,false,false,false,false   phase boss
  ```
- **Failure scenario:** after "Reset progress", the fresh game holds 10 XP and sits in the boss
  room with no task done. Today the simulator answers within microtasks, so a click cannot land
  in between. With termlab, a click during any command can. Restarting the chapter from the
  list during the slow line does the same (verified: boss room, no task done).
- **Simplest fix:** enforce the precondition in the session. Keep a `busy` flag around every
  async method and raise `Error('session call while another is running')`, with a test. In
  `app.js`, route every session call that changes state through one queue, the one lines
  already use.
- **Owner:** engine (the guard), ui (the queue).

### M2. The port leaves the output vocabulary to the simulator, so a second backend cannot know what the UI expects

- **Rule:** orthogonal software; a port that "exists so the types have one home"
  (`src/backend/port.js:11`).
- **Where:** `src/backend/port.js:18-21` declares `html?: string, tone?: string` without
  values. The values live in `src/shell/backend.js:13,21,59-61` (classes `c-dir`, `c-exe`,
  `g-file`, `g-sep`, `g-num`, `g-match`, and `tone: 'clear'`), and the UI depends on them
  (`src/ui/output.js:61-62`, `styles/`).
- **Failure scenario:** a termlab adapter that follows `port.js` passes bash's text through.
  `ls` prints `[01;34mforest[0m` and `clear` prints `[H[2J` in the terminal: `chunkLine` escapes
  markup but keeps control characters. The `coach` tone added in DESIGN 2.3.1 is in no type at
  all.
- **Simplest fix:** document the vocabulary in `port.js`. `text` is plain text without control
  sequences; `html` uses only the listed classes and escapes everything else; the `tone`
  values are `'clear'` (empty the screen) and `'coach'`. An adapter then knows to turn ANSI
  colours into those classes. No code change is needed today.
- **Owner:** lead.

### M3. The layer rules are not enforced by the linter, although DESIGN 2 says they are

- **Rule:** orthogonal software; the working agreement that the linter keeps the rules.
- **Where:** `eslint.config.js:8-15`.
- **Evidence:** the core block's `globals: {}` does not remove the browser globals the
  `src/**` block added; flat config merges them. Only the five names in
  `no-restricted-globals` are caught:
  ```
  printf 'export const a = () => sessionStorage.getItem("x");\nexport const b = () => globalThis.localStorage;\nexport const c = () => fetch("/x");\nimport { esc } from "../ui/output.js";\nimport { executeLine } from "../shell/exec.js";\nexport const d = [esc, executeLine];\n' | npx eslint --stdin --stdin-filename src/game/probe.js   # exit 0
  ```
  Upward imports are not checked either: `src/game`, `src/map` and `src/ui` may import
  `src/shell/exec.js`, and lint stays clean.
- **Failure scenario:** a change that saves from `src/game` with `sessionStorage`, or a map
  helper that imports the simulator's `fs.js`, passes `npm run lint`, and the backend can no
  longer be swapped.
- **Simplest fix:** give the core layers no browser globals. Add `ignores` for the core
  directories to the browser block, and give the core block only `TextEncoder` (the one global
  the core uses; checked with `--no-config-lookup --rule no-undef`). Add
  `no-restricted-imports` patterns per layer: nothing outside `src/shell` (except `src/main.js`)
  imports `src/shell/**`; `src/game`, `src/backend` and `src/shell` import nothing from
  `src/ui`, `src/map` or `src/intro`.
- **Owner:** lead (`eslint.config.js` is not in the ownership table).

### M4. Observation tree and path helpers are written five times above the port, and two already disagree

- **Rule:** DRY ("repeated data shapes become one shared definition"; "duplication found
  anywhere is moved to that one place first").
- **Where:** `nodeAt` in `src/game/checks.js:39` and `src/map/room.js:36` (the same walk).
  "Path is inside a directory" in `src/game/chapters/kit.js:15`, `src/map/paths.js:35`, inline
  in `src/game/effects.js:88` and in `src/ui/output.js:40`. Path joining in `effects.js:23`
  and `map/paths.js:23`. The C.UTF-8 name order in `src/shell/collate.js:14` and
  `src/map/room.js:43`.
- **Evidence:**
  ```
  kit.isInside('/home/hero', '/')  -> false
  map within('/home/hero', '/')    -> true
  ls order: ['！.txt', '😀.txt']    map order: ['😀.txt', '！.txt']   (code points vs UTF-16 code units)
  ```
- **Failure scenario:** a chapter check that asks "is the player inside `/`" gets the opposite
  answer from the map. A player who names files with emoji sees the doors in a different order
  from `ls`. When the port gains a node type (a symlink), five walkers must change together.
- **Simplest fix:** one module beside the port, `src/backend/tree.js`, exporting `nodeAt`,
  `within`, `joinPath`, `parentOf` and `compareNames`, with one test file. The game, the map,
  the UI and the fake backend import it. The simulator may keep its own internal helpers (it is
  a backend), but it should share `compareNames`, as it does `access.js`.
- **Owner:** lead (the module), then engine, author, art and ui switch their callers.

### M5. Beginner coaching lives in the simulator, so it disappears with a real bash

- **Rule:** orthogonal software; DESIGN 2.3.1 ("coach notes are game rules ... the simulator
  keeps only notes that explain where the simulation differs").
- **Where:** `src/shell/exec.js:27-38` (`MISTAKES`: `cls`, `copy`, `cd..`, `ls-l` ...) and
  `:97` (the case-sensitivity note). Also teaching notes that real Linux shares:
  `src/shell/commands/shell.js:115` (sudo advice) and `src/shell/commands/procs.js:56`
  (bash ignores SIGTERM).
- **Failure scenario:** with termlab, `cd..` gets a bare `command not found`, and so does `LS`.
  The teaching review lists these notes among what works.
- **Simplest fix:** this is round-2 work (`src/game/coach.js`). When it merges, check that
  `MISTAKES` and the case note are gone from `exec.js` and that a coach test covers each entry.
- **Owner:** engine (coach.js), shell (removal).

### M6. Real options the simulator lacks get GNU's "invalid option" error, and some accepted flags do nothing

- **Rule:** correctness of what a beginner learns. The note mechanism exists exactly for
  "where the simulation differs".
- **Where:** `src/shell/options.js:20`; `src/shell/commands/files.js:34-48` (`cat` accepts
  `nAbEsTv`, implements only `n`).
- **Evidence:**
  ```
  $ ls -R forest        ls: invalid option -- 'R'       (real ls has -R)
  $ sort -k1 file       sort: invalid option -- 'k'     (real sort has -k)
  $ cat -E readme.txt   Dear apprentice,                (real: "Dear apprentice,$")
  $ cp --bogus a b      cp: cannot stat 'a': ...        (real: unrecognized option '--bogus')
  ```
- **Failure scenario:** a beginner who tries `ls -R` from a tutorial learns that it does not
  exist. `cat -A` shows no line ends, which is the whole point of the flag.
- **Simplest fix:** per command, list the real options that are not simulated. They answer with
  a note ("ls -R is real; this simulation does not have it yet") and status 2, not GNU's
  invalid-option text. A flag that is accepted is implemented or moved to that list. Add
  difftest cases for each list. This may overlap the round-2 option fixes.
- **Owner:** shell.

## Low

| # | Finding | Where | Fix | Owner |
|---|---|---|---|---|
| L1 | The number of hint levels is written in four places: `HINT_LEVELS = 3`, the length of `HINT_COSTS`, `"of 3"` and `level === 3`. A fourth level for harder chapters means four edits. | `src/game/session.js:28`, `src/game/progress.js:103`, `src/ui/hints.js:26`, `src/ui/panels.js:38` | Export `HINT_LEVELS` from progress.js (derived from `HINT_COSTS`). The View carries `levels`; the UI reads it. | engine, ui |
| L2 | The session formats terminal prose (`hintText`, `questText`) and strips backticks. The backtick convention lives here and in `inlineCode`. | `src/game/session.js:248-283`, `src/ui/output.js:25` | Move the game commands' text into a small game module (`src/game/commands.js`) with its own tests. Keep the backtick rule beside `inlineCode`, or document both in AUTHORING. | engine |
| L3 | 27 functions mix early returns for a player's mistakes with an if/else chain and a final return. The user's reading treats a wrong command as an expected outcome, handled with one return. The worst is `primary` in `arith.js`: 6 returns and one-line `if`s that hold several statements each. | `src/shell/arith.js:45-53`, `src/shell/commands/copy.js:99`, `procs.js:159`, `nav.js:46`, `text.js:158,172`, and others | Convert the functions as they are touched, as Ring Zero did. Start with `arith.js`. | shell |
| L4 | Hostile nesting raises `RangeError` and the line is silently lost (an unhandled rejection; nothing is printed). `echo $(( ((( ... 1000 deep ... ))) ))` fails in `arith.js`; `mkdir -p` with 8000 components fails in `snapshot` on every later `observe()`, until a reload. | `src/shell/arith.js:48,56`, `src/shell/fs.js:155-160` | Cap the arithmetic depth with bash's own error ("expression recursion level exceeded"). Refuse a path longer than PATH_MAX (4096 bytes) with "File name too long". | shell |
| L5 | `grep --bogus` prints the `Usage:` line twice: the message already holds USAGE, and line 31 appends it again. | `src/shell/commands/grep.js:29-31` | Build the unrecognized-option error without the regex replace. Add the difftest case. | shell |
| L6 | Arithmetic uses JS doubles: `echo $((99999999999999999999999 * 9))` prints `9e+23`, and a 5000-digit literal prints `Infinity`; bash wraps at 64 bits. `kill -9 -1` and `kill -9 0` are rejected, but bash accepts both, and on a real system both end the session. | `src/shell/arith.js:50`, `src/shell/commands/procs.js:149-153` | Evaluate with `BigInt.asIntN(64, ...)`. Accept 0 and negative ids in `kill`, then decide whether they are dangers (H1). | shell |
| L7 | Two guards survive mutation. (a) Removing `if (next)` before `target.use()` lets a fourth `hint` push the count to 4, and completing the task then raises in `payout`; the test "asking after the third hint repeats it at no cost" stops before completing. (b) The empty-list throw in `createSession` is untested. | `src/game/session.js:241,45`, `test/game/session.test.js:196` | (a) After the fourth ask, solve the task and assert 2 XP. (b) Add a test for the empty list. | engine |
| L8 | Hint spending is not saved. Reveal all three hints, reload, and the task pays full XP. | `src/game/session.js:107`, `src/game/save.js` | Decide whether this is acceptable; if not, save hints per task with the chapter. | lead, engine |
| L9 | The UI decides two small rules: the XP total shown on the debrief (it sums the boss and chapter events) and whether the player has "started" (title card). | `src/ui/app.js:159`, `src/ui/app.js:223` | Put the total in the `chapter` event and a `started` flag in the View. | engine, ui |
| L10 | `createSound().play` raises on an unknown sound, but the JSDoc has no `@throws`. | `src/ui/sound.js:24,42` | Add `@throws`. | ui |
| L11 | The player's identity is a literal in several layers. `kernelia` is in `world.js:12` (for `/etc/hostname`) and in the simulator's default host, so `cat /etc/hostname` and `hostname` can drift apart. `/home/hero` is in `map/key.js:12`, `ui/roster.js:18-20` and `intro/steps.js`. | as listed | One `PLAYER` constant (user, host, home) beside the port. `main.js` passes it to `createSimBackend`, and `baseWorld` takes `host` like it takes `user`. | lead |
| L12 | The docs have drifted from the code. DESIGN 2.1 says `rm -rf /` is blocked (see H1). DESIGN 2.4 does not list `map.picks()`, `focus()` and `banner()`, which the UI uses. `map.js` declares its own `Effect` typedef instead of importing the one in `effects.js`. | `docs/DESIGN.md:53,106-117`, `src/map/map.js:24-28` | Update DESIGN. Import the typedef. | lead, art |

## Fix order

1. **H2** (shell): a small, local fix that changes what players see today.
2. **M3** (lead): turn the layer rules on in ESLint before the refactors below, so they are
   guarded.
3. **H1 with M5** (lead decides; engine and shell): both drain game rules out of the
   simulator. Do H1 alongside the round-2 coach move, so `exec.js` and `procs.js` are touched once.
4. **M2 and M4** (lead): document the port's output vocabulary and add `src/backend/tree.js`.
   Then each owner switches their callers (one small commit each).
5. **M1** (engine, then ui): before any termlab work, because it only shows with a backend that
   takes time.
6. **M6** (shell): with difftest cases, possibly folded into the round-2 option fixes.
7. Lows: L5, L7 and L10 are minutes each. L1, L2, L9 and L11 go with the module they touch. L3,
   L4 and L6 go with the next shell pass. L8 and L12 need a lead decision or doc pass.
