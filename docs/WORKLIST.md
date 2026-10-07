# Shellcraft 2: the work left

Written 2026-10-06. This is every task left: the user's feedback, the engine, the simulator, the
chapters, and the graphics and page work (section G). Every task says what to do, where, how to
know it is done, and who it suits:
- **helper**: a good fit for an extra agent that is strong on the engine, the simulator or checking
  levels and not on web design.
- **ui** (the page, layout, panels, intro) and **art** (the map, sprites, animation): web design
  and graphics.
- **engine**, **shell**, **author**, **factcheck**: the other teammates.

Before taking a task, tell the user (or the lead) which one, so nobody else starts it.

## How to work in this repository

- Read first: `docs/DESIGN.md` (the plan and the architecture), `AUTHORING.md` (code and content
  rules, the chapter contract), `docs/STATUS.md` (where things stand), and the user's rules in
  `~/.claude/CLAUDE.md` (simple code, single responsibility, layers depend downward only, DRY,
  test-driven, design by contract, and JSDoc on every exported function).
- Work on your own branch, `slice/<your-name>`, in a worktree under `.scratch/wt/<your-name>`.
  Small commits with short plain messages, no `Co-Authored-By` or other trailers. Never push.
- Tests first: a failing test, then the code. `npm test` and `npm run lint` must pass before every
  commit. Simulator changes also need `npm run difftest` (Docker; it compares the simulator with
  real bash on Ubuntu 24.04 and must report 0 failed).
- Stay in your files. Layers: `src/ui`, `src/intro`, `src/map`, `styles`, `index.html` (web
  design, not for the helper) -> `src/game` (rules, chapters) -> `src/backend` (shared contracts)
  -> `src/shell` (the simulated bash). ESLint enforces the direction.
- To try the game: `npm run serve`, then http://localhost:8765. To check the published build:
  `node test/ui/shots.js OUT_DIR --published`.
- Done means: tests and lint pass, the change is played once in the real game, and you report the
  commit hash with a short note of what to review.

## A. Next up: the user's playtest feedback

| # | Task | Where | Who |
|---|---|---|---|
| A1 | **Done** (merged from `slice/layout`). New layout: map and quest panel side by side on top, terminal full width below. Keep today's layout (map and quest left, terminal right) as an option the player can switch to; remember the choice. Room buttons become one row that scrolls sideways; the map stops being sticky. Check 1400x900, 1280x720, 1536x864, 1024x768 and 360. | `styles/`, `src/ui/`, `index.html` | ui (web design) |
| A2 | **Done** (merged from `slice/layout`). Remember the layout choice in the save, like `sound` and `introSeen`: a `layout` field, validated on load, a `setLayout` session call. Tests first, old saves read as the default layout. | `src/game/save.js`, `src/game/session.js` | **helper** or engine; agree the field name with ui |
| A3 | **Done** (merged from `slice/layout`): the user chose (b), A New Note and The Lost Lantern. Chapter 1 and 2 bosses: the user removed The Forged Letters and The Trapdoor. Show the user two options per chapter and let them choose: (a) no boss; (b) a short final check that repeats the chapter's tasks with one small twist (plain words, no riddles, no arbitrary rules; see AUTHORING.md content rule 7). Build only after the user approves the wording. | `src/game/chapters/awakening.js`, `forest.js` | author; the lead brings the options |
| A4 | **Not needed** (no chapter has "no boss"). If the user picks "no boss" for any chapter: make `boss` optional in the chapter contract. A chapter without one clears when its last task is done; the save's progress, hints, the View and the debrief XP all handle it. Tests first. | `src/game/session.js`, `progress.js`, `AUTHORING.md` section 2 | **helper** or engine, only after A3's decision |

## B. Engine and rules

