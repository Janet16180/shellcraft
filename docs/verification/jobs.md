# Job control in the simulator: checked on real Ubuntu

Ubuntu 24.04 (`shellcraft-difftest`), bash 5.2.21, coreutils 9.4 sleep, procps ps. Most claims are
difftest cases (`difftest/cases/17-jobs.json`, PIDs masked). Keys cannot be typed into a case's
input, so Ctrl+C and Ctrl+Z, and timing a person gives (a line typed seconds after the one before),
were checked through a real terminal: the script below feeds keys into `script`'s pty with pauses
(`'^Z'` sends 0x1a, `'^C'` 0x03, `@N` waits N seconds) and prints what the terminal shows.

```sh
feed() { sleep 1; for s in "$@"; do case "$s" in @*) sleep "${s#@}";; ^Z) printf '\032'; sleep .5;;
  ^C) printf '\003'; sleep .5;; *) printf '%s\n' "$s"; sleep .5;; esac; done; printf 'exit\n'; sleep 1; }
feed "$@" | docker run --rm -i --hostname kernelia shellcraft-difftest script -qec "setpriv --reuid=1000 \
  --regid=1000 --init-groups env -i HOME=/home/hero USER=hero PATH=/usr/bin:/bin TERM=dumb 'PS1=$ ' \
  LC_ALL=C.UTF-8 bash --norc --noprofile --noediting -i" /dev/null | cat -A
```

| Claim | Real result |
|---|---|
| `sleep 30 &` prints `[1] PID` on stderr and the prompt comes back | `[1] 8` |
| `jobs`: `[N]` then `+` (current), `-` (previous) or a space, two spaces, the state padded to 24 columns, the command as typed, ` &` while it runs in the background | `[1]+  Running                 sleep 100 &`; `[2]   Running                 sleep 2 &` |
| `jobs -l` adds the PID in 5 columns, and tells `Stopped (signal)` (SIGSTOP) from `Stopped` (Ctrl+Z) | `[1]+     9 Stopped                 sleep 100`, `[2]+     9 Stopped (signal)        sleep 100` |
| A background job that ends is reported before the next prompt: `[2]   Done                    sleep 2`; `Exit 1` for a status, `Terminated`, `Killed` for signals | seen after `echo x` typed 3 s later |
| A job that ended while the player typed is reported after the next line, not before it; an empty line is enough | `$ echo x` / `x` / `[2]   Done ...`; `$ ` (Enter) / `[4]-  Done                    true` |
| After a program (not a builtin) on the line, bash reports at once | `ls -d d; echo e`: ls's error, then `[3]-  Done  sleep 1`, then `e` |
| Ctrl+C: the terminal shows `^C`, bash a newline; status 130; the rest of the line is dropped | `sleep 100; echo after` + Ctrl+C: `^C`, no `after`, `echo $?` 130 |
| Ctrl+Z: `^Z`, then `[1]+  Stopped                 sleep 100`, status 148, the rest of the line runs | `sleep 100; echo after` + Ctrl+Z printed `after`; `fg` + Ctrl+Z: `echo $?` 148 |
| Ctrl+Z inside a loop leaves the loop | `for i in 1 2; do sleep 100; echo i$i; done` + Ctrl+Z: no `i1` (jobs.c: `breaking = loop_level`) |
| `fg` prints the command, then waits for it; a job that ends under fg is not reported | `sleep 100`; `fg %2` on `sleep 2`: `s0`, no `Done` |
| `bg` prints `[1]+ sleep 100 &` | as written; `[1]- sleep 100 &` for the previous job |
| A job started elsewhere: `  (wd: /tmp)` in jobs and Done, `\t(wd: /tmp)` after fg and bg, `(wd now: /)` after a notice | as written |
| `kill %1` alone prints nothing; the next line reports `Terminated` | `$ kill %1` / `$ jobs` / `[1]-  Terminated              sleep 100` |
| `kill %1` on a stopped job sends SIGCONT too; that same line still reports it Stopped | `$ kill %` / blank line / `[2]+  Stopped                 sleep 100`; then `jobs`: `Terminated` |
| `kill -INT %1` on a stopped job: the signal waits, the job stays stopped | `[1]+  Stopped` again |
| `kill -STOP %2` is reported after the next line, after a blank line | `$ echo a` / `a` / blank / `[2]+  Stopped                 sleep 100` |
| `kill -CONT %1` lets a stopped job run on, with no message | `jobs`: `[1]-  Running                 sleep 100 &` |
| Errors | `bash: fg: current: no such job`, `bash: fg: %3: no such job`, `bash: fg: 3: no such job`, `bash: fg: s: ambiguous job spec`, `bash: bg: job 1 already in background` (status 0), `bash: fg: job has terminated`, `bash: kill: %1: no such job`, `bash: wait: pid 123 is not a child of this shell` (127), `bash: disown: current: no such job` |
| `jobs %sl` with two sleeps: two messages, `bash: jobs: sl: ambiguous job spec` and `bash: jobs: %sl: no such job`; `%?TEXT` ignores case | `jobs %?SLEEP` ambiguous; `jobs %Sl` no such job |
| `wait` waits for every running job and reports each; `wait %1` returns its status (143 after `kill`) | `[1]+  Done                    sleep 1`; `143` |
| `wait` does not wait for a stopped job: `bash: wait: warning: job 1[9] stopped`, status 0 | as written |
| `wait` + Ctrl+C: `^C`, 130, the jobs run on | `jobs -r` listed it |
| `disown` drops the job, the process runs on; a stopped one: `bash: warning: deleting stopped job 1 with process group 9` | `ps` still showed it |
| `ps`: a background sleep is `S`, a stopped one `T`, ps itself `R+` | `ps -o pid,stat,cmd` |
| sleep: `missing operand`, ``invalid time interval ‘x’``, `invalid option -- '1'` for `-1`; suffixes s m h d; operands add up; `infinity` | coreutils 9.4 |
| Signal names in notices are glibc's strsignal | `Hangup`, `Interrupt`, `Killed`, `Terminated`, `User defined signal 1`, `Real-time signal N`... |

Kept different on purpose:
- Time: the page's clock is the real one, so `sleep 30 &` is Done 30 seconds later; tests move a
  test clock. A foreground `sleep 5` holds the prompt for 5 real seconds.
- A background job runs its commands at once and prints their output at once; its sleeps only make
  its process live longer. `sleep 3 && echo hi &` prints `hi` at once, not after 3 seconds, and a
  script stopped with Ctrl+Z has already run its remaining commands.
- A job is one process: `ps` shows `sleep 30` for `sleep 30 &`, and one `bash` for a job of several
  commands (`a | b &`, `a && b &`); `jobs -l` lists one PID per job.
- The tty's echo of Ctrl+Z goes with bash's notice on one line pair (`^Z` then `[1]+  Stopped ...`),
  as the real terminal shows it.
- Ctrl+Z while `wait` runs is ignored silently (real bash ignores SIGTSTP too; the terminal would
  echo `^Z`).
- Racy cases are resolved one way: bash also gives a running foreground command a job slot, which
  can make a job killed by `kill %1` while stopped show `-` instead of `+` when the CONT and the
  death reach bash separately. The simulator never shows the foreground slot.
- `jobs -x`, `wait -n`/`-f`/`-p`, `disown -h` effects (SIGHUP at logout), `suspend`, `set -b`
  (immediate notices), `tail -f` and other long-running programs are not simulated.
- Compound commands in the background are shown on one line (`for i in 1 2; do sleep 1; done`).
