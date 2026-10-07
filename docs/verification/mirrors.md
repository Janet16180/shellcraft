# Verification log: chapter 6, Hall of Mirrors (`src/game/chapters/mirrors.js`)

Reference system as in `world.md`. R8 (2026-10-07): the chapter's hall (`mirror1.txt` to `mirror5.txt`,
`mirror12.txt`, `mirror30.txt`, three `.shard` files, `magic mirror.txt`, `portrait.txt`) built in a scratch
home and played in real bash 5.2.21 with GNU coreutils 9.4 (`LC_ALL=C.UTF-8`), with `set -v` and `set -x`
tracing. SIM: `test/game/chapters/mirrors.test.js` (the same lines in the simulator). Man pages from the
Ubuntu 24.04 host.

## Lesson

| Claim | Evidence |
|---|---|
| `*` matches any characters, any number, even none; `mirror*` matches `mirror1.txt` and `mirror30.txt`; `*.shard` matches names ending in `.shard` | `bash(1)` Pattern Matching: "`*` Matches any string, including the null string."; R8: `ls ~/mirrors/mirror*` listed the seven mirrors, `ls ~/mirrors/*.shard` the three shards |
| `?` matches exactly one character: `mirror?.txt` matches `mirror4.txt`, not `mirror12.txt` | `bash(1)`: "`?` Matches any single character."; R8: `ls ~/mirrors/mirror?.txt` listed mirror1 to mirror5 only |
| `[1-3]` matches one character from the brackets: 1, 2 or 3; `[ac]` matches `a` or `c` | `bash(1)`: "`[...]` Matches any one of the enclosed characters. A pair of characters separated by a hyphen denotes a range expression"; R8: `mirror[1-3].txt` listed mirror1 to mirror3; in a directory with `a b c`, `echo [ac]` printed `a c` |
| Bash expands the pattern before the command runs, replacing it with every matching name in order; `ls` never sees the `?` | `bash(1)` Pathname Expansion: "the word is regarded as a pattern, and replaced with an alphabetically sorted list of filenames matching the pattern"; R8 `set -x` trace of `ls ~/mirrors/mirror?.txt`: `+ ls .../mirror1.txt .../mirror2.txt .../mirror3.txt .../mirror4.txt .../mirror5.txt` (five names, no `?`) |
| Given file names, `ls` lists just those names | R8: the listings above show only the operands, not the directory |
| If nothing matches, bash leaves the pattern as it is, and `ls` says it cannot find it | `bash(1)`: "If no matching filenames are found, and the shell option nullglob is not enabled, the word is left unchanged."; R8: `shopt` showed nullglob and failglob off; `ls ~/mirrors/zz*` printed "ls: cannot access '.../mirrors/zz*': No such file or directory"; `echo ~/mirrors/zz*` printed the pattern |
| Quotes stop the expansion; inside quotes `*` is just a star | `bash(1)` QUOTING: double quotes preserve "the literal value of all characters within the quotes, with the exception of $, `, \, and ... !"; R8: `echo "*"` printed `*`; `ls ~/mirrors/"*.shard"` printed "cannot access '.../*.shard'" |
| Bash splits a line into words at spaces, so `cat magic mirror.txt` asks for two files | `bash(1)` DEFINITIONS: a metacharacter "when unquoted, separates words", including space; R8: `cat magic mirror.txt` printed "cat: magic: No such file or directory" and "cat: mirror.txt: No such file or directory" |
| `cat "magic mirror.txt"` reads it | R8 (inside the hall): printed the file |
| Inside quotes `~` is just a character; keep it outside: `cat ~/mirrors/"magic mirror.txt"` | `bash(1)` Tilde Expansion: "If a word begins with an unquoted tilde character"; R8: `cat "~/mirrors/magic mirror.txt"` printed "cat: '~/mirrors/magic mirror.txt': No such file or directory"; `cat ~/mirrors/"magic mirror.txt"` printed the file |
| `rm` with a pattern removes every match at once | R8: `rm ~/mirrors/*.shard` removed all three shards; `ls ~/mirrors` showed every mirror, the magic mirror and the portrait still there |
| `rm` removes for good | `rm(1)`: "rm removes each specified file"; it has no option to restore and moves nothing to a trash; R8: the shards were gone after `rm` |

## Why and field

| Claim | Evidence |
|---|---|
| Every command gets patterns for free: it receives a list of names | Pathname Expansion (above) happens in bash before any command runs; R8: `printf "[%s]\n" ~/mirrors/mirror?.txt` printed five separate arguments |
| Each word becomes one argument; a backslash before the space keeps the name whole | `bash(1)` QUOTING: "A non-quoted backslash (\) is the escape character"; R8: `cat ~/mirrors/magic\ mirror.txt` printed the file |
| `mirror*` also matches `mirror30.txt` | R8 (above) |
| `ls` or `echo` with the same pattern shows the names `rm` would get | the expansion is done by bash, the same for every command; R8: `echo ~/mirrors/*.shard` printed the same three names `rm` then removed |
| `echo PATTERN` shows the names without touching the files | R8: `echo ~/mirrors/*.shard` left the shards in place until the `rm` |
| `ls *.txt` lists names ending in `.txt` | R8 (inside the hall): nine `.txt` names |
| `ls -d ~/f*` lists matching directories by name, not their contents | `ls(1)` `-d`: "list directories themselves, not their contents"; R8: `ls -d ~/m*` printed the `mirrors` path, `ls ~/m*` its contents |
| `rm -i *.tmp` asks before each removal | `rm(1)` `-i`: "prompt before every removal"; R8: `rm -i *.tmp` asked about `x.tmp` and `y.tmp`; answering n kept `x.tmp`, y removed `y.tmp` |

## Tasks, hints and boss

| Claim | Evidence |
|---|---|
| Near note: an operand that still holds `*`, `?` or `[` and names no file means nothing matched or it was quoted | R8: `ls ~/mirrors/zz*` and `ls ~/mirrors/"*.shard"` both passed the pattern unchanged to `ls` |
| Near note: `cat ~/mirrors/magic mirror.txt` looks for `magic` and `mirror.txt` | R8 (above) |
| Near note: `rm` has no undo; restarting the chapter rebuilds the hall | the chapter's setup removes and rebuilds `~/mirrors` (SIM: setup after the solve and after the boss room) |
| Checks see the names after expansion (`CommandRecord.args`, `src/backend/port.js`), so typing every name out also passes | SIM: `rm` of the three shard paths passes the sweep task |
| Boss: `rm ~/mirrors/cracked_*` removes every cracked mirror and keeps every whole one | SIM boss tests on 12 seeds; the same expansion as `*.shard` in R8 |
| Boss mirrors stay off the map until an ls lists the hall (or the mirror itself) | the boss's `hidden` hook (AUTHORING section 2), uncovered by `session.js` `lists` |
