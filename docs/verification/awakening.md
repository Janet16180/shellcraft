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
| The prompt reads `hero@kernelia:~$` | R3/R5: `hero@kernelia:~$`; `/etc/skel/.bashrc` line 62: `PS1='${debian_chroot:+($debian_chroot)}\u@\h:\w\$ '` |
| `hero` is the user name, `kernelia` the machine | `bash(1)` PROMPTING: `\u the username of the current user`, `\h the hostname up to the first '.'` |
| After the colon comes the directory; `~` is short for the home, `/home/hero` | `bash(1)`: `\w the value of the PWD shell variable ($PWD), with $HOME abbreviated with a tilde`; R3: `hero@kernelia:~/forest$` |
| `$` means a normal user, root gets `#` | `bash(1)`: `\$ if the effective UID is 0, a #, otherwise a $`; R5: `root@kernelia:/#` |
| Commands are case-sensitive: `ls` works, `LS` does not | D: `LS` -> `bash: LS: command not found`, status 127; SIM test "the lesson shows LS as a command that does not exist" |
| `whoami` prints your user name | `whoami(1)`: "print effective user name"; R2: `hero` |
| `pwd` prints the full path of the directory you are in; print working directory | `pwd(1)`: "print name of current/working directory"; R2: `/home/hero` |
| `ls` lists what is in the directory you are in | `ls(1)`: "List information about the FILEs (the current directory by default)" |
| `cat readme.txt` prints the file on the screen | `cat(1)`: "concatenate files and print on the standard output"; R2 printed the readme |
| `clear` wipes the screen; Ctrl+L clears it too | `clear(1)`: "clear the terminal screen"; `bash(1)` readline `clear-screen (C-l)`: "Clear the screen, then redraw the current line". Wording avoids "the same": `clear` also erases the scrollback (E3), Ctrl+L does not |
| `man ls` opens the manual page; on a real machine in a viewer, arrow keys scroll, `q` quits | `man(1)` `-P`: "By default, man uses pager"; on Ubuntu `/usr/bin/pager` resolves to `/usr/bin/less`; `less(1)`: `q` "Exits less" |
| Many commands print a short summary with `--help` (two dashes): `ls --help` | D: `ls --help`, `cat --help`, `whoami --help` print `Usage: ...`, status 0 (GNU coreutils). Not all: `clear --help` is an invalid option (status 1), so the lesson says "many" |
| A word after a command is an argument | `bash(1)` Simple Commands: "The first word specifies the command to be executed ... The remaining words are passed as arguments" |
| `ls forest` lists the forest without walking into it | R2: `ls forest` printed `cave clearing river`, the next `pwd` was still `/home/hero` |

## Tasks and hints

| Claim | Evidence |
|---|---|
| Hint: the command is who am i, written as one word | `whoami(1)` |
| Hint: pwd means print working directory | `pwd(1)` NAME |
| Hint: ls lists the directory you are in | `ls(1)` |
| Hint: cat followed by a file name prints that file | `cat(1)` |
| Hint: man followed by a command name opens its manual page | `man(1)` |
| Hint: add `--help` after the command name | D (above) |
| Hint: the command is the plain English word clear | `clear(1)` |
| Near-misses fail for the right reason on real bash: `Whoami`, `PWD`, `cls` are unknown commands; `ls -help` is an invalid option; `help ls` finds no help topic | D: `bash: Whoami: command not found`; `bash: cls: command not found`; `ls: invalid option -- 'e'` status 2; `help: no help topics match 'ls'` status 1 |
| Checks: each task has a near-miss that does not pass and a line that does | SIM: 11 near-miss tests |

## Boss: The Forged Letters

| Claim | Evidence |
|---|---|
| Riddles: whoami "prints your user name", pwd "prints the full path of the directory you are in", ls "lists what is in a directory", cat "prints a file on the screen", clear "wipes the screen" | the NAME lines of `whoami(1)`, `pwd(1)`, `ls(1)`, `cat(1)`, `clear(1)` |
| Every asked manual page exists on Ubuntu | host `man -w` finds whoami, pwd, ls, cat, clear |
| Quick help is only asked of whoami, ls and cat | D: those exit 0 with `--help`; `pwd --help` exits 2 (bash builtin) and `clear --help` is an invalid option |
| The real letter is told apart by its signature, the one in readme.txt | SIM: exactly one of the four letters ends with `-- The Guardian of Root` for 10 seeds |
| Forged deeds, and the right command asked the other way, do not beat the boss | SIM tests |

## Adventure log, spells, recap, field

| Claim | Evidence |
|---|---|
| why: the prompt tells you who you are, where you are, and on which machine | `bash(1)` `\u`, `\h`, `\w` |
| why: the manual lives on the machine itself; minimal systems like Docker images leave the pages out | `/usr/share/man` on the host; D: `man` in `ubuntu:24.04` prints "This system has been minimized by removing packages and content that are not required on a system that users do not log into" |
| spell: cat is short for concatenate; `cat -n` numbers lines | `cat(1)`: "concatenate files", `-n, --number number all output lines` |
| field: `hostname` prints the machine name, the part of the prompt after the @ | `hostname(1)`: "show or set the system's host name"; `bash(1)` `\h` |
| field: `man -k WORD` searches the manual pages' short descriptions | `man(1)` `-k, --apropos`: "Search the short manual page descriptions for keywords" |
| field: `man man` is the manual of the manual | `man(1)` |

## Simulator notes (not facts the game teaches)

- The simulator prints man pages at once with a note that a real one opens in a pager.
- `clear --help` and `pwd --help` succeed in the simulator; real ones fail (reported to `shell`).
  The quick-help task accepts any command that answers `--help` with status 0, so on real bash
  `ls --help`, `cat --help` or `whoami --help` complete it.
