# Verification log: chapter 4, Build a Camp (`src/game/chapters/camp.js`)

Reference system as in `world.md`. R6 (2026-10-07): the chapter's solve run in real bash 5.2.21
with GNU coreutils 9.4 (`LC_ALL=C.UTF-8`) in a temporary home. SIM:
`test/game/chapters/camp.test.js`. Man pages from the Ubuntu 24.04 host.

## Lesson

| Claim | Evidence |
|---|---|
| `mkdir` makes a new, empty directory | `mkdir(1)`: "Create the DIRECTORY(ies), if they do not already exist."; R6 |
| `touch` makes an empty file; on an existing file it only updates its time | `touch(1)`: "Update the access and modification times of each FILE to the current time. A FILE argument that does not exist is created empty"; R6: `touch camp/pack.txt` kept its text `food` |
| `>` sends what `echo` prints into the file, replaces what was there, and makes a missing file | `bash(1)` Redirecting Output: "If the file does not exist it is created; if it does exist it is truncated to zero size."; R6: `wood` then `food` left only `food`; `echo hi > new.txt` made the file |
| `cp FROM TO` copies; the original stays; a directory as TO gets a copy inside with the same name | `cp(1)`: "Copy SOURCE to DEST, or multiple SOURCE(s) to DIRECTORY."; R6: `ancient_key.txt` in both `camp` and `forest/cave/deep` |
| `mv FROM TO` moves, so the file leaves its old place; to a new name in the same directory it renames | `mv(1)`: "Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY."; R6: the mushroom left the clearing; `supplies.txt` became `pack.txt` |
| These commands take paths and work from anywhere | they take ordinary path operands (`path_resolution(7)`); SIM hints use `~/camp/...` |

## Why and field

| Claim | Evidence |
|---|---|
| Bash opens and empties the file before `echo` runs | `bash(1)` REDIRECTION: "Before a command is executed, its input and output may be redirected"; truncation as above |
| Chapter 9 teaches `>>` | DESIGN.md section 4 (chapter 9, The Market of Pipes) |
| A name is an entry in a directory; within one file system `mv` changes the entry and the contents stay put; between file systems it copies, then deletes | `rename(2)`: "renames a file, moving it between directories if required"; `rename(2)` EXDEV: "oldpath and newpath are not on the same mounted filesystem"; coreutils manual, mv invocation: "if renaming does not work because the destination's file system differs, 'mv' falls back on copying as if by 'cp -a', then (assuming the copy succeeded) it removes the original" |
| `touch`'s job is to set the time; creating the file is the side case | `touch(1)` (above) |
| `mkdir -p` makes missing parents | `mkdir(1)` `-p`: "make parent directories as needed" |
| `cp -r` copies a directory | `cp(1)` `-R, -r`: "copy directories recursively" |
| `cp -i` asks before replacing | `cp(1)` `-i`: "prompt before overwrite" |

## Tasks, hints and boss

| Claim | Evidence |
|---|---|
| Near note: `touch camp` makes a file, so `mkdir camp` then fails; `rm camp` removes it | R6: `touch camp2; mkdir camp2` printed "mkdir: cannot create directory 'camp2': File exists" |
| Boss: the flint is found with `ls ~/forest/river`, moved with `mv`, and `echo lit >` writes fire.txt | SIM boss tests on 12 seeds, in any order of the steps |
| The flint stays off the map until an ls lists the river | the boss's `hidden` hook (AUTHORING section 2) |
