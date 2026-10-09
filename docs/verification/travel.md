# Chapter 21, Pack and Travel: checked in real bash

Ubuntu 24.04, GNU tar 1.35, gzip 1.12, file 5.45 (Docker image `shellcraft-difftest`), as hero.
More cases: difftest/cases/18-archives.json.

| Claim | Real result |
|---|---|
| `du -sh DIR` prints one total in K/M/G | `8.0K	library` |
| `tar -tf` lists members, directories with a trailing `/` | `library/`, `library/scroll_of_ages.txt` |
| `file` names a tar archive and gzip data | `POSIX tar archive (GNU)`, `gzip compressed data, from Unix, ...` |
| `-C DIR` must exist | `tar: travel/unpacked: Cannot open: No such file or directory`, status 2 |
| `tar -xzf ... -C DIR` unpacks into DIR | `ls` shows `library` |
| `gzip FILE` replaces FILE with FILE.gz | `notes.txt.gz`, no `notes.txt` |
| `zcat FILE.gz` prints the text | `n` |
