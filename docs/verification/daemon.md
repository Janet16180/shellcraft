# Verification log: chapter 13, The Shadow Daemon (`src/game/chapters/daemon.js`)

Reference system as in `world.md`. R13 (2026-10-08): in the `shellcraft-difftest` image (Ubuntu
24.04, bash 5.2.21, procps-ng 4.0.4) as `hero` via `su`: copies of `sleep` named `imp`,
`greedy_imp` and `stubborn_imp`, and a `bash -c` loop with `trap '' TERM` for a process that ignores
TERM. SIM: `test/game/chapters/daemon.test.js` (the same lines on the simulator).

The PIDs are fixed by the chapter (2412, 2420, 2431; the boss picks 3000 to 9999) so the hints can
name them; the lesson says that real PIDs change every time. Real Linux allows PIDs up to
`pid_max`, 4194304 on 64-bit systems (`proc(5)`), the bound `spec.js` checks.

## Lesson

| Claim | Evidence |
|---|---|
| `ps` lists the processes of this terminal | `ps(1)` "By default, ps selects all processes with the same effective user ID as the current user and associated with the same terminal as the invoker"; SIM shows `bash` and `ps` only |
| `ps aux`: every user, owner and `%CPU` columns, processes with no terminal | `ps(1)` BSD options `a`, `u`, `x`; R13 header `USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND` |
| `ps -ef` has no `%CPU` column | R13 header `UID PID PPID C STIME TTY TIME CMD` |
| `pgrep imp` matches part of the name | R13: `pgrep imp` printed the PIDs of `imp`, `greedy_imp` and `stubborn_imp` |
| `kill PID` sends TERM (15) and prints nothing when it works | `kill` in `bash(1)`: "If sig is not present, then SIGTERM is assumed"; R13: status 0, no output |
| A program may ignore TERM; KILL (9) cannot be caught or ignored | `signal(7)` "The signals SIGKILL and SIGSTOP cannot be caught, blocked, or ignored"; R13: the trap loop survived `kill`, ended with `kill -9` |
| Only your own processes: `kill -9 1` fails | `kill(2)` EPERM; R13: `bash: kill: (1) - Operation not permitted`, status 1; SIM the same |
| `kill NAME` fails | R13: `bash: kill: greedy_imp: arguments must be process or job IDs`, status 1; SIM the same |
| Ctrl+C sends INT (2) to the foreground program | `bash(1)` SIGNALS and `termios(3)` VINTR |

The imps are not children of the player's shell (their parent is PID 1), so bash prints no
`Killed` job message for them, as real bash does for processes it did not start.
