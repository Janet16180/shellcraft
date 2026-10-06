# Shellcraft 2: status and handoff

Read this first when resuming, then `docs/DESIGN.md` and `AUTHORING.md`.

## RESUME HERE

- 2026-10-06: the user approved the redesign plan (decisions in DESIGN.md section 1) and asked
  for a team of named teammates. Phase: **vertical slice** (DESIGN.md section 4, "Slice scope").
- `main` has the baseline (the v1 artifact in `original/`), the contracts (`src/backend/`), the
  docs and the dev tooling (`npm test`, `npm run lint`).
- The original artifact: https://claude.ai/artifact/M4J2FKo8Q5pDtJQ9Y3Y2dz (do not republish it
  until the user approves the new version; previews go to a separate private artifact).

## In flight: slice round 2 (2026-10-06)

The slice is complete on main and plays end to end (lead's own Chrome runs at 1400 and 360 px).
Reviews done: fact-check (merged; simulator findings to shell), teaching review
(docs/reviews/teaching-slice.md). Round 2 from those reviews, contracts at df81ccf:

| Name | Round 2 |
|---|---|
| engine | near notes + task tips in session/View, src/game/coach.js (typo notes from records, ported from the simulator), cleared chapter not shown as playing |
| author | dead ends (forest task 6, trapdoor relative path + flame.txt + hint 3), near notes, a tip per task, deeper/back-out wording, trim chapter 1 lesson |
| shell | fact-check wrong answers (option errors, --version, man -k, who), deterministic difftest instead of the silent retry; LAST: drop teaching notes once coach is on main |
| ui | tip in the task strip, coach note style, title wording, map key wording, intro matches the game + Tab animation, toasts after cards, visible rank-up |
| review | read-only code review against the user's principles -> docs/reviews/code-slice.md |

Then: browser QA (worktree .scratch/wt/qa ready), the lead's replay, a private preview artifact.

## After the slice

1. Fresh reviewers: fact-checker per chapter (blind playtest first), browser QA (3 widths,
   keyboard, reduced motion), teaching reviewer, a code review against AUTHORING.md section 1.
2. Preview artifact for the user; collect their reactions.
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
