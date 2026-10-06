# Shellcraft 2: design

Shellcraft teaches **basic Linux** to beginners as an 8-bit adventure in the browser. The
original (`original/shellcraft-v1.html`, the published artifact) already works: a simulated
bash, a map where directories are doors and files are items, 10 chapters. This redesign keeps
its concept and look and adds what Ring Zero taught us (`~/learning/GAME_METHODOLOGY.md`,
`~/learning/ring0/docs/AUDIT.md`).

## 1. Decisions (user, 2026-10-06)

| Topic | Decision |
|---|---|
| Runtime | Keep the simulated shell from the artifact, reuse its code, but stay orthogonal: everything above the backend port (section 3) must work unchanged if a real bash through termlab replaces the simulator later. |
| Chapters | Add Hall of Mirrors, The Descent, Well of Echoes, Forge Your Own Spell; job control joins the Shadow Daemon. More may be proposed. |
| Style | Overworld = the player's home (`~`), in the original outdoor 8-bit style. Dungeon = everything outside home, in Ring Zero's Pixel Dungeon style. |
| Order | Vertical slice first (intro, chapters 1 and 2 with boss rooms, the stairway into the dungeon), the user plays it, then the rest. |
| Team | Built by a team of named teammates; the main session is the lead (integration, verification, reports). |

Defaults chosen by the lead (change if the user disagrees):
- Reference system: **Ubuntu 24.04, bash 5.2, coreutils 9.4, `LC_ALL=C.UTF-8`** (the WSL
  default). Sorting and `ls` order follow C.UTF-8 byte order: capitals before lowercase.
- Delivery: a multi-file claude.ai artifact (index.html + ES modules), no build step. Previews go
  to a separate private artifact; the original link is replaced only after the user approves.

## 2. Architecture

Layers depend downward only:

```
interface      index.html, styles/, src/ui/, src/intro/, src/map/     (DOM, canvas, sound)
composition    src/main.js                                             (wires the pieces)
orchestration  src/game/session.js                                     (one turn: run, observe, check, score)
core rules     src/game/{checks,progress,effects,rng,save}.js, src/game/chapters/, src/game/world.js
port           src/backend/port.js (types), src/backend/spec.js (world patches)
backends       src/shell/  (the simulator; a termlab adapter could sit beside it later)
```

Rules:
- `src/shell`, `src/game` and `src/backend` never touch the DOM, `window` or storage (ESLint
  enforces it). They are tested with plain inputs under `node --test`.
- Game rules see the shell only through the port: `CommandRecord`s and `Observation`s. A check
  never reads simulator internals, notes or HTML.
- The map draws only from an `Observation` plus effects. It never asks the shell anything.
- Chapters are data plus pure check functions. Adding a chapter touches no engine file except
  the chapter list.

### 2.1 Backend port (`src/backend/port.js`)

`load(patch)`, `run(line)`, `observe()`, `complete(line)`, all async. World patches are built
with `src/backend/spec.js` (`put`, `remove`, `proc`, `stop`, `cd`, `dir`, `file`). The
backend owns what a real system owns: the programs in `/usr/bin` (the simulator lists one
executable per command it implements; the world spec must not define `/usr/bin`), PIDs, the
clock. The simulator also guards the world: it refuses `rm -r ~`, `rm -rf /`, `kill -9` of the
player's shell, and reports each refusal in `RunResult.blocked`. The Linux permission rule lives
once in `src/backend/access.js`: the simulator enforces it and the map draws padlocks with it.

### 2.2 Session API (`src/game/session.js`, consumed by the UI)

```js
const session = createSession({ backend, chapters, baseWorld, store, random });  // baseWorld from world.js, injected by main.js
await session.boot();                 // -> View   load the save (validated), start the current chapter
await session.startChapter(id, { fresh });   // -> View
await session.submit(line);           // -> Turn
session.hint();                       // -> { level: 1..3, text, cost } | null   next hint for the current task or boss
session.view();                       // -> View
await session.complete(line);         // -> { line, candidates }   (backend.complete)
session.observation();                // the latest Observation (sync), for map.show()
session.setSound(on); session.markIntroSeen(); await session.reset();
```

`store` is the localStorage subset `{ getItem(key): string|null, setItem(key, text) }`. The UI
passes an adapter that never throws (falling back to memory when storage is unavailable); the
engine owns the keys, JSON parsing, validation and the v1 migration (v1 is read only when no v2
save exists, and is never deleted). `startChapter` raises for an unknown, `soon` or locked id.

`Turn = { result: RunResult, obs: Observation, effects: Effect[], events: GameEvent[], view: View }`.
Effects and events carry a `kind` field. Events: `task {index, goal, xp}`, `boss-start`, `boss {xp}`,
`chapter {id, recap, why, field, xp, next}`, `heart-lost {reason, left}`, `hearts-restored {phase}`.
A line costs at most one heart. At zero hearts the quest phase re-applies the chapter setup on
the current world (finished tasks stay finished); the boss phase reruns `boss.setup` (a new
random boss, hints kept).

