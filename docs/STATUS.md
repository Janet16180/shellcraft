# Shellcraft 2: status and handoff

**A fresh session starts here.** Read this file, `docs/APPROVED.md` (chapters the user approved), then `docs/WORKLIST.md` (every task left),
`docs/DESIGN.md` (plan and architecture) and `AUTHORING.md` (code and content rules). Nothing
from earlier conversations is needed.

## What this is

Shellcraft 2 is the redesign of the user's browser game that teaches basic Linux (the original is
`original/shellcraft-v1.html`). Commands run in a simulated bash that matches Ubuntu 24.04; the
map draws the working directory as a room: the original outdoor 8-bit style inside the player's
home, Ring Zero's Pixel Dungeon style outside it. Each chapter is lesson, guided quest, boss,
adventure log. 14 chapters are planned (DESIGN.md section 4).

## State at 2026-10-08 (UI and art for chapter 18: `slice/ui3`)

- Branch `slice/ui3` (worktree `.scratch/wt/ui3`), not merged. The password prompt: the touch keys
  obey it (no history, no Tab), a chapter load or reset ends a waiting prompt (`terminal.abandon()`),
  and a hidden line in the output log reads the prompt to screen readers.
- Terminal keys: Ctrl+R is bash's reverse-i-search (`src/ui/isearch.js`, checked against bash 5.2 in
  `docs/verification/terminal-keys.md`), plus Ctrl+A, Ctrl+E and a Ctrl+R touch key. The keys are
  listed under the map's `?` button (`src/ui/keymap.js`); a new key goes there too.
- Map: `~/crown` is the Throne Room; `/srv/mill`, `bakery`, `stables`, `lighthouse` and `granary`
  have rooms of their own (`src/map/crowndecor.js`, `src/map/servicedecor.js`).

## State at 2026-10-08 (engine for chapter 18, The Crown: `slice/sudo`)

- Branch `slice/sudo` (worktree `.scratch/wt/sudo`), not merged: `sudo` follows the tree's policy
  (`/etc/sudoers`, `/etc/sudoers.d`; the base world now has Ubuntu's files and a root-only
  `/etc/shadow`), runs one command as root or `-u USER`, and supports `-l`, `-k`, `-K`, `-v`, `-n`;
  `-i`/`-s` end with a note. `tee` exists. `password('...')` (spec.js) sets the player's password;
  `accounts(player, { sudo: [...] })` and `realm(player, { sudo: true })` make the player a sudoer
  (AUTHORING "sudo and the player's password").
- The port can ask the page for one hidden line mid-command: a RunResult with `input: {prompt,
  hidden}`, answered with `Backend.answer(text|null)` (`src/backend/port.js`). The simulator replays
  the line from a saved state with the answers so far. The session has `answer()`; the terminal hides
  what is typed (labelled "password", no history). Records carry `user` (and `asUser`/`via` for sudo).
- Difftest: the image installs sudo; world `sudo` (hero in group sudo with a NOPASSWD rule) and
  `cases/16-sudo.json`. The password prompt itself is checked by hand in a container
  (`docs/verification/sudo.md`), since the case input cannot type at sudo's terminal.

## State at 2026-10-08 (engine for chapter 20, Background Tasks: `slice/jobs`)

- Branch `slice/jobs` (worktree `.scratch/wt/jobs`), not merged: job control as interactive bash
  5.2 does it. `sleep` (s/m/h/d, sums, `infinity`), `CMD &` (`[1] PID`, `$!`), `jobs` (`-l -p -r
  -s -n`, job specs `%N %% %+ %- %NAME %?TEXT`), `fg`, `bg`, `kill %N` (any signal; TERM/HUP wake a
  stopped job), `wait` (all, `%N`, PID), `disown` (`-a -r -h`), Ctrl+C and Ctrl+Z. Bash's notices
  (`[1]+  Done                    sleep 30`, `Stopped`, `Terminated`, `(wd: ~)`) come when bash
  prints them: after a program on the line and before the next prompt. The job table is
  `src/shell/jobs.js`; the commands `src/shell/commands/jobs.js`.
- Time: the page's clock is the real one (`sleep 30 &` is Done 30 s later; `sleep 5` holds the
  prompt 5 s). Tests use a clock that stands still until moved.
