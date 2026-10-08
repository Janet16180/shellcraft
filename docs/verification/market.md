# Verification log: chapter 9, The Market of Pipes (`src/game/chapters/market.js`)

Reference system as in `world.md`. R8 (2026-10-07): the chapter's lines run in real bash 5.2.21 with
GNU coreutils 9.4 (`LC_ALL=C.UTF-8`) in a scratch directory holding a copy of the base world's
`inventory.txt`, plus the boss ledgers of seeds 1-12 written by `boss.setup`. SIM:
`test/game/chapters/market.test.js` (the same lines on the simulator, with the outputs compared).
Man pages from the Ubuntu 24.04 host.

## Lesson

| Claim | Evidence |
|---|---|
| `sort FILE` prints the lines in order, A to Z; the file does not change | `sort(1)`: "Write sorted concatenation of all FILE(s) to standard output."; R8: `sort inventory.txt` printed apple, apple, apple, map, ... torch; `cmp` with a copy taken before: identical |
| The pipe `\|` sends what one command prints into the next command; the next reads it as if it were a file | `bash(1)` Pipelines: "The standard output of command1 is connected via a pipe to the standard input of command2."; R8: `sort inventory.txt \| uniq` printed the seven items once each |
| `uniq` joins equal lines that are next to each other; repeats far apart stay apart; it compares each line with the one before | `uniq(1)`: "Filter adjacent matching lines from INPUT"; "Note: 'uniq' does not detect repeated lines unless they are adjacent."; R8: `uniq inventory.txt \| wc -l` printed 14 (no line joined: the inventory has no two equal lines side by side) |
| `sort` first puts equal lines side by side | R8: the sorted output above has every repeat in one block |
| `uniq -c` writes in front of each line how many times it came | `uniq(1)` `-c, --count`: "prefix lines by the number of occurrences"; R8: `      3 apple`, `      4 potion`, ... (seven-wide count, a space, the line); SIM prints the same bytes |
| A pipe can end in a redirection: `sort inventory.txt \| uniq > stock.txt` saves the list | R8: stock.txt held apple, map, potion, rope, shield, sword, torch |
| `>` replaces everything in the file (chapter 4) | R8: `echo lantern > stock.txt` left only `lantern`; `camp.md` |
| `>>` adds to the end and keeps what was there | `bash(1)` Appending Redirected Output: the file "to be opened for appending"; R8: after `echo lantern >> stock.txt; echo compass >> stock.txt` the list ended with lantern, compass |
| Like `>`, `>>` makes the file if there is none | `bash(1)` Appending Redirected Output: "If the file does not exist it is created."; R8: `echo x >> new.txt` made new.txt holding `x` |
| `grep potion inventory.txt \| wc -l` counts the lines grep found | R8: printed `4`; SIM prints `4` |

## Tasks, tips, hints and near notes

| Claim | Evidence |
|---|---|
| Task 4: the saved list is apple, map, potion, rope, shield, sword, torch | R8 (above); SIM solve test compares the file |
| Tip 5: `>` would replace it all | R8 (above) |
| Near (task 4): `>>` onto an existing stock.txt adds the list after what it held | R8: `sort inventory.txt \| uniq >> stock.txt` on a stock.txt holding `lantern` gave lantern, then the seven items |
| Near (task 2, boss): `sort -u` gives the same result as `sort \| uniq` | `sort(1)` `-u, --unique`: "output only the first of an equal run"; R8: `diff` of the two outputs was empty |
| Near (task 7): `grep -c` counts too | `grep(1)` `-c, --count`: "Suppress normal output; instead print a count of matching lines"; R8: `grep -c potion inventory.txt` printed 4 |
| Near (task 7): `wc -l` on the inventory counts every line | `wc(1)` `-l, --lines`: "print the newline counts"; R8: `14 inventory.txt` |
| Near (task 7): `wc` without `-l` prints more than lines | R8: `grep potion inventory.txt \| wc` printed `4 4 28` (lines, words, bytes) |
| Recovery for tasks 5-6: saving the list again with `>` then `>>` works | R8: the sequence above; SIM test "erasing the list with > can be mended" |

## Why and field

| Claim | Evidence |
|---|---|
| Unix: each program does one job well, and programs work together | Doug McIlroy's summary of the Unix philosophy (Bell System Technical Journal, 1978, foreword; quoted in Salus, *A Quarter Century of Unix*, 1994): "Write programs that do one thing and do it well. Write programs to work together." |
| `uniq` remembers one line at a time and handles input of any length, even a stream that never ends | `uniq(1)` (adjacent lines only); R8: `yes potion \| head -n 50000000 \| uniq -c` printed `50000000 potion` with a peak memory of 2012 kB (`/usr/bin/time`); R8: `{ printf 'a\nb\n'; sleep 2; } \| stdbuf -oL uniq` printed both lines after 0.005 s, before its input ended |
| `sort` has to read every line before it can print the first | R8: `{ printf 'b\na\n'; sleep 2; } \| sort` printed nothing until its input ended after 2 s (first line at 2.003 s); the last line read may sort first |
| Programs keep logs by adding a line at the end of a file | `bash(1)` appending, as above; general practice (`/var/log`) |
| `sort -n`: by number value, `10` after `9` | `sort(1)` `-n, --numeric-sort`: "compare according to string numerical value"; R8: `printf '9\n10\n2\n' \| sort` gave 10, 2, 9; with `-n` gave 2, 9, 10 |
| `sort \| uniq -c \| sort -rn`: most common first; `-r` reverses | `sort(1)` `-r, --reverse`: "reverse the result of comparisons"; R8: potion 4, apple 3, torch 2, sword 2, ... |
| `sort -u FILE` sorts and drops repeats | as above |
| `tee` shows what it reads and saves it in a file too | `tee(1)`: "Copy standard input to each FILE, and also to standard output."; R8: `sort inventory.txt \| tee sorted.txt \| head -2` printed two lines and sorted.txt had 14 |

## Boss

| Claim | Evidence |
|---|---|
| The ledger has 30 lines, one item per line, with repeats, in random order | SIM boss test on 12 seeds (6-8 distinct items, each at least twice; plain `uniq` never already gives the answer) |
| `sort ~/market/ledger.txt \| uniq > ~/market/sold.txt` writes each item once, in order | R8: the 12 seeds' ledgers through real `sort \| uniq` matched `secret.items` 12/12; plain `uniq` matched none |
| Items are lowercase ASCII words, so the order is the same in any locale `sort` uses here | `GOODS` in the module; R8 run with `LC_ALL=C.UTF-8` |
| The ledger stays off the map until an ls lists the market | the boss's `hidden` hook (AUTHORING section 2) |
