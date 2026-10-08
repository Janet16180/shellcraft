# Explainers: checked in real bash

Ubuntu 24.04, bash 5.2, coreutils 9.4 (Docker image `shellcraft-difftest`), as user hero.

| Explainer claim | Real result |
|---|---|
| `ln scroll.txt copy.txt`, then `ls -i`: both names show the same inode | same number |
| `rm scroll.txt`; `cat copy.txt` still prints the text | prints it |
| `ln -s ~/forest/cave/deep portal`; `ls -l` shows `portal -> /home/hero/forest/cave/deep`, type `l` | yes |
| `cd portal`; `pwd` shows the link's name, `/home/hero/portal` (prompt `~/portal`) | yes |
| Move the target, then `cd portal`: `bash: cd: portal: No such file or directory`, status 1 | yes |
| A hard link cannot point at a directory | `ln: forest: hard link not allowed for directory` |
| Owner with mode `044` (`----r--r--`): `cat` is denied though others may read | `Permission denied` |
