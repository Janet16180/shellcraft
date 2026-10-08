# Chapter 18, The Crown: checked in real bash and sudo

Ubuntu 24.04, bash 5.2, sudo 1.9.15 (Docker image `shellcraft-difftest`), hero in group sudo,
password `dragon`. See also docs/verification/sudo.md from the engine work.

| Claim | Real result |
|---|---|
| `sudo whoami` | `root` |
| `sudo echo hi >> /etc/motd`: the shell opens the file, not root | `bash: /etc/motd: Permission denied` |
| `echo The steward is hero. \| sudo tee -a /etc/motd` prints the line and appends it | prints it; `tail -1 /etc/motd` shows it |
| Only root may give a file away | as hero: `chown: ... Operation not permitted`; `sudo chown mira sword.txt` works |
| `sudo -k` forgets the password | the next `sudo -n true` says `sudo: a password is required` |
| sudo asks for your own password and shows nothing while you type | yes (`[sudo] password for hero:`) |
| The timestamp lasts 15 minutes | Ubuntu default `timestamp_timeout` 15 |
