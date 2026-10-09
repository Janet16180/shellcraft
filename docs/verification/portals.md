# Chapter 17, Portals: checked in real bash

Ubuntu 24.04, bash 5.2, coreutils 9.4 (Docker image `shellcraft-difftest`), as hero.

| Claim | Real result |
|---|---|
| `ls -l ~/portal` shows the link itself: `l`, `-> target` | `lrwxrwxrwx 1 hero hero 27 ... /home/hero/portal -> /home/hero/forest/cave/deep` |
| `cd ~/portal`; `pwd` shows the link's name | `/home/hero/portal` |
| A hard link to a directory is refused | `ln: forest/cave/deep: hard link not allowed for directory` |
| `ls -li`: both hard-linked names show the same inode and 2 names | same number, link count 2 |
| After `rm scroll.txt`, `copy.txt` still reads | prints it |
| The soft link to the removed name is broken | `cat: portals/old_portal: No such file or directory` |
| `ln -s` onto an existing link is refused | `ln: failed to create symbolic link 'portals/old_portal': File exists` |
| `ln -sf` replaces it | the link reads `copy.txt` again |
| Boss: a `-wx--x--x` directory cannot be listed, but a known path through it reads | `ls: cannot open directory ... Permission denied`, then the file prints |
