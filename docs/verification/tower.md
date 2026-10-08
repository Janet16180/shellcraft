# Verification log: chapter 8, The Tower of Echoes (`src/game/chapters/tower.js`)

Reference system as in `world.md`. R8 (2026-10-07): the chapter's commands run in real bash 5.2.21
with GNU grep 3.11 and GNU findutils 4.9.0 (`LC_ALL=C.UTF-8`) on a copy of `~/tower` from the base
world (plus the guestbook and a sample scale `tower/floor3/alcove/crate/cyrr.scale`), in a scratch
home outside the repo. SIM: `test/game/chapters/tower.test.js`. Man pages from the Ubuntu 24.04 host.

## Lesson

| Claim | Evidence |
|---|---|
| `grep WORD FILE` looks inside the file and prints only the lines that contain WORD | `grep(1)`: "grep searches for PATTERNS in each FILE ... prints each line that matches a pattern"; R8: `grep password tower/floor2/diary.txt` printed only `Day 14: the password to the vault is penguin42` |
| A plain word matches exactly as typed, capitals included: `dragon` does not match `Dragon` | R8: `grep dragon` on the guestbook printed only the lowercase line |
| `-i` matches capitals and small letters alike | `grep(1)` `-i`: "Ignore case distinctions in patterns and input data"; R8: `grep -i dragon` printed the dragon, Dragon and DRAGON lines |
| `-r` searches every file in a directory and the directories below it, hidden files too | `grep(1)` `-r`: "Read all files under each directory, recursively"; R8: `grep -r gold tower` printed all four gems, `.opal.gem` included; `grep -r NAME tower` found the scale two directories below floor3 |
| Each line of `grep -r` starts with the file it came from | `grep(1)` `-H`: "This is the default when there is more than one file to search"; R8: `tower/floor1/ruby.gem:A blood-red ruby. Worth 300 gold.` |
| Without `-r`, grep answers "Is a directory" | R8: `grep gold tower` printed `grep: tower: Is a directory`, status 2 |
| `find DIR -name "PATTERN"` looks at names, walks DIR and every directory below it, prints the path of every match, hidden names too | `find(1)` `-name`: "Base of file name ... matches shell pattern pattern"; R8: `find tower -name "*.gem"` printed the four gems, `tower/floor3/.opal.gem` included; `find tower -name "*.scale"` printed `tower/floor3/alcove/crate/cyrr.scale` |
| Bash expands an unquoted `*.gem` before the command runs, into matching names where you stand (chapter 6) | `bash(1)` Pathname Expansion: "If one of these characters appears, and is not quoted, then the word is regarded as a pattern, and replaced with an alphabetically sorted list of filenames matching the pattern" |
| If nothing there matches, bash leaves the pattern as it is, and find works | `bash(1)` (same section, nullglob unset: "the word is left unchanged"); R8: `echo *.nothing` printed `*.nothing`; `find tower -name *.txt` from a home holding `readme.txt` printed nothing (it became `readme.txt`) |
| If names there match, find gets those names instead of the pattern | R8: in `tower/floor1`, `find .. -name *.gem` printed only `../floor1/ruby.gem`; with `a.gem` and `b.gem` in the cwd, `find tower -name *.gem` failed: "find: paths must precede expression: `b.gem'" and "possible unquoted pattern after predicate `-name'?", status 1 |
| In quotes, the pattern reaches find unchanged | `bash(1)` QUOTING; R8: `find tower -name "*.gem"` printed every gem from any cwd |

## Why and field

| Claim | Evidence |
|---|---|
| Settings and logs are mostly plain text: `/etc/passwd` lists the users, `/var/log` records what the system did | `passwd(5)`; R8: `file /etc/passwd` printed `ASCII text`; `ls /var/log` lists text logs (`alternatives.log`, ...) |
| `find` visits every directory under the one you give it | `find(1)`: "searches the directory tree rooted at each given starting-point"; R8 `find tower -type d` |
| `ls *.gem` wants bash's expansion; find wants the pattern itself | as the lesson rows above |
| `grep -n` puts the line number first | `grep(1)` `-n`; R8: `3:Day 14: ...`, `4:Day 15: ...` |
| `grep -v` prints the lines that do not match | `grep(1)` `-v`: "Invert the sense of matching"; R8: Day 12 and Day 13 lines |
| `grep -rl` prints only the names of the files that match | `grep(1)` `-l`; R8: the four gem paths |
| `find DIR -type d` lists only directories | `find(1)` `-type d`; R8 |
| `find DIR -mtime -1` lists what changed in the last 24 hours | `find(1)` `-mtime n`: "last modified less than, more than or exactly n*24 hours ago"; R8: after `touch -d "2 days ago" note.txt`, it was the only file left out |

## Tasks, hints and boss

| Claim | Evidence |
|---|---|
| Every level-3 hint, spell and recap line works | SIM: the solve, the "every command runs" test; R8 the same lines |
| Near note: an unquoted pattern became a name ("find looked for the exact name ...") | R8 rows above; SIM `find .. -name *.gem` prints only `../floor1/ruby.gem` |
| Boss: `find ~/tower -name "*.scale"` finds the scale; `grep NAME` and its path prints the `NAME:` line | R8: `NAME: Ejtfcx`; SIM boss tests on 12 seeds |
| The scale and its two new directories stay off the map until an ls lists them | the boss's `hidden` hook (AUTHORING section 2); the map's conceal removes each listed path |

## Simulator differences found (not fixed here; reported)

- `grep -r PATTERN FILE` with a single file operand: real grep prints the line without a file name
  (`A blood-red ruby. Worth 300 gold.`); the simulator prefixes `tower/floor1/ruby.gem:`.
- `find tower -name a.gem b.gem` (an unquoted pattern that matched two names): real find prints
  "paths must precede expression: `b.gem'" and "possible unquoted pattern after predicate `-name'?";
  the simulator prints "find: unknown predicate `b.gem'". Both exit 1.
- `find -mtime` (field only) is not simulated.
- Output order: real `find` and `grep -r` follow directory order (unspecified); the simulator sorts.
  The chapter makes no claim about order.
