# Verification log: the base world (`src/game/world.js`)

Reference system: Ubuntu 24.04 (`ubuntu:24.04` image, 24.04.5 LTS), bash 5.2.21, coreutils 9.4,
`LC_ALL=C.UTF-8`, hostname `kernelia`. Man pages from an Ubuntu 24.04.2 host (same packages).

Runs, all 2026-10-06, `docker run --rm --hostname kernelia -e LC_ALL=C.UTF-8 -e TZ=UTC ubuntu:24.04`:
- **R1 (probe):** `apt-get install rsyslog cron openssh-server adduser`, `adduser --disabled-password hero`
  (full name `Hero`), start `rsyslogd`, `cron`, `sshd`, `logger`, wait for a cron job, read the logs.
- **R2 (world):** the same packages and user, then the base world built from `baseWorld()` by a
  generated script (every node with its owner and mode), then commands run as `hero` with `su hero`.
- **R3 (tab):** an interactive `bash -i` for `hero` under `script`, fed keystrokes.
- **R4 (useradd):** `useradd -m -s /bin/bash -c 'Hero,,,' hero`, then `/etc/passwd`, `/etc/group`, `ls -ld`, `id`.

## Dungeon: owners and modes

| Claim (where) | Evidence |
|---|---|
| `/home` is root:root 0755, the home is hero:hero 0750 | R2 `ls -ld`: `drwxr-xr-x root root /home`, `drwxr-x--- hero hero /home/hero`; `/etc/login.defs` `HOME_MODE 0750` |
| `/root` is root:root 0700; hero cannot enter or list it | R2: `drwx------ root root`; `cd /root` -> `Permission denied` (status 1); `ls /root` -> `cannot open directory '/root': Permission denied` (status 2) |
| `/tmp` is root:root 1777 and hero can create files there | R2: `drwxrwxrwt root root`; `touch /tmp/x` status 0 |
| `/var/log` is root:syslog 0775 once rsyslog is installed | R1/R2: `drwxrwxr-x root syslog /var/log` |
| `/var/log/syslog` and `auth.log` are syslog:adm 0640 | R1: `-rw-r----- syslog adm`; `/etc/rsyslog.conf` lines 37-39 `$FileOwner syslog`, `$FileGroup adm`, `$FileCreateMode 0640` |
| hero cannot read the syslog or auth.log (not in `adm`) | R2: `cat /var/log/syslog` -> `Permission denied`; `access.js` gives others no read bit on 0640 |
| `/var/log/dpkg.log` and `/var/log/apt/history.log` are root:root 0644 | R1 `ls -l`: `-rw-r--r-- root root` for both |
| `/etc/passwd`, `group`, `hostname`, `crontab` are root:root 0644 | R2 `ls -l /etc/...`; base image `stat` |
| hero cannot change files in `/etc` | R2: `touch /etc/x` -> `Permission denied`; `echo hi > /etc/motd` -> `Permission denied` |
| rsyslog is part of a standard Ubuntu 24.04 install | R1 `apt-cache show rsyslog`: `Priority: important`, `Task: minimal` |

## Dungeon: file contents

| Claim (where) | Evidence |
|---|---|
| `/etc/passwd` lines are real | R2 diff against the real file: ours equals it minus `systemd-network`, `systemd-timesync`, `messagebus`, `systemd-resolve` (a subset, same order and fields) |
| hero's line `hero:x:1000:1000:Hero,,,:/home/hero:/bin/bash` | R1: what `adduser` writes when only the full name is given; R4: `useradd -m -s /bin/bash -c 'Hero,,,' hero` writes the same line |
| hero is in the group `hero` only (`id`: `groups=1000(hero)`), as the simulator's `id` prints | R4: `useradd` adds no supplementary group (`users:x:100:` stays empty). `adduser` would also add `users` (R1), so the world follows `useradd` |
| `syslog:x:101:102:...` and `sshd:x:102:65534::/run/sshd:...` | R1 (dynamic system ids in install order; a real machine may differ) |
| `/etc/group` lines are real, `adm:x:4:syslog` | R2 diff: ours equals the real file minus the `systemd-*` and `messagebus` groups (and minus `hero` in `users`, see R4) |
| `/etc/hostname` is `kernelia` | R2 diff: identical |
| `/etc/os-release` content | base image `/usr/lib/os-release`, byte for byte. **Simplification:** on Ubuntu `/etc/os-release` is a symlink to `../usr/lib/os-release`; the spec has no symlinks, so it is a regular file here |
| `/etc/crontab` content, hourly jobs at minute 17 | R1 `cat /etc/crontab` (cron 3.0pl1-184ubuntu2), copied verbatim |
| `/etc/motd`: shown at login | `motd(5)`: "displayed by pam_motd(8) after a successful login". Ubuntu ships no `/etc/motd`; an admin may create one, so ours is an admin's message |
| motd: "most files belong to root: you can read many of them, but you cannot change them" | R2: `/etc` files are root 0644 (readable), writes refused; the syslog files belong to `syslog`, hence "most" and "many" |
| syslog line format `2026-09-25T09:00:02.412577+00:00 kernelia TAG: message` | R1: rsyslog 8.2312 on 24.04 writes RFC 3339 timestamps with microseconds, e.g. `2026-10-06T17:23:22.051148+00:00 kernelia guardian: a new apprentice has awakened` |
| `guardian:`, `watchtower:`, `shadow_daemon:` lines (no PID) | R1: `logger -t guardian "..."` writes `kernelia guardian: ...`; any program can log under any tag. No PIDs, so they never contradict the backend's process table |
| `CRON[1203]: (root) CMD (cd / && run-parts --report /etc/cron.hourly)` at :17 | R1: a cron job logs `CRON[3947]: (root) CMD (true)`; the command is the hourly line of `/etc/crontab`. The PID is a short-lived child, not the cron daemon |
| auth.log `CRON[1202]: pam_unix(cron:session): session opened for user root(uid=0) by root(uid=0)` / `session closed` | R1 auth.log, same format; the session PID is one below the CMD PID, as in R1 (3946 / 3947) |
| auth.log has the cron sessions and syslog does not | R1 `/etc/rsyslog.d/50-default.conf`: `auth,authpriv.* /var/log/auth.log`, `*.*;auth,authpriv.none -/var/log/syslog` |
| `dpkg.log` and `apt/history.log` excerpts | the base image's own logs (last entries), verbatim |

