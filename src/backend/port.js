/**
 * The backend port: the only way the game talks to a shell.
 *
 * Today the backend is the simulated bash in src/shell. Later it may be a real
 * bash in an isolated machine through termlab. Game rules, the map and the UI
 * use only what is typed here, so swapping backends touches none of them.
 *
 * Every method returns a promise, even in the simulator, because a real shell
 * answers over a socket. Callers await each call before the next one.
 *
 * This module holds no code; it exists so the types have one home.
 */

/**
 * One piece of terminal output, in the order it was produced.
 * 'note' is the game speaking, not the shell: an explanation where the
 * simulation differs from real Linux. A real backend never produces notes.
 * `html` is optional pre-escaped markup (colours for ls, grep); without it the
 * UI shows `text`.
 *
 * The vocabulary is closed, so the page can render any backend:
 * - `html` may use only these span classes: `c-dir` (a directory name), `c-exe`
 *   (an executable file), `c-link` (a symbolic link), `c-orphan` (a symbolic
 *   link that leads nowhere), `g-file`, `g-sep` and `g-num` (grep's file name,
 *   separator and line number) and `g-match` (grep's matched text). It never
 *   contains raw terminal escape codes; a backend that receives colours from a
 *   real terminal translates them into these classes or drops them.
 * - `tone` is one of: `clear` on an 'out' chunk (the screen is cleared; the
 *   text is the real escape sequence, which the page does not print), and
 *   `coach` on a 'note' chunk (a teaching note added by the game layer, never
 *   by a backend).
 *
 * @typedef {{stream: 'out'|'err'|'note', text: string, html?: string, tone?: 'clear'|'coach'}} OutputChunk
 */

/**
 * One command that ran, as the game's checks see it. A line like
 * `cat a | sort > b; ls` gives three records.
 *
 * @typedef {object} CommandRecord
 * @property {string} name The command name after alias expansion (`ls`, `./open_gate.sh`).
 * @property {string[]} args Arguments after quote removal and glob expansion.
 * @property {string} user The user it ran as: the player, or another user for a
 *   command that sudo ran.
 * @property {string} [asUser] On a `sudo` record only: the user sudo was asked to
 *   run the command as (`root`, or the user of `-u`), whether or not it ran.
 * @property {string} [via] On a command another command ran for the player: that
 *   command's name (`sudo`). `sudo chown mira f` gives two records, in this order:
 *   `{name: 'sudo', args: ['chown', 'mira', 'f'], user: 'hero', asUser: 'root', status}`
 *   and, if sudo ran it, `{name: 'chown', args: ['mira', 'f'], user: 'root', via: 'sudo', status}`.
 *   Both share the pipeline place, the redirections and stdout; sudo's status is
 *   the command's own, or 1 when sudo refused. So `ctx.ran('chown', r => r.user === 'root')`
 *   asks "did chown run as root?".
 * @property {true} [background] On a command of a job started with `&`: `sleep 30 &`
 *   gives `{name: 'sleep', args: ['30'], background: true, job: 1, ...}`.
 * @property {number|null} [job] With `background`: the job's number, as `jobs` shows it
 *   (null where the shell keeps no job table, in a script).
 * @property {'INT'|'TSTP'} [signal] The key the player pressed while it ran in the
 *   foreground: 'INT' (Ctrl+C) ended it, status 130; 'TSTP' (Ctrl+Z) stopped it as a
 *   job, status 148. `sleep 100` then Ctrl+Z gives `{name: 'sleep', status: 148, signal: 'TSTP'}`;
 *   `fg` then Ctrl+C gives `{name: 'fg', status: 130, signal: 'INT'}`.
 * @property {string} cwd Absolute working directory when it started.
 * @property {number} status Its exit status.
 * @property {string} stdout Everything it wrote to standard output, even if redirected or piped.
 * @property {number} pipeline Index of its pipeline within the line (0, 1, ...).
 * @property {number} stage Its position in that pipeline (0 = first).
 * @property {number} stages How many commands that pipeline has.
 * @property {{op: string, target: string}[]} redirects Redirections in the order typed. `op` is
 *   the operator with the fd number as typed in front (`<`, `>`, `>>`, `2>`, `2>>`, `&>`); its
 *   target is the absolute path of the file as typed (`.` and `..` removed as text,
 *   symbolic links not resolved). An fd duplication has op `2>&` (or `>&`, `1>&`...)
 *   and the fd number as target: `ls x > f 2>&1` gives `[{op: '>', target: '/home/hero/f'},
 *   {op: '2>&', target: '1'}]`.
 */

