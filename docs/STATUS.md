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
| engine | dangers.js (A, then B on signals.js), M1 overlap guard, L8 save chapter progress, L1 L2 L7 L9, one-note-per-line test, who() passes host, childOf in effects.js and coach.js | dd8b6cc |
| shell | prototype-named files (`cat constructor`, `touch __proto__`), H2 grep escaping, signals.js, collate and copy on tree.js, L4 hostile nesting, find/man -help, M6, L5, L6, L3 | through 68c48c5 |
| ui | M1 single queue (Tab and Hint too), tree.isInside in output.js, L11 PLAYER, L1 levels, L9, L10 | earlier round 3 extras |
| author | tree helpers (done), baseWorld takes host (waits for engine's who() change) | c8fec26 |

Merge order constraints: engine's M1 (eba1c20) raises on overlapping session calls, so it lands
in the same merge as ui's single queue, never alone. engine's L8 (d01576f) sits on M1. author's
host commit lands after engine's who() change.

Then: browser QA (worktree .scratch/wt/qa ready), the lead's replay, republish the preview.

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
