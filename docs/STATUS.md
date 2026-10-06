# Shellcraft 2: status and handoff

Read this first when resuming, then `docs/DESIGN.md` and `AUTHORING.md`.

## RESUME HERE

- 2026-10-06: the user approved the redesign plan (decisions in DESIGN.md section 1) and asked
  for a team of named teammates. Phase: **vertical slice** (DESIGN.md section 4, "Slice scope").
- `main` has the baseline (the v1 artifact in `original/`), the contracts (`src/backend/`), the
  docs and the dev tooling (`npm test`, `npm run lint`).
- The original artifact: https://claude.ai/artifact/M4J2FKo8Q5pDtJQ9Y3Y2dz (do not republish it
  until the user approves the new version; previews go to a separate private artifact).

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
`dist/index.html` from `npm run bundle`, after checking it in Chrome inside
`<iframe sandbox="allow-scripts">`. When republishing to the preview URL, remove the old
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
- Fact-check round: the heart-loss reason texts in src/game/effects.js.

## Rules

Feature branches, small commits, no trailers, never push. Ask the user before deleting
branches, before replacing the original artifact, and before any change to `~/learning/termlab`.

## Briefs

Each teammate's brief is the DESIGN.md section 8 row plus: read DESIGN, AUTHORING, port.js,
spec.js and the matching part of `original/shellcraft-v1.html`; milestones (shell M1 fast, then
M2 difftest; art milestone A static rooms then B animation); message `main` at each milestone;
final report under 400 words. Relaunch with the same scope if a session ends mid-flight.