| # | Task | Where | Who |
|---|---|---|---|
| B1 | Hearts from `selectsProcess`: dangers.js asks `src/backend/process.js` whether a kill, pkill or killall line hits the player's shell. A heart for `kill -HUP 0`, `kill -9 -$$`, `pkill -KILL -u hero`, `pkill -9 -t pts/0`, `killall -9 -u hero`; none for `kill -9 -1`, `pkill -9 -u root`, `pkill -9 -u hero cron`, `pkill -9 -x ba`. Delete the game's own `processName`; the fake backend uses the same selector. | `src/game/dangers.js`, `test/helpers/fake-backend.js` | engine (ready to start) |
| B2 | Optional coach note for misspelled names (`cd forrest` -> "Did you mean forest?"), only for one close match in the same directory. Tests first, including names that must not trigger it. | `src/game/coach.js` | **helper** (low priority) |

## C. Simulator work the later chapters need

| # | Task | For | Where | Who |
|---|---|---|---|---|
| C1 | `for NAME in WORDS; do ...; done` and `if ...; then ...; else ...; fi` (with `test` / `[`), in scripts and on the command line. Today they print "command not found". | ch 14 (first script) | `src/shell/lexer.js`, `parse.js`, `exec.js` | **helper** or shell |
| C2 | `source FILE` / `. FILE`, and read `~/.bashrc` when the shell starts, so `ll` and `la` come from the file, not from built-in aliases. | ch 12 (Well of Echoes) | `src/shell/` | **helper** or shell |
| C3 | Background jobs: `&`, `jobs`, `fg`, `bg`, Ctrl+Z, and a simulated `sleep` so there is something to put in the background. | ch 13 (Shadow Daemon) | `src/shell/`, maybe `src/backend/port.js` | shell (touches the port; needs the lead) |
| C4 | `--version` for `ps`, `top`, `pkill`, `killall`, `less`, `which`, as Ubuntu 24.04 prints them. | ch 7, 10, 13 | `src/shell/versions.js` | **helper** |

Every simulator change needs difftest cases that compare it with real bash, plus a line in the
case file for any intended difference.

## D. Chapters 3 to 14

Each chapter is written by an author and checked by a fact-checker who did not write it. The plan
(DESIGN.md section 4): 3 Things Unseen, 4 Build a Camp, 5 The Cursed Junkyard, 6 Hall of Mirrors,
7 The Great Library, 8 The Tower of Echoes, 9 The Market of Pipes, 10 The Descent, 11 The Sealed
Gate, 12 Well of Echoes, 13 The Shadow Daemon, 14 Forge Your Own Spell. Order: 3-5, then 6-9,
then 10-14 (12, 13 and 14 wait for C2, C3 and C1). The user plays each batch before the next.

**Checking a level** suits the **helper** well. For each new chapter:

1. **Blind playtest** before reading the code: play it from a fresh save at
   http://localhost:8765 using only the lesson, the tasks and the hints. Note every place you were
   unsure what to type, every message that surprised you, and any way to finish a task without
   doing what it teaches.
2. **Fact-check:** every sentence in the lesson, tasks, hints, boss briefing, recap, "why" and field
   notes against the man pages and a real run in the difftest Docker image (Ubuntu 24.04, bash
   5.2, `LC_ALL=C.UTF-8`). Log claim, evidence and verdict in `docs/verification/<id>.md`.
3. **Boss check:** is it the chapter's tasks with one small twist, in plain words, with no riddle
   or arbitrary rule, and not made trivial by a later chapter's tool?
4. Report findings to the author; do not edit the chapter yourself.

## E. Delivery

