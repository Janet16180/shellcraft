# Chapter 15, The Guild: checked in real bash

Ubuntu 24.04, bash 5.2, coreutils 9.4 (Docker image `shellcraft-difftest`). Users made with
groupadd/useradd/usermod to match the chapter's /etc/passwd and /etc/group, then run as hero.

| Claim | Real result |
|---|---|
| `id` after joining scribes | `uid=1000(hero) gid=1000(hero) groups=1000(hero),1101(scribes)` |
| `id mira` / `id oren` | `uid=1001(mira) gid=1001(mira) groups=1001(mira),1100(smiths)`, oren likewise with 1002 |
| `groups mira` | `mira : mira smiths` |
| A home with mode 750 | `drwxr-x--- 2 mira mira ...` |
| ledger.txt tamsin:scribes 640 is readable by a scribe | prints it |
| plans.txt mira:smiths 640, hero not a smith | `cat: /srv/guild/plans.txt: Permission denied` |
| The owner of a `----r--r--` file is refused | `cat: /home/hero/guild/notice.txt: Permission denied` |
| `chmod u+r` then `cat` | prints it |
| Groups are fixed at login (lesson's "why") | usermod -aG changes /etc/group; a running shell keeps its groups until a new login (`newgrp` or log in again) |
