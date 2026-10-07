# Verification log: chapter 1, The Awakening (`src/game/chapters/awakening.js`)

Reference system and runs R1 to R4 as in `world.md`. Also:
- **R5:** interactive `bash -i` under `script` (keystrokes fed in), as hero and as root, with
  Ubuntu's `/etc/skel/.bashrc`.
- **D:** one-off Docker runs: `LS`, `Whoami`, `cls`, `ls -help`, `help ls`, `--help` of ls, cat,
  whoami, pwd, clear, man (output and status recorded below).
- **SIM:** the chapter tests on the simulator (`test/game/chapters/awakening.test.js`).
Man pages from the Ubuntu 24.04 host.

## Lesson

| Claim | Evidence |
|---|---|
| The prompt reads `hero@kernelia:~$` and names you, the machine and the directory (the lesson points back to the intro, and to its Replay intro button for players who skipped it: `index.html` `#introBtn`) | R3/R5: `hero@kernelia:~$`; `/etc/skel/.bashrc` line 62: `PS1='${debian_chroot:+($debian_chroot)}\u@\h:\w\$ '` |
| (removed from the lesson in round 2; the intro explains it) `hero` is the user name, `kernelia` the machine | `bash(1)` PROMPTING: `\u the username of the current user`, `\h the hostname up to the first '.'` |
| `~` in the prompt is short for the home, `/home/hero` | `bash(1)`: `\w the value of the PWD shell variable ($PWD), with $HOME abbreviated with a tilde`; R3: `hero@kernelia:~/forest$` |
| `$` means you are a normal user; root, the administrator, gets `#` (back in the lesson for players who skip the intro) | `bash(1)`: `\$ if the effective UID is 0, a #, otherwise a $`; R5: `root@kernelia:/#` |
| Commands are case-sensitive: `ls` works, `LS` does not | D: `LS` -> `bash: LS: command not found`, status 127; SIM test "the lesson shows LS as a command that does not exist" |
| `whoami` prints your user name | `whoami(1)`: "print effective user name"; R2: `hero` |
| `pwd` prints the full path of the directory you are in; print working directory | `pwd(1)`: "print name of current/working directory"; R2: `/home/hero` |
| `ls` lists what is in the directory you are in | `ls(1)`: "List information about the FILEs (the current directory by default)" |
| `cat readme.txt` prints the file on the screen | `cat(1)`: "concatenate files and print on the standard output"; R2 printed the readme |
| `clear` wipes the screen; Ctrl+L clears it too | `clear(1)`: "clear the terminal screen"; `bash(1)` readline `clear-screen (C-l)`: "Clear the screen, then redraw the current line". Wording avoids "the same": `clear` also erases the scrollback (E3), Ctrl+L does not |
| `man ls` opens the manual page; on a real machine in a viewer, arrow keys scroll, `q` quits | `man(1)` `-P`: "By default, man uses pager"; on Ubuntu `/usr/bin/pager` resolves to `/usr/bin/less`; `less(1)`: `q` "Exits less" |
| Many commands print a short summary with `--help` (two dashes): `ls --help` | D: `ls --help`, `cat --help`, `whoami --help` print `Usage: ...`, status 0 (GNU coreutils). Bash builtins print help on stdout but exit 2 (`pwd --help`: `pwd: pwd [-LP]`, status 2). Not all: `clear --help` is an invalid option, status 1, nothing on stdout. Hence "many". The task counts any command that printed help for `--help` (stdout not empty), so `pwd --help` counts and `clear --help` or `LS --help` do not. `echo --help` does not count either: bash's echo prints `--help` back (D, factcheck 2026-10-06: output `--help`, status 0), which the check passed until the factcheck review |
| A word after a command is an argument | `bash(1)` Simple Commands: "The first word specifies the command to be executed ... The remaining words are passed as arguments" |
| `ls forest` lists the forest without walking into it | R2: `ls forest` printed `cave clearing river`, the next `pwd` was still `/home/hero` |

## Tasks and hints

| Claim | Evidence |
|---|---|
| Hint: the command is who am i, written as one word | `whoami(1)` |
| Hint: pwd means print working directory | `pwd(1)` NAME |
| Hint: ls lists the directory you are in | `ls(1)` |
| Hint: cat followed by a file name prints that file | `cat(1)` |
| Hint: most commands come with a manual (not all: bash builtins like `cd` have none, `man cd` -> "No manual entry for cd") | host `man -w cd` fails; `man -w ls` succeeds |
| Hint: man followed by a command name opens its manual page | `man(1)` |
| Hint: add `--help` after the command name | D (above) |
| Hint: the command is the plain English word clear | `clear(1)` |
| Near-misses fail for the right reason on real bash: `Whoami`, `PWD`, `cls` are unknown commands; `ls -help` is an invalid option; `help ls` finds no help topic | D: `bash: Whoami: command not found`; `bash: cls: command not found`; `ls: invalid option -- 'e'` status 2; `help: no help topics match 'ls'` status 1 |
| Checks: each task has a near-miss that does not pass and a line that does | SIM: 15 near-miss tests (e.g. `LS --help` fails, `cat .bashrc` reads the wrong file). Each check survived mutation testing: removing any one condition makes a test fail |

## Tips (one sentence per task, shown with the goal)