`View` holds everything the page draws: the chapter (id, number, total, act, title, phase
`quest|boss|done`, lesson HTML, tasks with done/next, boss title and briefing), XP, rank (title,
floor, next), hearts, sound, the chapter list with a status each (`playing|open|cleared|locked|soon`),
the spellbook with an `unlocked` flag per spell, and the prompt (user, host, cwd, home).

### 2.3 Effects (`src/game/effects.js`)

Derived from the observation before and after a line plus its commands, so they work with any
backend: `travel {from, to}`, `created {path}`, `removed {path}`, `unknown-command`,
`guardian {reason}`, and chapter-defined ones (`daemon-defied`, `daemon-killed`,
`gate-opened`). The map animates the kinds it knows and ignores the rest; the UI plays sounds.

### 2.4 Map API (`src/map/`, consumed by the UI and the intro)

```js
const map = createMap(canvas, { reducedMotion, onPick });  // onPick({ kind: 'door'|'item'|'exit', name, path })
map.show(obs);                  // draw the room at obs.cwd now
await map.play(effects, obs);   // animate, then settle on obs
map.say(text, who);             // speech bubble
map.destroy();
```

Pure exports, tested: `biomeFor(path, home)` -> `{ realm: 'overworld'|'dungeon', biome, name }`,
`layoutRoom(...)`, `describeRoom(obs)` (the text alternative for screen readers).

## 3. The world

- **Overworld (`~` and below):** the original biomes: cottage (home), Whispering Forest, river,
  cave, camp, junkyard, Great Library, Tower of Echoes, Market of Pipes, Sealed Gate. Bright,
  outdoors, owned by the player.
- **Dungeon (everything outside `~`):** Ring Zero's Pixel Dungeon: brick walls, flagstone floors,
  flickering torches, its 16-colour palette. `/` is the dungeon's entrance hall; going from home
  to `/` is a stairway descent. A directory the player cannot enter (`/root`) is a padlocked
  door; a file they cannot read is chained. The metaphor is true: home is yours and writable,
  the rest of the system belongs to root.
- The Shadow Daemon lives below; Act II takes place mostly in the dungeon.

## 4. Chapters

Each chapter: **lesson -> guided quest -> boss room -> adventure log**.
- Lesson: the brief, teaching every command the quest needs.
- Guided quest: tasks with goals, checked automatically after each line.
- Boss room: a randomized challenge with a briefing and no step list, using only commands
  taught so far. It is what proves the chapter was learned.
- Adventure log: recap, the "why", and field commands to try on a real machine.

| # | Act | Id | Title | Scope |
|---|---|---|---|---|
| 1 | I | awakening | The Awakening | prompt, whoami, pwd, ls, cat, clear, man/--help |
| 2 | I | forest | The Whispering Forest | cd, relative/absolute paths, `..`, `~`, `cd -`, Tab |
| 3 | I | unseen | Things Unseen | hidden files, `ls -a`, `ls -l` |
| 4 | I | camp | Build a Camp | mkdir, touch, `echo >`, cp, mv |
| 5 | I | junkyard | The Cursed Junkyard | rm, rmdir, `rm -r`, `rm -i` |
| 6 | I | mirrors | Hall of Mirrors (new) | wildcards `* ? [ ]`, quoting, names with spaces, preview before rm |
| 7 | I | library | The Great Library | head, tail, wc, less |
| 8 | I | tower | The Tower of Echoes | grep, find |
| 9 | I | market | The Market of Pipes | pipes, `>`, `>>`, sort, uniq |
| 10 | II | descent | The Descent (new) | `/etc`, `/var/log`, `/tmp`, `/usr/bin`, `/dev/null`, which, type, PATH |
| 11 | II | gate | The Sealed Gate | permissions, chmod, `./`, owners, groups, id, why sudo |
| 12 | II | well | Well of Echoes (new) | variables, export, alias, `.bashrc`, `$?`, `&&`, `\|\|`, `2>`, `/dev/null` |
| 13 | II | daemon | The Shadow Daemon | ps, kill, signals, top, jobs, `&`, fg, bg, Ctrl+Z |
| 14 | II | forge | Forge Your Own Spell (new) | a first script: shebang, variables, a for loop, chmod +x |

Candidates after the slice: an Archive Vault (tar, gzip, du, df), a Scribe's Desk (nano
basics), Signposts (`ln -s`). Each needs the user's go-ahead.

**Slice scope:** intro, chapters 1 and 2 with their boss rooms, the overworld rooms and the
dungeon rooms (the descent to `/` must work), the whole simulator port with its fixes, the
differential harness, hints, XP, hearts, sound, spellbook, save v2 (with migration of the v1
save). Chapters 3 to 14 appear in the chapter list as `soon`.

## 5. Progress rules (`src/game/progress.js`)