## Overworld text

| Claim (where) | Evidence |
|---|---|
| readme: "Your home, /home/hero, is yours" | R2: every node under the home is hero:hero (generated from the spec) |
| readme: "Outside it lies the dungeon, where most things belong to root" | R2 `ls -la /`, `/etc`, `/var/log`: root except the syslog files |
| readme: "Type hint for a clue" | `hint` is a game command of the session (`src/game/session.js` GAME_COMMANDS), not real Linux |
| readme: `man COMMAND`, `man ls` | `man(1)`: "an interface to the system reference manuals"; placeholder in uppercase (AUTHORING 3.4) |
| secret map: "plain ls skips this file; ls -a shows it" | `ls(1)`: `-a, --all do not ignore entries starting with .`; R2 `ls` in home lists no dot files |
| `.bashrc` first line | Ubuntu `/etc/skel/.bashrc` line 1, verbatim; `ll` and `la` are skel's own aliases |
| fish: "Absolute paths start with a slash, like /home/hero/forest/river" | `path_resolution(7)` Step 1: a pathname starting with `/` starts at the root directory; R2 `cd /home/hero/forest/river` works |
| mushroom: "Lost? Type pwd. Want to go back up? cd .." | `pwd(1)`; `path_resolution(7)`: `..` is the parent; R2 `cd ..` from deep lands in cave |
| scroll: "The third mage typed "rm -rf /*"" (was `rm -rf /`) | GNU `rm` refuses `rm -rf /` by default (`--preserve-root`, `rm(1)`); `/*` expands to every entry under `/`, which preserve-root does not protect |
| scroll: "Plain ls passed them by; ls -a revealed them" (was "Only those who asked with -a could see them", false: `ls -A`, `find` and globs like `.*` see them too) | `ls(1)` `-a`, `-A` |
| scroll: "cron ran the chores on time, sshd kept the gates" (was "cron kept the time": time is kept by systemd-timesyncd) | `cron(8)`: "daemon to execute scheduled commands"; R1 `ssh.service`: `Description=OpenBSD Secure Shell server` |
| scroll: "the ninth signal ended it, for no program can ignore it" (was "Only the ninth signal could end it", false if other signals are not ignored) | `signal(7)`: "The signals SIGKILL and SIGSTOP cannot be caught, blocked, or ignored"; SIGKILL is 9 |
| scroll: "/dev/null devours all output sent its way" | `null(4)`: "Data written to the /dev/null and /dev/zero special files is discarded" |
| scroll: "The number 7 meant all three. The number 4 meant only reading." | `chmod(1)`: read 4, write 2, execute 1 |
| scroll: "tail -f follows a file as it grows"; "less lets you scroll ... (q quits)" | `tail(1)` `-f, --follow output appended data as the file grows`; `less(1)` `q` exits |
| scroll: "The last known dragon sighting was recorded in the syslog" | the syslog has the `watchtower: dragon sighted near /dev/null` line |
| scroll: "Its name was written in the system log, yet few could read it" (was "in every log file, yet no one could read it") | `/var/log/syslog` is syslog:adm 0640: only syslog, the adm group and root can read it (R1, R2) |
| scroll: "plain text lasts, and almost any tool can read it" (was "is eternal and every tool can read it") | softened: no absolute claim |

Other overworld texts (junk, library, tower, market, gate) are v1's, unchanged; their facts belong to
the chapters that use them (3 to 14) and will be checked there.