- Port: a RunResult may carry `running: {seconds}`; `Backend.poll()` goes on once the command's
  time is up, `Backend.signal('INT'|'TSTP')` sends Ctrl+C or Ctrl+Z (`src/backend/port.js`). The
  session has `poll()` and `signal()`, and the view `running`. The page hides the prompt while a
  command runs and sends the keys (`src/ui/running.js`, one hook in terminal.js); an empty line now
  reaches the shell, so Enter shows a Done.
- Records: `background: true, job: N` on a job's commands; `signal: 'INT'|'TSTP'` on the command a
  key ended or stopped. Observation `jobs: [{id, pid, cmd, state, mark}]`. Checks: `ctx.jobs`,
  `ctx.job(n)`, `ctx.ended(n)`, `ctx.pressed(key, name?)` (AUTHORING section 2).
- Harness: `backend.tick(seconds)`; `type(backend, line, { keys: ['ctrl-z'] })` or `[30, 'ctrl-c']`;
  solve lines may end with `\u0003`/`\u001a` (Ctrl+C/Ctrl+Z) (AUTHORING section 4).
- Difftest: cases may `mask` PIDs; `cases/17-jobs.json`. Ctrl+C and Ctrl+Z were checked by hand in a
  container (`docs/verification/jobs.md`, with what is kept different).
- For the frontend: a `C-z` touch key (`data-k="C-z"`) would work at once (`src/ui/running.js`), and
  the key list under the map's `?` could name Ctrl+Z.

## State at 2026-10-08 (UI and art for chapter 20: `slice/ui4`)

- Branch `slice/ui4` (worktree `.scratch/wt/ui4`), not merged. While a command runs, three dots
  pulse where the prompt was, the task strip adds "Running… Ctrl+C stops it, Ctrl+Z pauses it", and
  the input's label says it to screen readers (`src/ui/running.js`). Ctrl+Z touch key; Ctrl+Z at a
  prompt does nothing, as in bash. bash's job notices (`[1] 4242`, `Done`) show in teal, not error red.
- Map: the player's jobs are workers at anvils in a row at the bottom-left of every room (at most 3,
  then "+N"): hammering while running, asleep with a "z" while stopped, a burst when the process
  ends (`src/map/jobs.js`, `jobart.js`). The room description lists them; the map key explains them.
- `~/workshop` (chapter 20) is the biome `smithy`, "Busy Workshop": hearth with working bellows,
  anvil with a glowing bar, quench barrel, a bench with an hourglass (`src/map/smithydecor.js`).

## State at 2026-10-08, morning (act III: chapters 15 and 16)

- `slice/users` and `slice/explainer` are merged into `slice/act3`. Chapters name an explainer by
  id (`explainer: 'perms'`); `withExplainers` in src/main.js swaps in the explainer.
- Written on `slice/act3`, not yet played by the user: 15 The Guild (`guild`: users, groups,
  `id USER`, only one set of letters counts; boss: the one scroll oren may read) and 16 The Shared
  Hall (`hall`: r/w/x on directories, removing needs w on the directory, `chgrp`; boss: a faction's
  room, 770). The people are in `src/game/people.js` (`realm(player, { factions })`).
- Merged into `slice/act3`: `slice/links` (symlinks, hard links, inodes, `ln`, `readlink`,
  `ctx.inode`, `ctx.linkTarget`) and `slice/art3` (Guild wing, other homes with their owners,
  `~/guild`, `~/hall` rooms, dark door for x-without-r, portal sprite). Chapter 17 Portals
  (`portals`) is written. 2249 tests, difftest 0 failures.
- Merged: `slice/sudo` (sudo with a hidden password prompt, `password()` op, `tee`, chown as root,
  records carry `user`) and the links art. Chapter 18 The Crown (`crown`, password `dragon`) is
  written. The guild hall `/srv/guild` now comes from `realm()`. 2343 tests, difftest 0 failures.
- Merged `slice/ui3` (sudo prompt fixes, Ctrl+R/A/E, keys under the map's ?, throne room and
  /srv service rooms). Chapter 19 The Scribe's Memory (`memory`) is written. 2412 tests.
- Running agents: backend `slice/jobs` (job control) for chapter 20; frontend `slice/ui3` (art for
  `~/portals`, `~/maze`, `~/memory`). Chapter 21 (tar) needs a `tar` engine after jobs.

## State at 2026-10-08, evening (act III started)

- Chapters 1 to 14 and all tester fixes are merged into main (6cae0b8). The user approved the
  act III plan (chapters 15 to 21, `docs/ACT3.md`: the reviewed order is at the end of its first part,
  then the detailed designs of chapters 15 and 16).
