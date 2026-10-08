# Terminal keys: checked against real bash

bash 5.2.21 in the `shellcraft-difftest` image (Ubuntu 24.04), started as `bash --norc --noprofile -i`
under `script -q` with `PS1='$ '`, keys sent one at a time with a pause, the screen read with `cat -v`.
The history before each run: `echo alpha`, `echo beta`, `ls alpha`. The pure search logic is
`src/ui/isearch.js` (tests `test/ui/isearch.test.js`); the terminal's keys are `src/ui/terminal.js`.

| Claim | Real result |
|---|---|
| Ctrl+R shows `(reverse-i-search)`': ` and the line being typed | `(reverse-i-search)`': ` (empty line); with `abc` typed: `(reverse-i-search)`': abc` |
| Each letter searches from the newest line, from the right, and the match is in standout | `a`: `` `a': ls alph[a] `` (`ESC[7m` around the match); `l`: `` `al': ls [al]pha `` |
| Ctrl+R again: the next older match, first further left in the same line | `a`, then Ctrl+R three times: `ls alph[a]`, `ls [a]lpha`, `echo bet[a]`, `echo alph[a]` |
| The line being typed is searched first, left of the cursor | `abc`, Ctrl+R, `b`: `a[b]c`; Ctrl+R: `echo [b]eta` |
| An older line equal to the one on show is skipped | history `... ls alpha, echo beta`, search `echo`: `echo beta`, Ctrl+R: `echo alpha`, Ctrl+R: failed |
| Nothing older: `(failed reverse-i-search)`al': echo alpha`, the line kept, no standout | as written, with a bell |
| A string found nowhere at all fails at once with the typed line | `q`: `(failed reverse-i-search)`q': ` |
| Backspace searches again from the match | `al`, Backspace: `` `a': ls [a]lpha `` |
| After a failure, Backspace searches on from the line before the last match | `az` failed on `ls alpha`, Backspace: `` `a': echo bet[a] ``; `bz` failed on `echo beta`, Backspace: still failed (`` `b' ``), and `e` after it too |
| Enter runs the line found, shown after the normal prompt | `b`, Enter: the screen shows `$ echo beta`, then `beta` |
| Esc keeps the line for editing with the cursor at the start of the match | `b`, Esc, `X`: ran `echo Xbeta` |
| Right and Left keep the line and move one place from the start of the match | Right then `X`: `echo bXeta`; Left then `X`: `echoX beta` |
| Up after a search goes on from the line found | search `alpha` (found `ls alpha`), Up: `echo beta` |
| Ctrl+G gives back the line being typed | `xyz`, Ctrl+R, Ctrl+G: `$ xyz`, and Enter ran `xyz` |
| Ctrl+C leaves the search line on screen with `^C` and an empty prompt | `` (reverse-i-search)`b': echo beta^C `` then `$ ` |
| Ctrl+R with nothing typed does nothing | no change on screen |

Not simulated: the bell; Ctrl+R with an empty string after an earlier search (readline may reuse the
last string; in the run after Ctrl+G it did not); Ctrl+S (forward search, which a terminal's flow
control usually takes). Ctrl+A, Ctrl+E and Ctrl+L are readline's beginning-of-line, end-of-line and
clear-screen (`bind -p` in the image); Ctrl+L keeps the line being typed.
