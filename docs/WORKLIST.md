# Shellcraft 2: the work left

Written 2026-10-06, at main `6a6c115`. Every task says what to do, where, how to know it is done,
and who it suits. Tasks marked **helper** are a good fit for an extra agent that is strong on the
engine, the simulator or checking levels and not on web design. Before taking one, tell the user
(or the lead) which task you take, so nobody else starts it.

## How to work in this repository

- Read first: `docs/DESIGN.md` (the plan and the architecture), `AUTHORING.md` (code and content
  rules, the chapter contract), `docs/STATUS.md` (where things stand), and the user's rules in
  `~/.claude/CLAUDE.md` (simple code, single responsibility, layers depend downward only, DRY,
  test-driven, design by contract, NumPy-style thinking applied to JS: JSDoc on every export).
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
| A1 | New layout: map and quest panel side by side on top, terminal full width below. Keep today's layout (map and quest left, terminal right) as an option the player can switch to; remember the choice. Room buttons become one row that scrolls sideways; the map stops being sticky. Check 1400x900, 1280x720, 1536x864, 1024x768 and 360. | `styles/`, `src/ui/`, `index.html` | ui (web design) |
| A2 | Remember the layout choice in the save, like `sound` and `introSeen`: a `layout` field, validated on load, a `setLayout` session call. Tests first, old saves read as the default layout. | `src/game/save.js`, `src/game/session.js` | **helper** or engine; agree the field name with ui |
| A3 | Chapter 1 and 2 bosses: the user removed The Forged Letters and The Trapdoor. Show the user two options per chapter and let them choose: (a) no boss; (b) a short final check that repeats the chapter's tasks with one small twist (plain words, no riddles, no arbitrary rules; see AUTHORING.md content rule 7). Build only after the user approves the wording. | `src/game/chapters/awakening.js`, `forest.js` | author; the lead brings the options |
| A4 | If the user picks "no boss" for any chapter: make `boss` optional in the chapter contract. A chapter without one clears when its last task is done; the save's progress, hints, the View and the debrief XP all handle it. Tests first. | `src/game/session.js`, `progress.js`, `AUTHORING.md` section 2 | **helper** or engine, only after A3's decision |

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

## E. Publishing

| # | Task | Who |
|---|---|---|
| E1 | Republish the preview after A1-A3: `npm run bundle`, `node test/ui/shots.js OUT --published`, publish `dist/index.html` to https://claude.ai/artifact/Nqt9UZqv6MPiaci46Q3vi3 and remove the 98 old files. | the lead |
| E2 | Replace the original Shellcraft artifact, only after the user approves. | the lead, with the user |

## F. Waiting on the user

- The new boss style for chapters 1 and 2 (A3).
- Whether to add the extra chapters: Archive Vault (`tar`, `gzip`, `du`, `df`), Scribe's Desk
  (`nano` basics), Signposts (`ln -s`).

## Known risks, accepted for now

- `grep -E` patterns like `(a*)*b` can backtrack for a very long time in the JavaScript regex
  engine and freeze the page. Only the player's own tab is affected; a real fix needs a
  non-backtracking matcher.