- Branch `slice/act3` (from main) is the act III integration branch.
- Engine branch `slice/users` (worktree `.scratch/wt/users`): users and groups read from
  /etc/passwd and /etc/group, a `login` spec op, `id USER`, `groups USER`, `chown`, `chgrp`,
  directory r/w/x checks. See the agent's last commits for what is finished.
- UI branch `slice/explainer` (worktree `.scratch/wt/explainer`): step-by-step concept explainers
  (Back/Next/Skip) a chapter declares with `explainer`; two of them: "Which three letters are
  yours?" (ch15) and "Names are pointers" (ch17, links). Open in dev: `?dev&explainer=perms` / `=links`.
- Both branches are committed and green (users: 1967 tests, difftest 0 failed; explainer: 1984 tests).
  Left on `slice/users`: Observation.groups JSDoc in port.js, CommandRecord docs for chown/chgrp,
  maybe a difftest for `ls -la` on a directory without x. Left on `slice/explainer`: retake
  screenshots (1400x900, 360x740, reduced motion), check phone scroll-in animation, Back/Next/Esc
  and focus in a browser, verify the explainer commands in real bash (`docs/verification/explainers.md`).
- Chapter setup API for people: `...accounts(player, { users: [...], groups: [...] }), login()`
  (AUTHORING section 2).

## State at 2026-10-08 (act II: chapters 10 to 14)

- On `slice/ch5-9`, not merged: 10 The Descent (`/`, `/etc`, `/var/log`, `$PATH`, `which`, `type`),
  11 The Sealed Gate (`ls -l` modes, `id`, `chmod +x`, `chmod a-w`, `chmod 600`, `/root`), 12 Well of Echoes
  (variables, quotes, `$?`, `2>`, `/dev/null`, `&&`, `||`), 13 The Shadow Daemon (`ps`, `ps aux`,
  `pgrep`, `kill`, `kill -9`; no job control) and 14 Forge Your Own Spell (scripts, `$1`, `for`).
  Design and the teaching review: session file `ch10-14-design.md`.
- Engine (`slice/shell`, merged): scripts by name on PATH, positional parameters, child shells,
  `source`, `~/.bashrc`, `for`, `if`, `test`/`[`. Spec: `proc({pid})` fixes a PID (ch13 hints).
  Checks: `ctx.line`, the typed line, for assignments that leave no record.
- Art (`slice/art`, merged): areas well, den, forge, ore, mirrors, the `/usr/local` guild wing,
  processes drawn as creatures labelled `PID name` (`src/map/creatures.js`).
- The session playthrough plays all 14 chapters (3 seeds).
- Engine (`slice/shell2`, merged into `slice/ch5-9`): playtest gaps closed (WORKLIST C5): `<` and `2>&1` in
  `CommandRecord.redirects`, brace expansion, `!` history expansion, more long options, `printf`,
  `type -a/-t`, `uniq IN OUT`, `${v#pat}`/`%`, find and less error wording.
- Two tester agents tried other correct lines and edge cases in every chapter (38 findings). All are
  fixed and kept as rows in `test/game/chapters/alternatives.test.js`. New check helpers:
  `ctx.shown`, `ctx.streams` (follows `2>&1`/`&>`), `ctx.onScreen`; `flag` knows long options;
  `hasPath` counts `<` and a piped cat. 1930 tests, difftest 0 failures.

## State at 2026-10-07 (chapters 5 to 9, dev mode)

