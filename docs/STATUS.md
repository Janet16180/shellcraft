# Shellcraft 2: status and handoff

Read this first when resuming, then `docs/DESIGN.md` and `AUTHORING.md`.

## RESUME HERE

- 2026-10-06: the user approved the redesign plan (decisions in DESIGN.md section 1) and asked
  for a team of named teammates. Phase: **vertical slice** (DESIGN.md section 4, "Slice scope").
- `main` has the baseline (the v1 artifact in `original/`), the contracts (`src/backend/`), the
  docs and the dev tooling (`npm test`, `npm run lint`).
- The original artifact: https://claude.ai/artifact/M4J2FKo8Q5pDtJQ9Y3Y2dz (do not republish it
  until the user approves the new version; previews go to a separate private artifact).

## In flight (teammates; each works in `.scratch/wt/<name>` on branch `slice/<name>`)

| Name | Job | State |
|---|---|---|
| shell | simulator port (M1), then fixes + difftest (M2) | launched 2026-10-06 |
| engine | session, checks, progress, effects, rng, save | launched |
| author | world.js, chapters awakening + forest, boss rooms, verification logs | launched |
| art | map renderer: overworld + dungeon, transitions, effects | launched |
| ui | page, terminal, panels, sound, intro, main.js, screenshots | launched |

Integration order: shell M1 -> main (others merge main), art API -> ui, engine + author on the
real simulator, then ui wiring, then the lead's preview.

## After the slice

1. Fresh reviewers: fact-checker per chapter (blind playtest first), browser QA (3 widths,
   keyboard, reduced motion), teaching reviewer, a code review against AUTHORING.md section 1.
2. Preview artifact for the user; collect their reactions.
3. Chapters 3 to 14 by authors in parallel, each followed by a fact-checker.

## Rules

Feature branches, small commits, no trailers, never push. Ask the user before deleting
branches, before replacing the original artifact, and before any change to `~/learning/termlab`.

## Briefs

Each teammate's brief is the DESIGN.md section 8 row plus: read DESIGN, AUTHORING, port.js,
spec.js and the matching part of `original/shellcraft-v1.html`; milestones (shell M1 fast, then
M2 difftest; art milestone A static rooms then B animation); message `main` at each milestone;
final report under 400 words. Relaunch with the same scope if a session ends mid-flight.