| Tip | Evidence |
|---|---|
| `whoami` prints your user name, the name before the @ in the prompt | `whoami(1)`; `bash(1)` `\u` before `@` in Ubuntu's PS1 |
| `pwd`, `ls` on its own, `cat FILE`, `man COMMAND` | the lesson rows above |
| Many commands print a short summary with `--help` (two dashes) | the `--help` lesson row above |
| `clear` wipes the screen; Ctrl+L does too | the clear lesson row above |

## Near notes (shown when a line got close the wrong way)

| Note | Evidence |
|---|---|
| Look around: "That listed another directory. To look around your home, run ls in your home with nothing after it." | `ls(1)`: with no FILE, the current directory |
| Read the letter: "ls only shows the name. cat prints what is inside: cat readme.txt" | `ls(1)` lists names; `cat(1)` prints contents; R2 |
| Read the letter: "That was another file. The letter is readme.txt." | game text; `readme.txt` is the letter (world.md) |
| Quick help: `ls -help` is left to the generic coach (`src/game/coach.js`: "One dash starts short options... Long options take two dashes: --help."); a test checks the coach answers it |
| Factcheck 2026-10-06 on the coach's `-help` note: "One dash starts short options" does not hold for every command, so it should read "For most commands, one dash starts short options, ..." (sent to engine for `coach.js`) | D: `ls -help` -> `ls: invalid option -- 'e'` (read letter by letter); but GNU `find -help` prints find's usage, status 0 (`find(1)`: "-help, --help"), and find's tests are one-dash words (`-name`), taught in a later chapter. `man -help` on man-db 2.12 prints man's help, status 0, because `-h` is man's short help option |
| Quick help: "echo prints its words back, even --help." | D: `echo --help` prints `--help`, status 0 (`echo` is a shell builtin with no `--help`) |
| Clear task goal says only "Wipe the screen clean" (2026-10-07, content rule 9); its tip names `clear` and says Ctrl+L does not count for the task | Ctrl+L is handled by the page's terminal, so the session cannot see it; the lesson keeps "Ctrl+L clears it too" (true, see above) |
| Boss: a `cat` of a name that does not exist gets "There is no file by that name. Run ls and copy the full name that starts with note_."; a `cat` of another file gets "That was another file. The new note's name starts with note_: ls shows it." | game text (SIM tests) |

## Boss: A New Note

| Claim | Evidence |
|---|---|
| `ls` in the home shows the new note's name next to the other entries | R (2026-10-07): `ls` in a home holding `forest/` and `note_k7m` printed both names |
| `cat` and the name prints the note | R: `cat note_k7m` printed its text |
| The note's name starts with `note_` and ends with a few random letters | SIM: the name is one of the fixed `NOTES` list (`note_` plus three letters from the safe token alphabet), picked by the seed; the awakening and forest setups remove every name on the list |
| Hint 3 `cat note_XXX` solves it from the home | SIM: the boss solve over 10 seeds |

## Adventure log, spells, recap, field

| Claim | Evidence |
|---|---|
| why: the prompt tells you who you are, where you are, and on which machine | `bash(1)` `\u`, `\h`, `\w` |
| why: the manual lives on the machine itself; minimal systems like many Docker images leave the pages out (was "like Docker images": not all of them do) | `/usr/share/man` on the host; D: `man` in `ubuntu:24.04` prints "This system has been minimized by removing packages and content that are not required on a system that users do not log into". Factcheck 2026-10-06: `ubuntu:24.04` and `quay.io/pypa/manylinux2014_x86_64` have no `/usr/share/man/man1` pages, but `mysql:latest` ships 155 of them, so "many", not all |
| spell: cat is short for concatenate; `cat -n` numbers lines | `cat(1)`: "concatenate files", `-n, --number number all output lines` |
| field: `hostname` prints the machine name, the part of the prompt after the @ | `hostname(1)`: "show or set the system's host name"; `bash(1)` `\h` |
| field: `man -k WORD` searches the manual pages' short descriptions | `man(1)` `-k, --apropos`: "Search the short manual page descriptions for keywords" |
| field: `man man` is the manual of the manual | `man(1)` |

## Simulator notes (not facts the game teaches)

- The simulator prints man pages at once with a note that a real one opens in a pager.
- Since shell's bdbffc2 the simulator matches real bash for `pwd --help` (help, status 2),
  `clear --help` (invalid option, status 1) and `man cd` (no entry, status 16). `ls`, `cat` and
  `whoami --help` print a shorter usage than coreutils' full text (an intended difference).
  The quick-help task accepts any command except `echo` that prints something on stdout for
  `--help`, whatever its status, so on real bash `ls --help`, `cat --help`, `whoami --help` or
  `pwd --help` (status 2) complete it. (Was "with status 0", which contradicted the check and the
  lesson row above; corrected by the factcheck review.)
- Factcheck 2026-10-06, still differing from real bash in chapter 1 (sent to shell): `whoami -help`
  prints "extra operand" (real: `whoami: invalid option -- 'h'`, status 1); `whoami --version`,
  `cat --version`, `ls --version` fail (real: version text, status 0); `pwd -help` prints the path
  (real: `bash: pwd: -h: invalid option`, `pwd: usage: pwd [-LP]`, status 2); `man -k WORD` and
  `man 1 ls` print "No manual entry for -k" / "for 1"; `who am i` is "command not found" (real:
  `/usr/bin/who`, coreutils). The `whoami` and `pwd` pages show synopses `whoami` and `pwd`
  (real: `whoami [OPTION]...`, `pwd [OPTION]...`).
