# Shellcraft 2: status and handoff

**A fresh session starts here.** Read this file, then `docs/WORKLIST.md` (every task left),
`docs/DESIGN.md` (plan and architecture) and `AUTHORING.md` (code and content rules). Nothing
from earlier conversations is needed.

## What this is

Shellcraft 2 is the redesign of the user's browser game that teaches basic Linux (the original is
`original/shellcraft-v1.html`). Commands run in a simulated bash that matches Ubuntu 24.04; the
map draws the working directory as a room: the original outdoor 8-bit style inside the player's
home, Ring Zero's Pixel Dungeon style outside it. Each chapter is lesson, guided quest, boss,
adventure log. 14 chapters are planned (DESIGN.md section 4).

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

1. The user plays chapters 3 and 4 on `slice/ch3-4` (`npm run serve`); fix their notes, then
   ask before merging. (`slice/layout` is merged: A1 to A3, G1, G2, G4 done.)
2. G3: keyboard and screen reader pass of both layouts.
3. engine: B1, hearts from `selectsProcess` (cases listed in WORKLIST B1).
4. factcheck: verify `src/backend/process.js` (commit 6bb4c32) against Ubuntu.
5. The user plays again; collect their feedback.
6. Chapter 5 (The Cursed Junkyard), with the guidance rule above (WORKLIST D).

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
