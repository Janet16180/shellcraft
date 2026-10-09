# Chapter 19, The Scribe's Memory: checked in real bash

Ubuntu 24.04, bash 5.2 (Docker image `shellcraft-difftest`), as hero. Ctrl+R, Ctrl+A/E/G/L:
docs/verification/terminal-keys.md.

| Claim | Real result |
|---|---|
| A plain variable is not seen by a new shell | `bash -c 'echo [$realm]'` prints `[]` |
| After `export realm` it is | prints `[Kernelia]` |
| An alias works from the next line on, not on the line that makes it | `alias up="cd .."; up` on one line: `bash: up: command not found` |
| `!!` and `!N` print the expanded line, then run it | the line goes to stderr (hidden with `2>/dev/null`), then the output |
| `echo "alias up='cd ..'" >> ~/.bashrc` adds the line as typed | `tail -1 ~/.bashrc` shows `alias up='cd ..'` |
| Every new interactive bash reads ~/.bashrc | Ubuntu's /etc/skel/.bashrc, bash(1) INVOCATION |