The user plays the game locally (`npm run serve`, http://localhost:8765). **Do not publish to a
claude.ai artifact** (the user's decision, 2026-10-06): no new artifact, no republish of the
preview, no change to the original Shellcraft artifact. `npm run bundle` stays available to
build a single-file `dist/index.html`, but nothing is published from it.

## F. Waiting on the user

- Whether to add the extra chapters: Archive Vault (`tar`, `gzip`, `du`, `df`), Scribe's Desk
  (`nano` basics), Signposts (`ln -s`).

## G. Graphics, the map and the page

The map already draws, for chapters 3 to 14: your cottage, the forest, river and cave, the camp,
the junkyard, the library, the tower, the market and the gate (outdoor style, inside your home),
every dungeon room (`/`, `/etc`, `/var/log`, `/tmp`, `/root`, `/usr/bin`, `/dev`, `/home`), the
Shadow Daemon (with its hit and defeat animations), the gate opening, padlocked doors, chained
items, runnable potions, hidden-file twinkles, and the scroll, book, gem, key, campfire and void
sprites. What is missing:

**Page and layout (ui)**

| # | Task | Done when |
|---|---|---|
| G1 | **Done** (merged from `slice/layout`). The user's new layout and the layout switch (task A1): map and quest side by side on top, terminal full width below; today's layout kept as an option; a clearly labelled control in the HUD to switch; the choice saved (A2). | Both layouts pass the screenshot run at 1400x900, 1280x720, 1536x864, 1024x768 and 360, nothing overlaps, the quest panel is always on screen, and the input line is always visible. |
| G2 | **Done** (merged from `slice/layout`). Room buttons ("In this room") in one row that scrolls sideways, in both layouts, so a room like `/usr/bin` (52 entries) never takes more than one row. | `/usr/bin` at 1400 and 360: the row is one line, every button reachable by keyboard and by scrolling. |
| G3 | Browser QA pass of both layouts: keyboard only (Tab order, focus visible, Escape on cards, the terminal's Tab completion vs page Tab), screen reader text for the map, `prefers-reduced-motion`, zoom 200%, a fresh save and a resumed one. The worktree `.scratch/wt/qa` is ready. | A report in `docs/reviews/qa-slice.md` with each finding and its screenshot; findings fixed by their owners. |
| G4 | **Done**: the boss card shows the new bosses unchanged. The boss card and the quest panel follow whatever the user picks in A3 (no boss, or a short final check). With no boss, the chapter goes straight from its last task to the adventure log. | Played through both chapters 1 and 2 at 1400 and 360. |

**Map areas for the new chapters (art; author adds the matching directories to the world)**

| # | Task | For |
|---|---|---|
| G5 | Hall of Mirrors: an outdoor-style area for `~/mirrors` (glass walls, reflections, a palette of its own) in `src/map/biomes.js` and `overworld.js`. | ch 6 |
| G6 | Well of Echoes: an area for `~/well` (a stone well, water that ripples when a command prints). | ch 12 |
| G7 | The Forge: an area for `~/forge` (anvil, fire, sparks), where scripts the player writes show as potions that glow once `chmod +x` makes them runnable. | ch 14 |
| G8 | Each new area gets a map key entry if it adds a picture the key does not explain yet, and a check in the map tests that every area is reachable and labelled. | ch 6, 12, 14 |

**Effects that make later chapters readable (engine emits the effect, art animates it)**

| # | Task | For | Priority |
|---|---|---|---|
| G9 | Wildcards: when a line expands a glob, the matching items flash on the map before the command runs, so the player sees what `*.txt` meant (and what `rm *` would hit). | ch 6 | high: it is the chapter's lesson |
| G10 | Pipes: when a line has a pipeline, a short flow animation between the stages (a stream of particles from the first command to the last). | ch 9 | nice to have |
| G11 | Writing to files: `>` makes the target item flash, `>>` makes it grow a little, and output sent to `/dev/null` falls into the void sprite. | ch 4, 9, 12 | nice to have |
| G12 | Jobs: a stopped job (Ctrl+Z) shows as a sleeping creature, a background job (`&`) as one that walks off; both visible on the map until `fg` or `kill`. | ch 13 | after C3 |
| G13 | New sprites the chapters ask for (mirror shard, bucket, hammer, tent for directories the player makes in the camp). Art adds each to `src/map/sprites.js` and to `itemKind` with a test; names stay visible as labels. | ch 4, 6, 12, 14 | as chapters need them |

Graphics rules (DESIGN.md section 7): the outdoor style inside your home and Ring Zero's dungeon
style outside it; every picture shows the real name of what it stands for; labels in IBM Plex
Mono; check every new glyph and label for Z/2, 0/O and 1/l/I confusion; everything respects
reduced motion.

## Known risks, accepted for now

- `grep -E` patterns like `(a*)*b` can backtrack for a very long time in the JavaScript regex
  engine and freeze the page. Only the player's own tab is affected; a real fix needs a
  non-backtracking matcher.