- The user approved chapters 1 to 6 (`docs/APPROVED.md`). Their notes on 5 and 6: plain words for
  actions, game things named in backticks (AUTHORING rule 10); sounds for discoveries (`ls -a`
  showing hidden entries, `ls` finding a boss room's hidden things), creating and removing
  (`src/ui/turnsounds.js`).

- Branch `slice/ch5-9` (from main 035230a), not merged: chapters 5 The Cursed Junkyard (`rm`,
  `rmdir`, `rm -r`), 6 Hall of Mirrors (`*`, `?`, `[ ]`, quotes; new area `~/mirrors` made by its
  setup), 7 The Great Library (`head`, `tail`, `-n`, `wc -l`), 8 The Tower of Echoes (`grep`, `-i`,
  `-r`, `find -name`) and 9 The Market of Pipes (`sort`, `|`, `uniq`, `uniq -c`, `>>`) are playable,
  so all of act I is.
- The user delegated the design of these chapters ("you don't need my approval"; they play and give
  feedback). Design notes, the principles (fading clues, one idea per task, look before rm, bosses
  that prove the skill) and the teaching review's changes: session file `ch5-9-design.md`; the
  bosses' briefings are in each module.
- Teaching review changes: bosses must prove the skill (ch7 boss needs `tail -n 1` on the tome, ch8
  boss `grep` on the found `.scale` file, ch9 boss one `sort | uniq >` line); the lessons say that
  bash expands patterns before the command runs and that `uniq` joins only neighbouring lines.
- less/more and `rm -i` are lesson and field only: the simulator prints the file / answers yes.
- Each chapter is fact-checked against local bash 5.2.21 and coreutils 9.4 (`docs/verification/`,
  log R8), not the difftest Docker image. Simulator gaps found: `tee` and `find -mtime` missing,
  `--lines` not simulated, `<` input not recorded on the command, `grep -r WORD FILE` prefixes the
  file name (real grep does not, for one file), find's "paths must precede expression" wording.
- Dev mode (merged to main): http://localhost:8765/?dev keeps its own save, opens every written
  chapter, and adds `dev skip`, `dev boss`, `dev solve` (AUTHORING section 4).
- The session playthrough plays all nine chapters in a row (3 seeds); a browser smoke run played
  chapters 5-9 and their bosses in Chrome through dev mode; `node test/ui/layouts.js` reports no
  problems. 1452 tests pass, lint is clean.

## State at 2026-10-07 (chapters 3 and 4)

- Branch `slice/ch3-4` (from main a97e409), merged into main: chapters 3 Things Unseen (`ls -a`,
  `ls -l`, joined options) and 4 Build a Camp (`mkdir`, `touch`, `echo >`, `cp`, `mv`) are
  playable. The user approved the task lists and both bosses: ch3 "The Hidden Tunnel" (`ls -a
  ~/forest/cave`, `cd` into `.tunnel_XXX`, `cat treasure.txt` there); ch4 "The Fire Pit" (find
  `flint_XXX.txt` by the river, `mkdir ~/camp/firepit`, `mv` the flint in, `echo lit >` fire.txt;
  the flint stays off the map until listed).
- Chapter 3 tasks (the user's rework): the secret map names only `~/library`, where the base world
  hides a directory `.secret_passage`; the player finds it with `ls -la`, `cd`s in, then reads the
  Scroll of Ages' size with `ls -l`. The boss's hidden tunnel repeats this without the map's help.
- Guidance rule (AUTHORING content rule 9, the user): a command new in the chapter gets a clue in
  its first goal (`ls` with `-a`; `mkdir` makes directories); a complex line is shown in full the
  first time (`echo wood > ~/camp/supplies.txt`, the `cp` line); later goals name only the target.
- `src/game/effects.js` exports `revealedDirs(ctx)` (the directories whose hidden entries a line
  listed), shared by the map's reveal effect and chapter 3's checks.
- Fact-checked against real bash 5.2.21 and coreutils 9.4: `docs/verification/unseen.md` and
  `camp.md`. Not yet done: a blind playtest by a second reader (WORKLIST D) and the user's play.
- 1131 tests pass, lint is clean; `node test/ui/layouts.js OUT` (now also checks both new boss
  rooms) reports no problems.

## State at 2026-10-07

- Branch `slice/layout` (from main 240dd93) was merged into main with `--no-ff` at 585b794 after
  the user approved; 1050 tests pass and lint is clean on main. It holds the user's playtest fixes: the layout switch (A1, A2, G1, G2), the new bosses (A3) and a
  "Restart chapter" button. 1033 tests pass, lint is clean, `node test/ui/layouts.js OUT` and the
  full `test/ui/shots.js` run report no problems.
  - Layout: stacked (map and quest side by side, terminal full width below) is the default; the
    HUD button "Terminal: below / right" switches to the old layout. The choice is the save's
    `layout` field (`session.setLayout`); old saves read as stacked. Room buttons are one
    sideways-scrolling row; the map is no longer sticky.
  - Bosses (wording approved by the user, option b): ch1 "A New Note" (`ls`, then `cat` the
    `note_XXX` file); ch2 "The Lost Lantern" (`ls ~/forest/river`, `cd` into `lantern_XXX`, then
    home with one command).
  - Restart chapter: a HUD button (click twice to confirm) that rebuilds the chapter's world and
    resets its tasks, hints and hearts; XP and other chapters are kept. A task pays XP only once (the save's `paid`
    record), so restarting does not farm XP.
  - Collapsible HUD: a "Menu / Hide menu" toggle. Collapsed, the HUD is one slim bar (logo,
    chapter name, XP, hearts; no logo at 480px or less). It starts collapsed on small windows
    (`SMALL_WINDOW` in `src/ui/hud.js`: 760px wide or less, or under 800px tall, so 1366x768
    laptops get it) and follows the
    window until the player toggles it; that choice lasts the visit and is not saved.
  - More room for the map: the path and room name moved from their own line above the map into
    the start of the room-button row (a two-line block), and the "In this room" label and the
    key link became a `?` button at the row's end. Map height at 1366x768: 223px before, 322px
    after; at 1280x720 195px to 293px.
  - Chapter 1 boss: the new note stays off the map and the room buttons until the player runs
    `ls` in the home (or `ls ~` from elsewhere); then it sparkles in. A boss may declare
    `hidden: secret => [paths]`; the View carries `concealed` and the UI drops those paths from
    the observation it draws (`src/ui/conceal.js`). The shell and the checks see the real world.

## State at the end of 2026-10-06

- `main` is clean. Its last code change is the merge of `slice/shell` at `8b30c81`; later
  commits are documentation only. 1031 tests pass, lint is clean, difftest 0 failed (last run by
  shell: 60 identical, 18 intended differences). Every teammate branch is merged (0 ahead).
- Done: the vertical slice (animated intro, chapters 1 and 2, the overworld and dungeon map, the
  simulated bash behind the backend port, hints, XP, ranks, hearts, coach notes, save with
  chapter progress, sound) and three rounds of review fixes (fact-check, teaching review, code
  review `docs/reviews/code-slice.md`, all items closed).
- The user played chapter 1 locally and gave feedback (below). Chapters 3 to 14 are not written.

## How to run

```
cd ~/learning/shellcraft
npm test            # all tests
npm run lint        # ESLint, also enforces the layer rules
npm run serve       # play at http://localhost:8765 (Ctrl+C stops it)
                    # dev mode: http://localhost:8765/?dev (own save, every chapter open,
                    # terminal commands dev skip / dev boss / dev solve)
npm run difftest    # simulator vs real bash in Docker (ubuntu:24.04); needs Docker
node test/ui/shots.js OUT_DIR          # screenshot run of the page (Chrome via playwright-core)
node test/ui/layouts.js OUT_DIR        # both layouts at five window sizes, plus the restart button
```

## The user's decisions (all still in force)

1. Runtime: reuse the simulated shell, behind a backend port, orthogonal so a real bash through
   `~/learning/termlab` could replace it later. Ask the user before changing termlab.
2. Chapters: 14 (Hall of Mirrors, The Descent, Well of Echoes and Forge Your Own Spell added). Extra
   chapters (Archive Vault, Scribe's Desk, Signposts) wait for the user's yes or no.
3. Style: overworld = the player's home (`~`), dungeon = everything outside it.
4. Build order: vertical slice first (done), then chapters in batches the user plays.
5. **No artifacts.** The game is played locally (`npm run serve`). Do not publish or republish
   anything to claude.ai. The original Shellcraft artifact
   (https://claude.ai/artifact/M4J2FKo8Q5pDtJQ9Y3Y2dz) and the dark preview
   (https://claude.ai/artifact/Nqt9UZqv6MPiaci46Q3vi3) stay untouched; ask before deleting either.
6. **Layout:** a new wide-screen layout (map and quest panel side by side on top, terminal full
   width below) AND today's layout (map and quest left, terminal right) kept as a switchable
   option, remembered in the save. Room buttons in one sideways-scrolling row; no sticky map.
   Why: at 1400x1100 the sticky map area was 634px tall, the quest panel scrolled under it with
   its frame peeking out, and `/usr/bin`'s 52 room buttons took 221px.
7. **Bosses:** chapter 1's The Forged Letters and chapter 2's The Trapdoor are removed. The user
   found the first confusing because of its wording (a riddle and forged signatures), and the
   second a chore with an arbitrary rule ("the jump only counts from the dungeon") that `find`, a
   chapter 8 tool, made trivial. Rule for every boss (AUTHORING.md content rule 7,
   `~/learning/GAME_METHODOLOGY.md` principle 8): either no boss, or the chapter's own tasks again
   with one small twist, in plain words, no riddles, no arbitrary rules, not made trivial by a
   later tool. **Show the user the options and get their approval of the wording before building
   any boss.** Done 2026-10-07: the user chose (b) for both; see the state above.

## First steps of the next session

0. Act III: review and merge `slice/users` and `slice/explainer` into `slice/act3` (tests, lint,
   difftest; finish anything their last reports list as left). Then write chapter 15 (guild) and
   16 (hall) from `docs/ACT3.md`, tests first; then the engine for links (symlinks, inodes, `ln`,
   `readlink`) and chapter 17. Ask the user before merging into main.

1. The user plays chapters 5 to 9 on `slice/ch5-9` (`npm run serve`, `?dev` to jump); fix their
   notes, then merge. Earlier: the user plays chapters 3 and 4; fix their notes, then
   ask before merging. (`slice/layout` is merged: A1 to A3, G1, G2, G4 done.)
2. G3: keyboard and screen reader pass of both layouts.
3. engine: B1, hearts from `selectsProcess` (cases listed in WORKLIST B1).
4. factcheck: verify `src/backend/process.js` (commit 6bb4c32) against Ubuntu.
5. The user plays again; collect their feedback.
6. Chapters 10 to 14 (act II), with the guidance rule (WORKLIST D); fill the simulator gaps above.

## The team

The work is done by named teammates, coordinated by the lead (the main session), which merges and
verifies. **A fresh session has no teammates: relaunch them** with the Agent tool as named
teammates (not one-shot subagents), one per role, each with this file, WORKLIST, DESIGN section 8
(ownership) and AUTHORING as their brief:

| Name | Owns | Worktree, branch |
|---|---|---|
| engine | `src/game/` except chapters and world | `.scratch/wt/engine`, `slice/engine` |
| shell | `src/shell/`, simulator parts of `src/backend/`, `difftest/` | `.scratch/wt/shell`, `slice/shell` |
| author | `src/game/chapters/`, `src/game/world.js`, `docs/verification/` | `.scratch/wt/author`, `slice/author` |
| ui | `src/ui/`, `src/intro/`, `styles/`, `index.html`, `test/ui/` | `.scratch/wt/ui`, `slice/ui` |
| art | `src/map/` | `.scratch/wt/art`, `slice/art` |
| factcheck | read-only checks against real Ubuntu, reports | `.scratch/wt/factcheck`, `review/factcheck` |

The lead owns `src/backend/` contracts (`port.js`, `spec.js`, `tree.js`, `player.js`,
`access.js`), `scripts/`, `eslint.config.js`, `package.json` and the docs. A helper agent from
the user can take tasks marked **helper** in WORKLIST; agree which task first.

Every worktree exists and is in step with `main`; each teammate merges `main` before starting.
`node_modules` is a symlink in each worktree (listed in `.git/info/exclude`).

How the team works (lessons from 2026-10-06):
- Messages reach a busy teammate only when its run ends. Keep tasks small, ask for a note with
  the commit hash after every commit, and check the branch instead of assuming a message was read.
- The lead trial-merges each branch into main with `--no-ff`, runs `npm test` and `npm run lint`,
  and plays the change in Chrome before saying it is done.
- Changes that must land together (like a guard and the code that respects it) go in the same
  merge, never one without the other.

## Housekeeping

- `.scratch/wt/play`: a detached snapshot worktree used to serve the game while the user played.
  Not needed now; ask the user before removing it.
- `slice/engine-host`: a branch whose one change is already on main (cherry-picked as 58309bb).
  Ask the user before deleting it.
- `.scratch/wt/qa`, `review`, `teacher`: reviewer worktrees, kept for the next reviews.

## Rules

Feature branches, small commits, plain messages with no trailers, never push. Tests first. Ask the
user before deleting branches or worktrees, before anything outward-facing, and before any change
to `~/learning/termlab`. No emojis. Keep the user's starship prompt (it shows their email) out of
any terminal screenshot.

## History and lessons

- Reviews: `docs/reviews/code-slice.md`, `docs/reviews/teaching-slice.md`; fact-check logs in
  `docs/verification/`.
- 2026-10-06: a module-script artifact rendered dark (the host's opaque-origin frame fails module
  CORS); `npm run bundle` and `node test/ui/shots.js OUT --published` exist for that case but are
  unused while the game stays local.
- Names typed by the player must never index plain objects (`constructor`, `__proto__`): the
  simulator uses null-prototype tables, and the game reads trees with `tree.js` `childOf`.