- A task pays 10 XP, a boss 30, clearing a chapter 20 more. Replaying a cleared chapter pays nothing.
- Hints come in three levels: a nudge (free), the technique (costs 3), the exact command
  (costs 5). Costs come off that task's payout, never below 2.
- Hearts: 3. A refusal by the guard (`blocked`) costs one. At zero, the Guardian restores you:
  the current phase's world is set up again and hearts refill; no XP is lost.
- Ranks over about 1,400 XP: Novice 0, Apprentice 150, Adept 400, Shell Mage 750, Root Wizard 1100.
- Save: `shellcraft-save-v2` in localStorage, validated when loaded (damaged -> start fresh and
  say so). A v1 save (`shellcraft-save-v1`: chapter index, maxChapter, xp, sound) is migrated
  by mapping its chapter indexes to the new ids.

## 6. Correctness

The game teaches what real Linux does, so the simulator is tested against real bash:
- **Differential tests** (`difftest/`): each case builds a world, runs lines in the simulator and in
  a Docker `ubuntu:24.04` container (hostname `kernelia`, user `hero` uid 1000, home
  `/home/hero`, `LC_ALL=C.UTF-8`, `TZ=UTC`, fixed mtimes, no network), and compares stdout,
  stderr and status. Intended differences are listed with a reason. Without Docker the suite
  reports "skipped", never "passed".
- Known bugs in v1 (verified 2026-10-06): grep uses JavaScript regex, not POSIX BRE (`grep 'a+'`);
  `ls -l` prints a wrong `total`; ls and sort use English collation instead of C.UTF-8;
  permissions follow the path, not owner and mode.
- Every fact in lessons, hints, intro, flavour text and debriefs is checked against man pages and
  real runs, and logged in `docs/verification/<id>.md`. A fresh fact-checker reviews each chapter.
- Checks prove what the celebration claims; every task has a near-miss test that must fail.

## 7. Look and feel

- Fonts: Pixelify Sans for titles only; Atkinson Hyperlegible for prose; IBM Plex Mono for the
  terminal, code, and **every name the player might type, including map labels** (pixel fonts
  confuse Z/2, 0/O, 1/l/I). Random tokens avoid those glyphs.
- Overworld colours: the v1 biome palette. Dungeon: Ring Zero's 16 colours
  (`#0b0a12 #1c1930 #353050 #615b80 #a3a0bf #f4f0e4 #5e2e22 #a24f34 #f08a2a #ffd348 #3e7a3c
  #8fd14f #2c5aa8 #6d2f9c #c792ff #e2434f`).
- UI chrome borrows Ring Zero's dungeon frame: notched pixel buttons, the quest log, an
  adventure-log debrief, square confetti, a sprite roster saying what each sprite really is.
- Animated intro, player-paced (Back, Next, Skip; replay from the menu): the prompt explained,
  `ls` lights the room, `cd forest` walks through a door, `cd ..` back, `cat` unrolls a scroll,
  `ls -l forest` split into command, option, argument, then Enter, Tab, Up, hint, man, and the
  player types a first real command. Steps are data (`src/intro/steps.js`) so they can be
  fact-checked.
- Clicking a door or item puts the matching `cd` or `cat` command in the input (it never runs it).
- Reduced motion: no tweens or particles, still frames in the intro. Keyboard-only play works.
  The map has a text alternative. Layout works from 360 px wide, no horizontal scroll.

## 8. Team, ownership and process

| Teammate | Owns | Slice deliverable |
|---|---|---|
| lead | `docs/`, `src/backend/`, `AUTHORING.md`, merges | contracts, integration, verification, previews |
| shell | `src/shell/`, `test/shell/`, `difftest/` | the v1 simulator as ES modules behind the port (M1, fast), then the fixes and the differential harness (M2) |
| engine | `src/game/` except `chapters/` and `world.js`; `test/game/` except chapter tests; `test/helpers/` | session, checks, progress, effects, rng, save + v1 migration |
| author | `src/game/chapters/`, `src/game/world.js`, `test/game/chapters/`, `test/game/world.test.js`, `docs/verification/` | world spec (ported v1 areas + dungeon), chapters 1 and 2 with boss rooms |
| art | `src/map/`, `test/map/` | overworld + dungeon renderer, transitions, effects, labels, describeRoom |
| ui | `index.html`, `styles/`, `src/ui/`, `src/intro/`, `src/main.js`, `scripts/serve.js`, `test/ui/`, `test/intro/` | page, terminal, panels, sound, intro, wiring, screenshots |

- Each teammate works in its own git worktree `.scratch/wt/<name>` on branch `slice/<name>`.
  The lead merges into `main` and tells the others to merge `main` in.
- Need a change in a file you don't own: message its owner (and the lead for API changes).
- Small commits, plain messages, **no trailers** (no Co-Authored-By), never push.
- Before saying done: `npm test` and `npm run lint` clean in your worktree.
- Scratch dirs: `mktemp -d -p .scratch <name>-XXXX`; delete only exact paths you created.
