# Verification log: chapter 14, Forge Your Own Spell (`src/game/chapters/forge.js`)

Reference system as in `world.md`. R14 (2026-10-08): in the `shellcraft-difftest` image (Ubuntu
24.04, bash 5.2.21) as `hero` via `su`: a `~/forge/ore` with three `.ore` files, scripts written
with `echo '...' >` and `>>`. SIM: `test/game/chapters/forge.test.js`.

## Lesson

| Claim | Evidence |
|---|---|
| `#!/bin/bash` names the program that reads the file; bash skips it as a comment | `execve(2)` "Interpreter scripts"; `bash(1)` COMMENTS |
| `>` makes the file new, `>>` adds to the end | `bash(1)` REDIRECTION; R14: the two lines in order |
| In double quotes, `$1`/`$ore` expand while writing; `!` triggers history expansion | `bash(1)` QUOTING and HISTORY EXPANSION; an interactive bash 5.2: `echo "#!/bin/bash"` prints `bash: !/bin/bash: event not found`. The simulator has no history expansion (it prints the line); the lesson's rule avoids the case |
| Without `x`, running the script gives Permission denied, status 126 | R14: `/home/hero/forge/hello.sh: Permission denied`, status 126 |
| `$1` is the first word after the name; empty when none | R14: `Hello, Tux`, then `Hello,` |
| `for ore in *.ore` runs once per matching name | R14: three `Smelting` lines in `~/forge/ore` |
| Where nothing matches, `*.ore` stays as typed | R14: `Smelting *.ore` from home |
| The loop variable keeps its last value after the loop | R14: `after=silver.ore` (a near note relies on this: a double-quoted loop line written later saves that value) |
| A script runs in its own shell starting in your directory; its `cd` does not move you | R14: `smelt.sh` with `cd ~/forge/ore` printed the three ores from home, `pwd` stayed `/home/hero` |
