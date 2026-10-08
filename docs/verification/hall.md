# Chapter 16, The Shared Hall: checked in real bash

Ubuntu 24.04, bash 5.2, coreutils 9.4 (Docker image `shellcraft-difftest`), as hero in smiths and scribes.

| Claim | Real result |
|---|---|
| `groups` in both factions | `hero smiths scribes` |
| Directory without x: `cd` refused | `bash: cd: hall/vault: Permission denied` |
| Directory with r but no x: `ls` still lists the names | prints `key.txt` |
| Without x, a file inside cannot be read | `cat: hall/vault/key.txt: Permission denied` |
| With x but no r: `ls` refused | `ls: cannot open directory 'hall/vault': Permission denied` |
| With x but no r: a known name can be read | prints the file |
| `rm` in a `dr-xr-xr-x` directory, file itself `rw-` | `rm: cannot remove 'hall/archive/old.txt': Permission denied` |
| After `chmod u+w` on the directory, `rm` works | status 0 |
| `chgrp scribes DIR` for a group you are in | works; `ls -ld` shows `hero scribes` |
| `chgrp` to a group you are not in | refused (sim: `Operation not permitted`, as real for an existing group) |
| From 755, `chmod g+w,o-rx` | `770` |