/**
 * A line may stop to read one line the player types, as `sudo` reads a
 * password: the result then carries `input`, and the line is not finished.
 * `output` holds only what the terminal shows before the prompt; `commands`
 * and `blocked` are empty and `status` is `$?` so far. The page shows
 * `input.prompt`, reads one line (hidden: no echo, nothing shown, not added
 * to history) and sends it with `Backend.answer`; Ctrl+C sends `null`. The
 * answer's result continues the same line: its output is only what is new
 * (starting with the prompt line as the terminal keeps it, `[sudo] password
 * for hero: ` and a newline), and it may ask again (a wrong password). The
 * result without `input` is the line's end, with every record of the whole
 * line. Joining the output of every part gives what a real terminal shows.
 *
 * A line may also stop while a foreground command takes time (`sleep 5`,
 * `fg`, `wait`): the result then carries `running`, and again the line is not
 * finished; `output` holds what the terminal showed so far, `commands` and
 * `blocked` are empty. The page shows no prompt meanwhile. It calls
 * `Backend.poll` when `running.seconds` have passed (null: the command never
 * ends by itself, like `sleep infinity`), and `Backend.signal('INT')` when the
 * player presses Ctrl+C or `Backend.signal('TSTP')` for Ctrl+Z. Each returns
 * the next part, in the same way: more `running`, or the line's end. Ctrl+C
 * ends the command and the rest of the line (`^C`, status 130); Ctrl+Z stops
 * it as a job (`^Z`, `[1]+  Stopped ...`, status 148) and the line goes on.
 * Time is the backend's clock: in the page, the real clock.
 *
 * @typedef {object} RunResult
 * @property {OutputChunk[]} output What the terminal shows.
 * @property {number} status Exit status of the line (what `$?` becomes).
 * @property {CommandRecord[]} commands Every command that ran, in order.
 * @property {string[]} blocked Reasons the backend refused something a real
 *   system would have done, to protect the world (`rm -r ~`). Empty for a real backend
 *   that has no such guard.
 * @property {{prompt: string, hidden: boolean}} [input] Present while the line waits
 *   for a typed line: the prompt to show before it, and whether to hide what is typed.
 * @property {{seconds: number|null}} [running] Present while a foreground command
 *   runs: the seconds until it ends by itself, by the backend's clock, or null for never.
 */

/**
 * A node of the observed tree. Directories have `children`, files `content`,
 * symbolic links `target`.
 *
 * Each node is an inode. A file with several names (hard links) appears once
 * under each name, every copy with the same `ino`; compare `ino` to tell
 * whether two paths are one file. A symbolic link is not followed in the
 * tree: it is its own node, and `target` is its text exactly as created (a
 * relative target is read from the link's directory). `nodeAt` in tree.js
 * follows links like the kernel; pass `{follow: false}` to get the link itself.
 *
 * @typedef {object} TreeNode
 * @property {'dir'|'file'|'symlink'} type
 * @property {number} mode Permission bits (0o755); always 0o777 for a symbolic link.
 * @property {string} owner
 * @property {string} group
 * @property {number} size Bytes for a file, 4096 for a directory, the bytes of the target text for a link.
 * @property {number} mtime Milliseconds since the epoch.
 * @property {number} ino The inode number, as `ls -i` shows it. It stays with the node across renames.
 * @property {number} links The link count, as `ls -l` shows it: a file's number of
 *   names; 2 plus the number of subdirectories for a directory.
 * @property {string} [content]
 * @property {string} [target] A symbolic link's target text.
 * @property {Record<string, TreeNode>} [children]
 */

/**
 * @typedef {object} ProcRecord
 * @property {number} pid
 * @property {number} ppid
 * @property {string} user
 * @property {string} tty
 * @property {string} stat Process state as ps shows it (R, S, T, ...).
 * @property {number} cpu Percent.
 * @property {number} mem Percent.
 * @property {string} cmd Full command line.
 * @property {string} [key] The key a patch started it under, if any. The player's own
 *   interactive shell has the key 'shell', so the game can recognise it.
 */

/**
 * Everything the game may look at between commands. The tree covers the paths
 * the world defines, not a whole real disk.
 *
 * @typedef {object} Observation
 * @property {string} user
 * @property {string[]} groups The groups the user belongs to (for access.js).
 * @property {string} host
 * @property {string} home Absolute path of the player's home.
 * @property {string} cwd Absolute working directory.
 * @property {TreeNode} tree The world, rooted at '/'.
 * @property {ProcRecord[]} procs
 */

/**
 * @typedef {object} Backend
 * @property {(patch: object[]) => Promise<void>} load Apply a world patch from
 *   src/backend/spec.js. Raises on a patch it cannot apply (a missing parent).
 *   A line waiting for input or running is abandoned, and its foreground command ends.
 * @property {(line: string) => Promise<RunResult>} run Run one line typed by the player.
 *   Raises while an earlier line waits for input or runs.
 * @property {(text: string|null) => Promise<RunResult>} answer Send the line the player
 *   typed at a RunResult's `input` prompt, or `null` for Ctrl+C. Raises when no line waits.
 * @property {() => Promise<RunResult>} poll Let a `running` line go on if its foreground
 *   command has ended by now; otherwise `running` again with the seconds left and no output.
 *   Raises when no line runs.
 * @property {(name: 'INT'|'TSTP') => Promise<RunResult>} signal The player pressed Ctrl+C
 *   (SIGINT) or Ctrl+Z (SIGTSTP) while a line runs: the terminal sends it to the foreground
 *   command. Raises when no line runs, or for any other name.
 * @property {() => Promise<Observation>} observe Snapshot the world.
 * @property {(line: string) => Promise<{line: string, candidates: string[]}>} complete
 *   Tab completion: the completed line, plus the candidates to list when the
 *   completion is ambiguous.
 * @property {(columns: number) => Promise<void>} resize Tell the shell how many
 *   character columns the terminal shows, as a real terminal resize does (ls lays out
 *   its columns for this width). Raises for anything but a positive integer.
 */

export {};
