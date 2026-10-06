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

Merged into main so far (2026-10-06): shell M1 (simulator behind the port), engine (session,
rules, test helpers, Tab helper, `why`), art (overworld + dungeon map, motion, roster sprites,
keyboard picks, intro focus), author (base world, chapters 1-2 with boss rooms, verification
logs). 465 tests pass; lint 0 errors.

| Name | Now | Waiting for |
|---|---|---|
| shell | M2: difftest harness, ls columns, quoting, the fixes; FIRST the 2-line commit: observe() returns `groups`, -bash has key 'shell' (the browser cannot boot without groups) | - |
| engine | integration tests on real content: save/reload, zero hearts, replay, every hint | - |
| author | forest lesson: bridge Linux's "up" with the map's dungeon below home | - |
| art | layout bug: items under the hero's rest spot with two rows of doors (crowded-360) | - |
| ui | page, terminal, intro, main.js, scripts/serve.js | the groups commit to boot for real |

Decisions taken by the lead along the way (all in DESIGN/AUTHORING): Observation.groups; the
player's shell has key 'shell'; store = getItem/setItem; setup(random, { home, user });
baseWorld injected into the session; `kind` on effects and events; one heart per line; boss
hints may be functions of the secret; ctx.completions (lost in a real-terminal mode, only
forest's Tab task); required `why`; a tab in a solve line means pressing Tab; the forest lesson
bridges "cd .. goes up" with the map's dungeon below home.

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
