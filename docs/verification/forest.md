# Verification log: chapter 2, The Whispering Forest (`src/game/chapters/forest.js`)

Reference system and runs R1 to R5 as in `world.md` and `awakening.md`. R2 ran this chapter's
solve and boss moves in real bash as hero on the generated base world. SIM: the chapter tests on
the simulator (`test/game/chapters/forest.test.js`). Man pages from the Ubuntu 24.04 host.

## Lesson

| Claim | Evidence |
|---|---|
| Linux keeps everything in one tree; it starts at `/`, the root directory | `hier(7)`: "/ This is the root directory. This is where the whole tree starts." |
| `/home/hero` is a branch of it | R2 `pwd`: `/home/hero` |
| A directory's parent is the directory that holds it; `..` is the parent (round 2 dropped the unused `.` from the lesson) | `path_resolution(7)` ". and ..": "refer to the directory itself and to its parent directory" |
| `cd` means change directory | `help cd`: "Change the shell working directory." |
| A relative path starts from where you are; an absolute path starts at `/` and works from anywhere | `path_resolution(7)` Step 1: a pathname starting with `/` starts at the root directory, otherwise at the current working directory |
| `cd forest/cave` goes several rooms deep at once | R2: `cd cave/deep` from the forest printed `/home/hero/forest/cave/deep` |
| `cd ..` goes one level up the tree, toward `/` | R2: from deep, `cd ..` -> `/home/hero/forest/cave`; `bash(1)` cd: ".. is processed by removing the immediately previous pathname component" |
| People say up because diagrams draw `/` at the top | `tree -d -L 1 /` on Ubuntu 24.04 (Docker, `apt-get install tree`) prints `/` on the first line and its children below it; `hier(7)`: `/` is "where the whole tree starts" |
| Kernelia draws the root underground: from home, the way toward `/` leads down the stairs into the dungeon | the game's map, not a Linux fact: DESIGN.md section 3 ("going from home to `/` is a stairway descent") and `src/map/stairs.js` (leaving home goes down the stairway, returning climbs back). The test `the lesson bridges Linux's "up" ...` keeps this sentence in the lesson |
| `~` stands for your home, so `cd ~/forest` works from anywhere | `bash(1)` Tilde Expansion: "the tilde is replaced with the value of the shell parameter HOME"; R2 `cd ~/forest/cave` from home |
| `cd` alone takes you home | `bash(1)` cd: "if dir is not supplied, the value of the HOME shell variable is the default"; R2 |
| `cd -` jumps back to the previous directory and prints its path | `bash(1)` cd: "An argument of - is converted to $OLDPWD ... if - is the first argument, and the directory change is successful, the absolute pathname of the new working directory is written to the standard output"; R2 printed `/home/hero/forest/cave` |
| Paths work with other commands: `ls ~/forest` from anywhere | R2: from `/etc` and `/var/log`, `ls ~/forest` listed `cave clearing river` |
| Tab: `cd fo` then Tab writes `cd forest/` | R3: the line became `cd forest/`; `bash(1)` readline `mark-directories (On)`: "completed directory names have a slash appended"; SIM test |
| When several names match, press Tab again to list them | R5: `cd ga` + Tab rang the bell, a second Tab listed `game/ gate/`; `bash(1)` `show-all-if-ambiguous (Off)` |

Vertical words in chapters 1 and 2 were checked against this bridge. "Up" appears only where the lesson explains Linux's word (the bridge) and in the recap's `cd ..` line. Goals, tips, hints and spell notes say "deeper" and "back out" (round 2, teaching review finding 4; a test keeps "up" and "down" out of them). The map's "down" is the stairway from home into the dungeon, and the chapter 2 boss's trapdoor fall follows it.

## Tasks and hints

| Claim | Evidence |
|---|---|
| Hints: cd followed by a directory name moves you into it; a path with slashes goes deeper | R2 |
| Hint: ls shows the file name, then cat prints it | R2: `ls` in deep, `cat ancient_key.txt` |
| Hint: `..` means the parent of the directory you are in | `path_resolution(7)` |
| Hint: an absolute path works from anywhere because it starts at the root of the tree, `/` | `path_resolution(7)` Step 1 |
| Hint: the shell remembers the previous directory; a dash after cd goes back | `bash(1)` cd: OLDPWD |
| Hint: cd with nothing after it takes you home | `bash(1)` cd |
| Hints: Tab finishes a name from its first letters when only one name matches; type cd fo, press Tab, then Enter | R3 (unique match completed), R5 (two matches: bell, then a list) |
| `cd ~/forest/river` counts as an absolute path | bash expands `~` before cd runs (Tilde Expansion), so cd receives `/home/hero/forest/river`; the CommandRecord shows the same |
| `cd -` counts whenever it succeeds, even when the previous directory was the same room (it still did its job: teaching review 2a dead end) | `bash(1)` cd: `-` is converted to $OLDPWD; SIM test with `cd .` then `cd -` |
| "Shortest command" home is `cd` alone; `cd ~` and `cd /home/hero` do not pass that task | by design; the lesson says `cd ~` also goes home, the goal asks for the shortest |
| Checks: each task has a near-miss that does not pass and a line that does | SIM: 16 near-miss tests (e.g. `cd ../river` is relative; `cd ../cave` from the river is not from deep; `cd forest` typed in full uses no Tab; Tab while already in the forest is not walking in). Each check also survived mutation testing: removing any one condition makes a test fail |

## Tips (one sentence per task, shown with the goal)

| Tip | Evidence |
|---|---|
| `cd` with a directory name walks you into it; a path with slashes goes several rooms deeper | R2 (`cd forest`, `cd cave/deep`) |
| `ls` shows the names, `cat` prints a file | R2 |
| `..` is the parent, so `cd ..` from deep steps back out into the cave | `path_resolution(7)`; R2 |
| An absolute path starts at the root with `/` | `path_resolution(7)` Step 1 |
| `cd -` jumps back to the previous directory and prints its path; `cd` alone goes home | `bash(1)` cd |
| Type the first letters, then Tab finishes the name | R3 |

## Near notes (shown when a line got close the wrong way)

| Note | Evidence |
|---|---|
| Enter the forest: "That looked into the forest from outside. To walk in, use cd forest." | `ls(1)` lists without moving; R2 |
| Deep and river: `cd forest/cave/deep` typed inside the forest, and `cd /forest/...`, are left to the generic coach (`src/game/coach.js`), which says "You are already in forest ... From here the path is cave/deep" and "A path that starts with / starts at the root, not at your home". The tests check that the coach answers these lines |
| Factcheck 2026-10-06 on the coach's repeated-cwd note: `cd forest/` typed inside the forest prints "From here the path is ." (an empty path read as a dot); it should stop after "You are already in forest (the prompt shows ~/forest)." (sent to engine for `coach.js`) | real bash: `cd forest/` in `~/forest` fails with `No such file or directory`; the path from the forest to itself is empty, so there is nothing to suggest |
| `..`: "You reached the cave, but without .. this time. Go back into deep and type cd .. to step back out." | game text; `..` is the parent (`path_resolution(7)`) |
| River: "You reached the river with a relative path. This task wants an absolute one, starting with /." | `path_resolution(7)` Step 1 |
| Home: "That works, but there is a shorter way home: cd on its own." | `bash(1)` cd: with no dir, HOME is the default |
| Tab: "You typed the whole name. Try cd fo and press Tab." | R3 |

## Boss: The Trapdoor

| Claim | Evidence |
|---|---|
| The dungeon is the part of the system outside `~`, where most things belong to root | `world.md` (owners) |
| Outside home the prompt shows the full path of where you are | R3: `hero@kernelia:/var/log$` |
| Every drop room is one the player may enter (`/var/log`, `/var/log/apt`, `/tmp`, `/etc`) | R2: `cd /var/log`, `cd /tmp`, `cd /etc` as hero, status 0; R2 `ls -la /var/log`: `apt` is `drwxr-xr-x root root` |
| ls can look into another directory from where you stand | R2: `ls ~/forest`, `ls ~/forest/river` from `/var/log` |
| One `cd` with an absolute or `~` path reaches the beacon from the dungeon | R2: `cd ~/forest/river/beacon_k7m` from `/var/log`, status 0 |
| A relative path also reaches it (`cd ../home/hero/...` from `/tmp`) but does not count | R2: status 0; the briefing asks for an absolute path, SIM near-miss tests |
| The beacon's place and name change with the seed | SIM: at least 3 different rooms over 12 seeds; names use the safe token alphabet |
| flame.txt: "A warm flame burns here: the Guardian's beacon." (was "You found your way back with one absolute path", false when the player arrived another way) | game text, makes no claim about how the player arrived |
| Near note: a relative cd that reaches the beacon is named as relative; the fix is to step out with `cd /tmp` and jump again with a path starting with `/` or `~` | `path_resolution(7)` Step 1; R2: hero can enter `/tmp`; tilde expansion makes `~/...` absolute |
| Near note: a jump that starts inside the home does not count; step out with `cd /tmp` first | the boss rule (the jump starts in the dungeon); `/tmp` is outside `/home/hero` |
| Hint 3 `cd /tmp; cd /home/hero/forest/.../beacon_XXX` works from anywhere | `bash(1)` Lists: "Commands separated by a ; are executed sequentially"; the check judges the line's last `cd` (where it started, its path, where it landed); SIM test runs the hint from the dungeon, from home and from the beacon |

## Adventure log, spells, recap, field

| Claim | Evidence |
|---|---|
| why: every disk, USB stick and network share appears somewhere in the tree that starts at `/`, once mounted; no drive letters | `mount(8)`: "All files accessible in a Unix system are arranged in one big tree, the file hierarchy, rooted at /. ... The mount command serves to attach the filesystem found on some device to the big file tree." |
| why: an absolute path means the same place wherever you stand; configuration files and scripts often use them | `path_resolution(7)`; e.g. `/etc/crontab` runs `cd / && run-parts --report /etc/cron.hourly` (R1) |
| why: bash replaces `~` with your home's path before the command runs | `bash(1)` Tilde Expansion |
| field: `ls /` shows the root of a real tree: bin, etc, home, usr, var and more | D: `ls /` in `ubuntu:24.04` lists `bin boot dev etc home lib lib64 media mnt opt proc root run sbin srv sys tmp usr var` |
| field: `/etc` is where system settings live | `hier(7)`: "/etc Contains configuration files which are local to the machine" |
| field: `pushd DIR` is like cd but remembers where you were; `popd` takes you back | `bash(1)` pushd: "Adds a directory to the top of the directory stack ... making the new top of the stack the current working directory"; popd: "removes the top directory from the stack, and changes to the new top directory" |
| spells and recap (cd forms, Tab) | as in the lesson rows above |
