# sudo in the simulator: checked on real Ubuntu

Ubuntu 24.04 (`shellcraft-difftest` plus `apt-get install sudo expect rsyslog`), sudo 1.9.15p5,
hero in or out of group `sudo`, password set with `chpasswd`, driven through a real terminal with
`expect`. The non-interactive parts are also difftest cases (`difftest/cases/16-sudo.json`).

| Claim | Real result |
|---|---|
| The prompt is `[sudo] password for hero: ` on the terminal, then a newline | built with `--with-passprompt=[sudo] password for %p: `; seen as typed |
| The timestamp lasts 15 minutes | `sudo -V` as root: `--with-timeout=15`; a second `sudo` within it does not ask |
| A wrong password: `Sorry, try again.`, three tries, then `sudo: 3 incorrect password attempts`, status 1 | as written; an empty line counts as a wrong try |
| Ctrl+C at the prompt: `sudo: a password is required` (after a wrong try: `sudo: 1 incorrect password attempt`), status 1, and the rest of the line runs | `sudo -k; sudo ls /root; echo after` printed the message, then `after` |
| Outside sudoers, sudo asks for the password first, then refuses | `hero is not in the sudoers file.` status 1 (no "This incident will be reported" in 1.9.15) |
| `sudo -l` / `sudo -v` outside sudoers | `Sorry, user hero may not run sudo on HOST.` status 1 |
| A command the rules do not allow | `Sorry, user hero is not allowed to execute '/usr/bin/ls' as root on HOST.` |
| `sudo -l` with only NOPASSWD rules does not ask; with `%sudo` only it does | as written (listpw=any); `sudo -v` asks unless every rule is NOPASSWD (verifypw=all) |
| `sudo -l` wraps its Defaults line at the terminal width, not when piped | 80 columns: `env_reset, mail_badpass,` then `secure_path=...,` then `use_pty`; one line through `cat` |
| `sudo cd` | four lines: `command not found`, `"cd" is a shell built-in command...`, the `-s` and `-D` hints; other builtins (`alias`, `history`) get only the first |
| `sudo echo x > /etc/f` is refused by the shell | `bash: /etc/f: Permission denied` |
| `echo x \| sudo tee /etc/f` writes it, owned by root | `-rw-r--r-- 1 root root 2 ... /etc/f` |
| `sudo -u mira touch m` gives `-rw-rw-r-- mira mira` (pam_umask, user private group); `sudo touch r` gives `-rw-r--r-- root root` | as written |
| `sudo -u nosuch whoami` | `sudo: unknown user nosuch` and `sudo: error initializing audit plugin sudoers_audit`, status 1, no prompt |
| `sudo -l -u mira` without a command is a usage error | prints the usage, status 1 |
| `/var/log/auth.log` lines | `sudo:     hero : TTY=pts/0 ; PWD=... ; USER=root ; COMMAND=/usr/bin/whoami`, then `pam_unix(sudo:session): session opened for user root(uid=0) by hero(uid=1000)` and `session closed for user root`; failures log `pam_unix(sudo:auth): authentication failure; ...` and `3 incorrect password attempts ; ...`; strangers `user NOT in sudoers ; ...` |
| `/usr/bin/sudo` is setuid root | `-rwsr-xr-x 1 root root` |

Kept different on purpose: in the container auth.log showed `******` instead of `PWD=...` and an empty
`logname=` (no login session there); the simulator writes what a real login session logs. The
difftest world adds `Defaults !use_pty` so sudo does not relay the case's remaining input.
