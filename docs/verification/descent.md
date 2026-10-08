# Verification log: chapter 10, The Descent (`src/game/chapters/descent.js`)

Reference system as in `world.md`. R10 (2026-10-08): the chapter's lines run in the
`shellcraft-difftest` image (Ubuntu 24.04, bash 5.2.21, coreutils 9.4, `LC_ALL=C.UTF-8`, host
`kernelia`), as `hero` via `su`, with a 0640 `syslog:adm` file at `/var/log/syslog` and the boss
command written to `/usr/local/bin/glimmer` (mode 755) as `boss.setup` writes it. SIM:
`test/game/chapters/descent.test.js` (the same lines on the simulator, with outputs compared).

## Lesson

| Claim | Evidence |
|---|---|
| Every absolute path starts at `/`, the root directory, the top of the filesystem | `path_resolution(7)`: "If the pathname starts with the '/' character, the starting lookup directory is the root directory"; R10: `ls /` lists bin, boot, dev, etc, home, ... var. The simulator shows only the directories the world defines (`world.md`) |
| `/etc` holds the system's settings as plain text files | `hier(7)`: "/etc Contains configuration files"; R10: `cat /etc/hostname` printed `kernelia` |
| `/etc/passwd` has one line per account and holds no passwords | `passwd(5)`: "each line ... describes a user account"; the password field is `x`, "the encrypted password is stored in /etc/shadow"; R10: `head -1 /etc/passwd` printed `root:x:0:0:root:/root:/bin/bash` |
| `/var/log` holds logs; new lines go at the end | `hier(7)`: "/var/log Miscellaneous log files"; rsyslog and dpkg append (`dpkg.log` grows with each run) |
| `tail -n 3 FILE` prints the last 3 lines | `tail(1)`: "-n, --lines=[+]NUM output the last NUM lines"; R10: on a 4-line file it printed b, c, d; `tail -3` printed the same |
| Reading a file you may not read gives "Permission denied" | R10: `cat /var/log/syslog` printed `cat: /var/log/syslog: Permission denied`, status 1; SIM prints the same bytes |
| bash looks through `PATH`'s directories in order and runs the first match | `bash(1)` COMMAND EXECUTION: "the shell searches each element of the PATH for a directory containing an executable file by that name" |
| `$` in front of a name stands for its value; `echo $PATH` prints the list joined by `:` | `bash(1)` Parameter Expansion; PATH: "A colon-separated list of directories"; R10: `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` (login PATH of a fresh container; `su` adds games and snap dirs) |
| `which ls` prints the file that runs | R10: `/usr/bin/ls` |
| `cd` is part of bash; `which cd` finds nothing; `type cd` asks bash | R10: `which cd` printed nothing, status 1; `ls /usr/bin/cd`: No such file or directory; `type cd` printed `cd is a shell builtin` |
| Root, the user, and `/`, the root directory, are different things that share a name | `hier(7)` ("/ This is the root directory"); `passwd(5)` line for user root |

## Tasks, tips, hints and near notes

| Claim | Evidence |
|---|---|
| `hostname` prints the name too | R10: `hostname` printed `kernelia` |
| Typing `$PATH` alone makes bash try to run the value | R10: `bash: ...: No such file or directory`, status 127 |
| Without the `$`, `echo PATH` prints the word | R10: printed `PATH` |
| `head` prints the first, oldest lines | `head(1)`: "Print the first 10 lines"; logs are appended, so the first are the oldest |

## Boss

| Claim | Evidence |
|---|---|
| A command put in `/usr/local/bin` runs by its name alone | R10: `which glimmer` printed `/usr/local/bin/glimmer`; `glimmer` printed both lines, status 0 |
| `/usr/local/bin` is in PATH, and a fresh Ubuntu has empty `bin etc games include lib man sbin share src` under `/usr/local` | R10: `ls /usr/local`; `echo $PATH` |
| Programs installed by hand usually go in `/usr/local/bin` | `hier(7)`: "/usr/local This is where programs which are local to the site typically go."; `file-hierarchy(7)` |
| `guardian.log` is a story log, readable by all (0644), written by the boss setup | story; the format copies rsyslog's ISO timestamp lines in `world.md` |

## Why

| Claim | Evidence |
|---|---|
| Each process has its own working directory, so a `cd` program could not change the shell's | `chdir(2)`: "changes the current working directory of the calling process"; `bash(1)` lists `cd` under SHELL BUILTIN COMMANDS |
