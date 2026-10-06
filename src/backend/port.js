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
 * @typedef {{stream: 'out'|'err'|'note', text: string, html?: string, tone?: string}} OutputChunk
 */

/**
 * One command that ran, as the game's checks see it. A line like
 * `cat a | sort > b; ls` gives three records.
 *
 * @typedef {object} CommandRecord
 * @property {string} name The command name after alias expansion (`ls`, `./open_gate.sh`).
 * @property {string[]} args Arguments after quote removal and glob expansion.
 * @property {string} cwd Absolute working directory when it started.
 * @property {number} status Its exit status.
 * @property {string} stdout Everything it wrote to standard output, even if redirected or piped.
 * @property {number} pipeline Index of its pipeline within the line (0, 1, ...).
 * @property {number} stage Its position in that pipeline (0 = first).
 * @property {number} stages How many commands that pipeline has.
 * @property {{op: string, target: string}[]} redirects Redirections, with absolute targets.
 */

/**
 * @typedef {object} RunResult
 * @property {OutputChunk[]} output What the terminal shows.
 * @property {number} status Exit status of the line (what `$?` becomes).
 * @property {CommandRecord[]} commands Every command that ran, in order.
 * @property {string[]} blocked Reasons the backend refused something a real
 *   system would have done, to protect the world (`rm -r ~`). Empty for a real backend
 *   that has no such guard.
 */

/**
 * A node of the observed tree. Directories have `children`, files `content`.
 *
 * @typedef {object} TreeNode
 * @property {'dir'|'file'} type
 * @property {number} mode Permission bits (0o755).
 * @property {string} owner
 * @property {string} group
 * @property {number} size Bytes for a file.
 * @property {number} mtime Milliseconds since the epoch.
 * @property {string} [content]
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
 * @property {(line: string) => Promise<RunResult>} run Run one line typed by the player.
 * @property {() => Promise<Observation>} observe Snapshot the world.
 * @property {(line: string) => Promise<{line: string, candidates: string[]}>} complete
 *   Tab completion: the completed line, plus the candidates to list when the
 *   completion is ambiguous.
 * @property {(columns: number) => Promise<void>} resize Tell the shell how many
 *   character columns the terminal shows, as a real terminal resize does (ls lays out
 *   its columns for this width). Raises for anything but a positive integer.
 */

export {};
