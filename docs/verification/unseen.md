# Verification log: chapter 3, Things Unseen (`src/game/chapters/unseen.js`)

Reference system as in `world.md`. R6 (2026-10-07): the chapter's commands run in real bash 5.2.21
with GNU coreutils 9.4 (`LC_ALL=C.UTF-8`) on a copy of the relevant part of the world, in a
temporary home. SIM: `test/game/chapters/unseen.test.js`. Man pages from the Ubuntu 24.04 host.

## Lesson

| Claim | Evidence |
|---|---|
| Names that start with a dot are hidden; plain `ls` skips them | `ls(1)` `-a`: "do not ignore entries starting with ."; R6: `ls` printed `forest` only, `ls -a` added `.secret_map` |
| They are ordinary files that usually hold settings | R6: `cat .secret_map` works; the base world's `.bashrc` (`world.md`) |
| `ls -a` also shows `.` and `..`, the directory itself and its parent | R6 `ls -a` printed `. .. .secret_map forest`; `path_resolution(7)` |
| `ls -l` is the long listing: type letter, nine permission letters, link count, owner, group, size in bytes, date of the last change, name | `ls(1)` `-l`: "use a long listing format"; R6: `-rw-r--r-- 1 hero hero 4 Oct  6 22:31 ...ancient_key.txt` (4 bytes for `key\n`); `d` for the directory `forest` |
| The first line, total, counts disk blocks | coreutils manual, "What information is listed": "'total BLOCKS', where BLOCKS is the file system allocation for all files in that directory" |
| `ls -la` is the same as `ls -l -a` | R6: `diff <(ls -la) <(ls -l -a)` printed nothing |
| Options work with a path: `ls -a ~/forest` | R6: `ls -a forest/clearing` listed `.fairy_ring.txt`, plain `ls forest/clearing` did not |
| Chapter 11 explains permissions | DESIGN.md section 4 (chapter 11, The Sealed Gate) |

## Why and field

| Claim | Evidence |
|---|---|
| Programs keep settings in dotfiles in your home, like `.bashrc` | `bash(1)` FILES: `~/.bashrc` "The individual per-interactive-shell startup file" |
| Hiding is a habit of `ls`, not a protection; anyone allowed to read the directory sees the names | `ls(1)` `-a` (only an option of `ls`); reading a directory's names needs read permission on the directory, not on the files |
| `ls -A` leaves out `.` and `..` | `ls(1)` `-A`: "do not list implied . and .."; R6 |
| `ls -lh` prints sizes like `4.0K` | `ls(1)` `-h`: "print sizes like 1K 234M 2G"; R6: `4.0K` for `forest` |
| `ls -lt` lists newest first | `ls(1)` `-t`: "sort by time, newest first" |

## Tasks, hints and boss

| Claim | Evidence |
|---|---|
| The dot is part of the name; `cat secret_map` fails | R6, SIM near-note tests |
| In a long listing the number before the date is the size in bytes | R6 line above |
| Boss: `ls -a ~/forest/cave` shows `.tunnel_XXX`, plain `ls` does not; `cd` into it and `cat treasure.txt` | SIM boss tests on 12 seeds; same `ls -a` behaviour as R6 |
| Concealment on the map: hidden entries show only after `ls -a` of that directory | `src/game/effects.js` `revealedDirs`, `src/map/room.js` |
