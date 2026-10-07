# Verification log: chapter 7, The Great Library (`src/game/chapters/library.js`)

Reference system as in `world.md`. R8 (2026-10-07): the chapter's commands run in real bash 5.2.21
with GNU coreutils 9.4 (`LC_ALL=C.UTF-8`) on the game's own Scroll of Ages and catalogue, fed to the
real tools through process substitution (`head <(…)`), so nothing was written to disk. SIM:
`test/game/chapters/library.test.js`. Man pages and `--help` from the Ubuntu 24.04 host.

## Lesson

| Claim | Evidence |
|---|---|
| `head FILE` prints the first 10 lines | `head --help`: "Print the first 10 lines of each FILE to standard output."; R8: `head` of the scroll gave 10 lines, the last "In the Age of Pipes, …"; SIM agrees (task 1 tests) |
| `tail FILE` prints the last 10 lines | `tail --help`: "Print the last 10 lines of each FILE to standard output."; R8: 10 lines, from "But reading them all from the top …" |
| `-n` chooses how many lines; `head -n 3` the first 3, `tail -n 1` only the last | `head --help` `-n, --lines=[-]NUM`: "print the first NUM lines instead of the first 10"; `tail --help` `-n, --lines=[+]NUM`: "output the last NUM lines, instead of the last 10"; R8: `head -n 3` printed "THE SCROLL OF AGES", "==================", "In the beginning there was only the kernel,"; `tail -n 1` printed "Word of power: TUX" |
| `head -n3`, `head -3` give the same output as `head -n 3` (checks accept them) | R8: identical md5sums for `-n 3`, `-n3`, `-3`, `--lines=3`; SIM supports the first three; `--lines=3` is a real option the simulator reports as unsimulated (exit 1), so the check does not accept it (SIM near-miss test) |
| `wc FILE` prints three numbers then the name: lines, words, bytes | `wc(1)` NAME: "print newline, word, and byte counts for each file"; `wc --help`: "in the following order: newline, word, character, byte"; R8 and SIM: `40 362 1944` for the scroll |
| `wc` stands for word count | `wc(1)` NAME (above): the counts are of words, lines and bytes; conventional reading of the name |
| `wc -l` prints only the number of lines; one item per line means the number of items | `wc --help` `-l, --lines`: "print the newline counts"; R8: scroll 40, catalogue 25 (each line ends with a newline, so the newline count is the line count); R8 `printf 'a\nb' \| wc -l` gave 1, so the claim needs a final newline, which the game's files have |
| `less FILE` pages through a file; Space moves one page down; q quits | `less(1)` COMMANDS: "SPACE or ^V or f or ^F  Scroll forward N lines, default one window"; "q or Q or :q or :Q or ZZ  Exits less." |
| `more` is a simpler viewer of the same kind | `less(1)` DESCRIPTION: "Less is a program similar to more(1), but it has many more features." |
| In the game, `less` and `more` just print the file | SIM: `less` printed the file with the note "A real less opens the file in a scrollable viewer … Here it simply prints the file." (`src/shell/commands/files.js` pager) |

## Why and field

| Claim | Evidence |
|---|---|
| Programs write logs by adding lines to the end, so the newest is at the bottom | rsyslog and most loggers open log files for appending (`open(2)` `O_APPEND`: "the file is opened in append mode … the file offset is positioned at the end of the file"); `tail` therefore shows the newest entries |
| `tail -f` keeps watching and prints new lines as they are added; Ctrl+C stops it | `tail(1)` `-f, --follow`: "output appended data as the file grows"; Ctrl+C sends SIGINT, whose default action terminates the process (`signal(7)`); R8: `timeout 1 tail -f <(…)` printed 10 lines and kept running until stopped; SIM prints once with a note |
| `wc -l` counts a long file at once | R8 as above; `wc` reads the file without showing it |
| `less` with `/` and a word searches; `q` quits | `less(1)`: "/pattern  Search forward in the file for the N-th line containing the pattern."; q as above |
| `wc -w` counts only words | `wc --help` `-w, --words`: "print the word counts"; R8: 362 for the scroll; SIM: 362 |
| `head -c 20` prints the first 20 bytes | `head --help` `-c, --bytes=[-]NUM`: "print the first NUM bytes of each file"; R8 and SIM: "THE SCROLL OF AGES\n=" (20 bytes) |

## Tasks, hints and boss

| Claim | Evidence |
|---|---|
| The scroll has 40 lines and ends with "Word of power: TUX"; the catalogue has 25 books, one per line | R8 (above); SIM test "the scroll ends with the word of power, has 40 lines, and the catalogue lists 25 books" |
| Near note: `cat` prints the whole scroll, head and tail only part | R8: `head` and `tail` printed 10 of 40 lines |
| Near note: the three `wc` numbers are lines, words and bytes; `-l` keeps only lines | `wc --help` (above) |
| Checks compare the command's own output with the wanted lines, so `-n 3`, `-n3`, `-3` (and `tail -n +40`) pass, `-c` is refused | SIM near-miss tests (`tail -c 19` prints the same bytes but is refused: the task is about lines) |
| Boss: the tome (150 lines, last line "The password is XXXX") is found with `ls ~/library` and its last line printed with `tail -n 1` | SIM boss tests on 12 seeds; `cat`, `head`, `head -n 1`, `tail`, `tail -n 2` do not beat it and get a note |
| The tome stays off the map until an ls lists the library | the boss's `hidden` hook (AUTHORING section 2) |
