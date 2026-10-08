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
 * @typedef {object} RunResult
 * @property {OutputChunk[]} output What the terminal shows.
 * @property {number} status Exit status of the line (what `$?` becomes).
 * @property {CommandRecord[]} commands Every command that ran, in order.
 * @property {string[]} blocked Reasons the backend refused something a real
 *   system would have done, to protect the world (`rm -r ~`). Empty for a real backend
 *   that has no such guard.
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
