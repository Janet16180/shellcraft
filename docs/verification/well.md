# Verification log: chapter 12, Well of Echoes (`src/game/chapters/well.js`)

Reference system as in `world.md`. R12 (2026-10-08): the chapter's solve and the boss line run in the
`shellcraft-difftest` image (Ubuntu 24.04, bash 5.2.21, coreutils 9.4) as `hero` via `su`, in a
`~/well` holding only `sign.txt`, and a `~/well/stones` with two of three stones. SIM:
`test/game/chapters/well.test.js` (the same lines on the simulator, outputs compared).

## Lesson

| Claim | Evidence |
|---|---|
| `wish=gold` makes a variable; no spaces around `=` | `bash(1)` PARAMETERS: "A variable may be assigned to by a statement of the form name=[value]"; with spaces bash runs `wish` as a command (status 127, SIM the same) |
| `$wish` stands for its value; an unset variable expands to nothing | `bash(1)` Parameter Expansion; R12: `echo $wish` printed `gold` |
| Double quotes keep `$` working; single quotes keep everything as typed | `bash(1)` QUOTING; R12: `I wish for gold`, then `I wish for $wish` |
| `$?` is the status of the last command; `0` is success; the next command sets a new one | `bash(1)` Special Parameters and EXIT STATUS; R12: failed `ls` then `echo $?` printed `2`, a second `echo $?` printed `0` |
| `>` sends only stream 1; `2>` sends stream 2 | `bash(1)` REDIRECTION; R12: `errors.txt` held `ls: cannot access '/home/hero/well/bucket.txt': No such file or directory` |
| `/dev/null` throws away what is written | `null(4)`; R12: `2> /dev/null` printed nothing |
| `ls A B > list.txt 2> /dev/null` saves the list and drops the error | R12: list.txt held `/home/hero/well:` then `errors.txt`, `list.txt`, `sign.txt` (the `>` makes list.txt before ls runs, so it lists itself); status 2; SIM the same bytes |
| `A && B` runs B only if A worked; `A \|\| B` only if A failed | `bash(1)` Lists; R12: `mkdir ~/well/deep && cd ~/well/deep` ended in `/home/hero/well/deep`; `cd ~/well/dry \|\| echo the well is dry` printed the error and the words |
| Streams 0, 1, 2; `>` is short for `1>` | `bash(1)` REDIRECTION: "If the file descriptor number is omitted ... the standard output (file descriptor 1)" |

## Tasks, near notes and boss

| Claim | Evidence |
|---|---|
| The cd error reads `bash: cd: /home/hero/well/dry: No such file or directory` | R12 (`bash -c` adds `line 1:`; an interactive shell does not); SIM the same |
| One `cat` of three stones, one missing, with `> words.txt 2> /dev/null` saves the two words and prints nothing | R12: words.txt held `rise` and `light`, nothing on screen, status 1 |
| `ctx.line` judges assignments, which leave no command record | `AUTHORING.md` section 2 |
