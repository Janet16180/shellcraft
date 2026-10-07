# Verification log: chapter 11, The Sealed Gate (`src/game/chapters/gate.js`)

Reference system as in `world.md`. R11 (2026-10-08): the chapter's lines run in the
`shellcraft-difftest` image (Ubuntu 24.04, bash 5.2.21, coreutils 9.4) as `hero` via `su`, on a
script like `open_gate.sh` (mode 644 and 664), a mode-000 script, and a directory. SIM:
`test/game/chapters/gate.test.js` (the same lines on the simulator, outputs compared).

Umask: a `su` or SSH login on Ubuntu gets umask `0002` from pam_umask (`USERGROUPS_ENAB yes` in
`/etc/login.defs`, for accounts whose group has their name); `docker run --user` without PAM gets
`0022`, which the simulator uses. No task depends on it: the world's files are written with their
modes, and `chmod +x` on a 644 file gives 755 under either umask (neither masks `x`). The field
entry for `umask` names no value for that reason.

## Lesson

| Claim | Evidence |
|---|---|
| `ls -l`'s first column: the type (`-` file, `d` directory), then rwx for owner, group, others | `ls(1)` info node "What information is listed"; R11: `-rw-rw-r-- 1 hero hero 20 ... s.sh`, `drwx------ 2 root root ... /root` |
| `r` read, `w` write, `x` execute; `-` means missing | `chmod(1)` "The letters rwxXst select file mode bits ... read (r), write (w), execute (or search for directories) (x)" |
| `id` prints the user and the groups | `id(1)`; R11: `uid=1000(hero) gid=1000(hero) groups=1000(hero)`; SIM prints the same bytes |
| Without `x`, `./script` is refused with Permission denied | R11: `./s.sh` on mode 664: `Permission denied`, status 126 |
| `./` means "in this directory"; the name alone is looked up in `$PATH` | R11: `s.sh` alone: `command not found`, status 127, even with mode 775; `bash(1)` COMMAND EXECUTION: "If the command name contains no slashes, the shell attempts to locate it" in PATH |
| `chmod +x FILE` adds execute | R11: 664 became 775; SIM: 644 became 755 (umask 022 does not mask x, nor does 002) |
| Digits: 4 read + 2 write + 1 execute, one digit each for owner, group, others; `chmod 600` gives read and write to you only | `chmod(1)` numeric mode: "4 read, 2 write, 1 execute"; R11: `chmod 600 d` gave `-rw-------` |
| For a directory, `r` lets you list it and `x` lets you go in | `chmod(1)` "execute (or search for directories)"; R11: dir mode 600: `cd dd` Permission denied; mode 300: `ls dd` "cannot open directory" |
| `/root` is `drwx------`: only root may enter | R11: `ls -ld /root`; `ls /root` as hero: `ls: cannot open directory '/root': Permission denied`, status 2; `cd /root`: Permission denied, status 1; SIM prints the same |
| `sudo` runs a command as root for administrators; hero is not one | `sudo(8)`; the difftest image has no sudo installed; the simulator prints Ubuntu's "is not in the sudoers file" message (`world.md`) |

## Tasks, near notes and boss

| Claim | Evidence |
|---|---|
| `bash open_gate.sh` reads the file itself and needs no `x` | R11: `bash s.sh` on mode 664 printed `ok` |
| `chmod 777` lets everyone change the file | R11: `-rwxrwxrwx` |
| A script with `x` but no `r` cannot run: bash must read it | R11: mode 000 then `chmod +x`: `---x--x--x`, `./r.sh` printed `/bin/bash: ./r.sh: Permission denied`, status 126 (the interpreter's message; the simulator prints `bash: ./r.sh: ...`, the same status; logged as a known difference) |
| After `chmod 700`, the owner can run a mode-000 script they own | R11: `chmod 700 r.sh; ./r.sh` printed `hi` |
| The owner may chmod their own file even at mode 000 | `chmod(2)`: "The effective UID of the calling process must match the owner of the file" |

## Why

| Claim | Evidence |
|---|---|
| bash does not look in the current directory unless told (no `.` in PATH) | R10: `echo $PATH` has no `.` or empty entry |
| A script is read line by line by bash | `bash(1)` "bash reads and executes commands from this file" (ARGUMENTS) |
| Each permission is a bit; three bits make a digit 0 to 7 | `chmod(1)` numeric mode |
