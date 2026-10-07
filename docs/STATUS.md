# Shellcraft 2: status and handoff

Read this first when resuming, then `docs/DESIGN.md` and `AUTHORING.md`.

## RESUME HERE

- 2026-10-06: the user approved the redesign plan (decisions in DESIGN.md section 1) and asked
  for a team of named teammates. Phase: **vertical slice** (DESIGN.md section 4, "Slice scope").
- `main` has the baseline (the v1 artifact in `original/`), the contracts (`src/backend/`), the
  docs and the dev tooling (`npm test`, `npm run lint`).
- The original artifact: https://claude.ai/artifact/M4J2FKo8Q5pDtJQ9Y3Y2dz (do not republish it
  until the user approves the new version; previews go to a separate private artifact).

## Next session starts here (end of 2026-10-06)

main is at the merge of slice/shell 8b30c81: 1031 tests pass, lint is clean. The user played
chapter 1 locally (`npm run serve`, http://localhost:8765) and is giving feedback as they go.

1. **The user's layout decision (feedback 1, refined at the end of the day):** a new wide-screen
   layout where the map and the quest panel sit side by side in the top row and the terminal
   spans the full width below, AND the current layout (map and quest on the left, terminal on the
   right) kept as an option the player can switch to; the choice is remembered. The room buttons
   ("In this room") become one horizontally scrolling row, and the sticky map goes away. The
   problem it fixes: at 1400x1100 the sticky map area was 634px tall, the quest panel scrolled
   under it with its frame peeking out, and in /usr/bin the 52 room buttons were 221px tall.
   Owner: ui (CSS/layout), with art if the canvas must fit a height-bound box. Check 1400x900,
   1280x720, 1536x864, 1024x768 and 360.
2. **Chapter 1's boss room goes (feedback 2):** the user found The Forged Letters confusing
   because of its wording (the riddle "the spell that prints your user name", forged
   signatures). Replace it with a simpler challenge in plain words and no riddles, e.g. find the
   one file in the room that names the command to run. Owner: author, then factcheck and a
   teaching read. Lesson for every future chapter: AUTHORING.md content rules get "plain words,
   no riddles; a challenge tests the commands, not the reading".
3. engine: switch dangers.js and the fake backend to src/backend/process.js selectsProcess
   (merged), tests first: kill -HUP 0, kill -9 -$$, pkill -KILL -u hero, pkill -9 -t pts/0 and
   killall -9 -u hero cost a heart; kill -9 -1, pkill -9 -u root, pkill -9 -u hero cron and
   pkill -9 -x ba don't. Delete engine's own processName.
4. factcheck: verify 6bb4c32's process selection against Ubuntu (approved, not started).
5. Ask the user for the rest of their playtest feedback, fix it, then republish the preview:
   `npm run bundle`, `node test/ui/shots.js OUT --published`, publish dist/index.html to
   https://claude.ai/artifact/Nqt9UZqv6MPiaci46Q3vi3 and remove the 98 old files (null in `files`).
   Read every changed file before publishing.
6. .scratch/wt/play is a detached snapshot worktree used for the user's local play; serve it
   again or drop it (ask before deleting).
7. Then chapters 3 to 14 in batches (3-5, then 6-9 with the simulator work for 12 and 13, then
   10-14), each author paired with a fact-checker; the user plays each batch. Still open: the
   user's yes or no on the extra chapters (Archive Vault, Scribe's Desk, Signposts).

## In flight: slice round 3, code health (2026-10-06)

Rounds 1 and 2 are merged. The **private preview** of the slice is published from main d230516:
https://claude.ai/artifact/Nqt9UZqv6MPiaci46Q3vi3 (the lead read all 99 files first). The user
plays it next; collect their reactions before chapters 3 to 14.

Round 3 is the code review's list (docs/reviews/code-slice.md), plus two lead findings:

| Name | Round 3 | Merged so far |
|---|---|---|
| engine | dangers.js part B on shell's signals.js (pkill/killall and every shell-ending signal) | everything else: dangers.js A, M1 overlap guard, L8 chapter progress in the save, L1 L2 L7 L9, one note per line, host in who(), childOf |
| shell | signals.js, collate and copy on tree.js, L4 hostile nesting, find/man -help, hostname -x usage on stdout, M6, L5, L6, L3 | prototype-named files (13a6539), H2 grep highlighting (2d2da54), round 2 |
| ui | L11 PLAYER, L1, L9 (use View.started and the event's total), L10 | M1 single queue (bcf3cae), M4 displayPath on tree.isInside |
| author | one leftover "go up" in the forest recap | tree helpers, baseWorld takes host (36c8e32) |

The lead's Chrome run after the M1 merge (main, 2026-10-06): chapters 1 and 2 clear at 1400 and
360 px with no page errors; same-tick Tab, Hint and Sound clicks behave; a reload mid-chapter
restores finished tasks and shown hints, and a hint is paid for once.

Then: browser QA (worktree .scratch/wt/qa ready), the lead's replay, republish the preview.

**Publishing (2026-10-06):** the first preview (multi-file, module scripts) was dark for the user:
the artifact host's frame has an opaque origin, so module scripts fail CORS. Publish only
`dist/index.html` from `npm run bundle`, after `node test/ui/shots.js OUT_DIR --published`
passes (it loads the bundle inside `<iframe sandbox="allow-scripts">` at 1400 and 360 and plays
the first task). When republishing to the preview URL, remove the old
supporting files (pass them as null in `files`).

## After the slice

1. Fresh reviewers: fact-checker per chapter (blind playtest first), browser QA (3 widths,
   keyboard, reduced motion), teaching reviewer, a code review against AUTHORING.md section 1.
2. Collect the user's reactions to the preview.
3. Chapters 3 to 14 by authors in parallel, each followed by a fact-checker.

## Backlog (after the slice)

- Chapter 12 (Well of Echoes) needs the simulator to read `~/.bashrc` (today `ll` and `la` are
  built in) and support `source ~/.bashrc`.
- Real-terminal (termlab) path only: the record-based danger check detects `kill -9` of the
  player's shell, not HUP, USR1 and the other signals that end it (the simulator refuses those
  itself). Fix by sharing one signal table from the backend side, not by copying it into src/game.
- grep -E patterns like `(a*)*b` can backtrack exponentially in the JS regex engine and freeze
  the tab. Accepted for now (a player can only freeze their own page); a real fix needs a
  non-backtracking matcher.

## Rules

Feature branches, small commits, no trailers, never push. Ask the user before deleting
branches, before replacing the original artifact, and before any change to `~/learning/termlab`.

## Briefs

Each teammate's brief is the DESIGN.md section 8 row plus: read DESIGN, AUTHORING, port.js,
spec.js and the matching part of `original/shellcraft-v1.html`; milestones (shell M1 fast, then
M2 difftest; art milestone A static rooms then B animation); message `main` at each milestone;
final report under 400 words. Relaunch with the same scope if a session ends mid-flight.
