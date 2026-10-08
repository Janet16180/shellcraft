# Verification log: chapter 5, The Cursed Junkyard (`src/game/chapters/junkyard.js`)

Reference system as in `world.md`. R8 (2026-10-07): the chapter's solve and the claims below run in real
bash 5.2.21 with GNU coreutils 9.4 (`LC_ALL=C.UTF-8`) in a scratch directory holding a copy of the
junkyard (`junk/` with `rotten_apple.txt`, `old_boots.txt`, `fish_bones.txt`, `empty_crate/`,
`cobwebs/` and `broken_cart/` with files). SIM: `test/game/chapters/junkyard.test.js`. Man pages from
the Ubuntu 24.04 host.

## Lesson

| Claim | Evidence |
|---|---|
| `rm FILE` removes a file | `rm(1)`: "Remove (unlink) the FILE(s)."; R8: `rm junk/rotten_apple.txt` exit 0, gone from `ls junk`; SIM solve |
| `rmdir` removes an empty directory | `rmdir(1)`: "Remove the DIRECTORY(ies), if they are empty."; R8: `rmdir junk/empty_crate` exit 0 |
| On a directory with something inside, `rmdir` refuses with "Directory not empty" | R8: `rmdir: failed to remove 'junk/cobwebs': Directory not empty`, exit 1; SIM prints the same line (solve test) |
| `rm` alone refuses a directory, with "Is a directory" | `rm(1)`: "By default, rm does not remove directories."; R8: `rm: cannot remove 'junk/empty_crate': Is a directory`, exit 1; SIM same text (`src/shell/commands/files.js`) |
| `rm -r` removes the directory and everything inside it, all the way down | `rm(1)` `-r, -R, --recursive`: "remove directories and their contents recursively"; R8: `rm -r junk/cobwebs` exit 0; `rm -r p` with `p/q/x` exit 0, `p` gone |
| `rm` has no undo and no recycle bin; a removed file does not wait in a trash folder | `rm(1)` has no undo or trash option and calls `unlinkat` (R8 strace below); coreutils has no undelete command. The lesson says "treat it as gone", not "it cannot be recovered": `rm(1)` notes "it might be possible to recover some of its contents, given sufficient expertise and/or time" |
| Look with `ls` first, then again after | habit, no fact claim; SIM: task 1 and the boss need `ls ~/junk` |
| `rm -i` asks before each removal, like "rm: remove regular file 'rotten_apple.txt'?", and waits for y or n | `rm(1)` `-i`: "prompt before every removal"; R8: `rm: remove regular file 'junk/fish_bones.txt'?` with `y` removed it; with `n` `old_boots.txt` stayed |
| In this game, `rm -i` answers yes for you | SIM: `rm` in `files.js` adds the note "The game answers yes for you." and removes the file |

## Why and field

| Claim | Evidence |
|---|---|
| A desktop's trash folder belongs to the file manager, which moves files there instead of removing them | FreeDesktop Trash Specification 1.0 (specifications.freedesktop.org/trash/latest): "A deleted document ends up in a 'Trash can'"; "both Gnome and KDE had their own trash mechanisms" |
| `rm` asks the system to delete a name from its directory; the system call is `unlink` | R8: `strace -e trace=unlink,unlinkat,rmdir rm f` shows `unlinkat(AT_FDCWD, "f", 0) = 0` (`unlinkat` is the `unlink` family, `unlink(2)` documents both) |
| When the last name is gone and no program has the file open, it is deleted and its space can be reused | `unlink(2)`: "If that name was the last link to a file and no processes have the file open, the file is deleted and the space it was using is made available for reuse." |
| The system call behind `rmdir` removes only an empty directory | `rmdir(2)`: "rmdir() deletes a directory, which must be empty."; R8 strace: `rmdir e` calls `rmdir("e") = 0` |
| `rm -r` goes in, removes what is inside (each subdirectory too), and removes the directory itself last | R8 strace of `rm -r c` (`c/a`, `c/sub/b`): `unlinkat a`, `unlinkat b`, `unlinkat sub AT_REMOVEDIR`, then `unlinkat c AT_REMOVEDIR` |
| `rm -ri` asks to descend into the directory, then about each file, then about the directory | R8: `rm -ri junk/broken_cart`: "descend into directory 'junk/broken_cart'?", "remove regular file '.../plank.txt'?", "remove regular file '.../wheel.txt'?", "remove directory 'junk/broken_cart'?" |
| field `rm -i FILE`: ask before each file; `y` or `n` | as above |
| field `rm -ri DIR`: asks at every step | as above |
| field `rm -I FILES`: asks once before more than three files, or before removing recursively | `rm(1)` `-I`: "prompt once before removing more than three files, or when removing recursively"; R8: 4 files asked "rm: remove 4 arguments?"; `rm -rI d2` asked "rm: remove 1 argument recursively?"; `rm -I one` did not ask |

## Tasks, hints and boss

| Claim | Evidence |
|---|---|
| `rmdir` on a file fails ("Not a directory"), so it does not count for the rmdir task | R8: `rmdir: failed to remove 'junk/old_boots.txt': Not a directory`; SIM near-miss test |
| Near notes: lost items can be made again with `touch`/`mkdir` (chapter 4) and removed the taught way | SIM test "every lost item can be made again ..." and "the rmdir task stays possible ..." |
| Lost boots come back with Restart chapter in the HUD | `index.html` `#restartBtn` "Restart chapter"; `app.js` restarts the chapter's world (setup restores `~/junk`, SIM setup test) |
| Boss: the file goes with `rm`, the empty directory with `rmdir`, the full one with `rm -r`; only `old_boots.txt` stays | SIM boss tests on 12 seeds, any order; R8: the same three commands on a copy left only `old_boots.txt` |
| The new items stay off the map until an ls lists `~/junk` | the boss's `hidden` hook (AUTHORING section 2) |
