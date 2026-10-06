/**
 * The simulator's short manual pages: what `man NAME` and `NAME --help` print.
 */

const PAGES = {
  ls: ['list directory contents', 'ls [OPTION]... [FILE]...', 'List information about the FILEs (the current directory by default).',
    [['-a', 'do not ignore entries starting with .'], ['-A', 'like -a, but without . and ..'], ['-l', 'use a long listing format'], ['-h', 'with -l, print sizes like 4.0K'], ['-r', 'reverse order while sorting'], ['-1', 'list one file per line'], ['-F', 'append indicator (/ for directories, * for executables)'], ['-d', 'list directories themselves, not their contents']]],
  pwd: ['print name of current/working directory', 'pwd [OPTION]...', 'Print the full filename of the current working directory.', []],
  cat: ['concatenate files and print on the standard output', 'cat [OPTION]... [FILE]...', 'Concatenate FILE(s) to standard output. With no FILE, read standard input.', [['-n', 'number all output lines']]],
  echo: ['display a line of text', 'echo [OPTION]... [STRING]...', 'Echo the STRING(s) to standard output.', [['-n', 'do not output the trailing newline'], ['-e', 'enable interpretation of backslash escapes like \\n']]],
  mkdir: ['make directories', 'mkdir [OPTION]... DIRECTORY...', 'Create the DIRECTORY(ies), if they do not already exist.', [['-p', 'no error if existing, make parent directories as needed'], ['-v', 'print a message for each created directory']]],
  touch: ['change file timestamps', 'touch [OPTION]... FILE...', 'Update the modification time of each FILE. A FILE that does not exist is created empty.', []],
  rm: ['remove files or directories', 'rm [OPTION]... [FILE]...', 'Remove each FILE. By default, it does not remove directories. There is no undo.', [['-f', 'ignore nonexistent files, never prompt'], ['-i', 'prompt before every removal'], ['-r, -R', 'remove directories and their contents recursively'], ['-v', 'explain what is being done']]],
  rmdir: ['remove empty directories', 'rmdir [OPTION]... DIRECTORY...', 'Remove the DIRECTORY(ies), if they are empty.', []],
  cp: ['copy files and directories', 'cp [OPTION]... SOURCE... DEST', 'Copy SOURCE to DEST, or multiple SOURCE(s) into directory DEST.', [['-r, -R', 'copy directories recursively'], ['-i', 'prompt before overwrite'], ['-n', 'do not overwrite an existing file'], ['-v', 'explain what is being done']]],
  mv: ['move (rename) files', 'mv [OPTION]... SOURCE... DEST', 'Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY.', [['-i', 'prompt before overwrite'], ['-n', 'do not overwrite an existing file'], ['-v', 'explain what is being done']]],
  head: ['output the first part of files', 'head [OPTION]... [FILE]...', 'Print the first 10 lines of each FILE to standard output.', [['-n NUM', 'print the first NUM lines instead of the first 10']]],
  tail: ['output the last part of files', 'tail [OPTION]... [FILE]...', 'Print the last 10 lines of each FILE to standard output.', [['-n NUM', 'output the last NUM lines'], ['-n +NUM', 'output starting with line NUM'], ['-f', 'output appended data as the file grows']]],
  wc: ['print newline, word, and byte counts for each file', 'wc [OPTION]... [FILE]...', 'Print newline, word, and byte counts for each FILE, and a total line if more than one FILE is given.', [['-l', 'print the newline counts'], ['-w', 'print the word counts'], ['-c', 'print the byte counts']]],
  grep: ['print lines that match patterns', 'grep [OPTION]... PATTERNS [FILE]...', 'Search for PATTERNS in each FILE and print each line that matches.', [['-i', 'ignore case distinctions'], ['-v', 'select non-matching lines'], ['-n', 'print line number with output lines'], ['-c', 'print only a count of matching lines per FILE'], ['-r', 'search directories recursively'], ['-l', 'print only names of FILEs with matches'], ['-w', 'match only whole words']]],
  find: ['search for files in a directory hierarchy', 'find [PATH...] [EXPRESSION]', 'Walk the directory tree rooted at each PATH and print the names that match the expression.', [['-name PATTERN', 'base name matches the shell pattern (quote it!)'], ['-iname PATTERN', 'like -name, but case insensitive'], ['-type f|d', 'regular file or directory'], ['-maxdepth N', 'descend at most N levels']]],
  sort: ['sort lines of text files', 'sort [OPTION]... [FILE]...', 'Write the sorted lines of all FILE(s) to standard output.', [['-r', 'reverse the result'], ['-n', 'compare according to numerical value'], ['-u', 'output only the first of equal lines'], ['-f', 'ignore case']]],
  uniq: ['report or omit repeated lines', 'uniq [OPTION]... [INPUT [OUTPUT]]', 'Filter ADJACENT matching lines from INPUT. Sort the input first to catch all duplicates.', [['-c', 'prefix lines by the number of occurrences'], ['-d', 'only print duplicate lines'], ['-u', 'only print unique lines'], ['-i', 'ignore case']]],
  chmod: ['change file mode bits', 'chmod [OPTION]... MODE FILE...', 'Change the permissions of each FILE. MODE is octal (755) or symbolic ([ugoa][+-=][rwx], e.g. u+x).', [['-R', 'change files and directories recursively']]],
  ps: ['report a snapshot of the current processes', 'ps [OPTIONS]', 'Show processes. With no options, only those of the current terminal.', [['aux', 'every process, with user, CPU and memory (BSD style)'], ['-e', 'every process (standard style)'], ['-ef', 'every process, full format']]],
  kill: ['send a signal to a process', 'kill [-SIGNAL] PID...', 'Send a signal (SIGTERM by default) to the given process IDs.', [['-9, -KILL', 'SIGKILL: cannot be caught or ignored'], ['-15, -TERM', 'SIGTERM: polite request to terminate (default)'], ['-l', 'list signal names']]],
  pkill: ['look up or signal processes based on name', 'pkill [-SIGNAL] PATTERN', 'Signal every process whose name matches PATTERN.', []],
  top: ['display Linux processes', 'top', 'A live, updating view of processes sorted by CPU usage. Press q to quit.', []],
  man: ['an interface to the system reference manuals', 'man [man options] [[section] page ...] ...', 'Find and display the manual page for each PAGE, usually the name of a program, utility or function.', [['-k KEYWORD', 'search the short descriptions for KEYWORD (like apropos)'], ['-f PAGE', 'show the one-line description of PAGE (like whatis)']]],
  apropos: ['search the manual page names and descriptions', 'apropos [-dalv?V] [-e|-w|-r] [-s list] [-m system[,...]] [-M path] [-L locale] [-C file] keyword ...', 'Search the names and short descriptions of the manual pages for each keyword. Same as man -k.', []],
  whatis: ['display one-line manual page descriptions', 'whatis [-dlv?V] [-r|-w] [-s list] [-m system[,...]] [-M path] [-L locale] [-C file] name ...', 'Print the one-line description of each named manual page. Same as man -f.', []],
  whoami: ['print effective user name', 'whoami [OPTION]...', 'Print the user name associated with the current effective user ID.  Same as id -un.', []],
  who: ['show who is logged on', 'who [OPTION]... [ FILE | ARG1 ARG2 ]', 'Print information about users who are currently logged in.', [['-H', 'print line of column headings'], ['-m', 'only hostname and user associated with stdin'], ['-q', 'all login names and number of users logged on'], ['-s', 'print only name, line, and time (default)']]],
  clear: ['clear the terminal screen', 'clear [-x] [-T terminal-type]', 'Clear the terminal screen and its scrollback buffer.', [['-T type', 'use this terminal type instead of $TERM'], ['-V', 'print the curses version'], ['-x', 'do not try to clear the scrollback buffer']]],
  dir: ['list directory contents', 'dir [OPTION]... [FILE]...', 'List information about the FILEs (the current directory by default), in columns, with special characters escaped.', []],
  tree: ['list contents of directories in a tree-like format', 'tree [OPTION]... [DIRECTORY]', 'Recursively list directories as an indented tree.', [['-a', 'include hidden files'], ['-d', 'list directories only'], ['-L LEVEL', 'descend only LEVEL directories deep']]],
  less: ['opposite of more (a file pager)', 'less FILE', 'View a file one screen at a time. Space: next page, b: back, /word: search, q: quit.', []],
  which: ['locate a command', 'which COMMAND...', 'Print the full path of the program that would run for each COMMAND.', []],
  date: ['print or set the system date and time', 'date', 'Display the current date and time.', []],
  uname: ['print system information', 'uname [OPTION]...', 'Print certain system information. With no option, same as -s.', [['-a', 'print all information'], ['-r', 'print the kernel release']]],
};

/**
 * @param {string} name A command with a page.
 * @returns {string} The note shown with its short `--help`.
 */
export const shortHelpNote = name => `Real ${name} --help prints a longer list of options.`;

/**
 * @param {string} name A command name.
 * @returns {boolean} Whether the simulator has a page for it.
 */
export const hasManPage = name => Object.hasOwn(PAGES, name);

/**
 * @returns {{name: string, description: string}[]} Every page's name and one-line description.
 */
export const manEntries = () => Object.entries(PAGES).map(([name, [description]]) => ({ name, description }));

/**
 * Render a page.
 *
 * @param {string} name A command with a page.
 * @param {boolean} short True for the `--help` usage text, false for the full man page.
 * @returns {string} The text, ending in a newline.
 * @throws {Error} If there is no page for the command.
 */
export function manText(name, short) {
  if (!hasManPage(name)) throw new Error(`no manual page for ${name}`);
  const [desc, synopsis, body, opts] = PAGES[name];
  let text;
  if (short) {
    text = `Usage: ${synopsis}\n${body}\n${opts.map(([f, t]) => `  ${f.padEnd(14)} ${t}\n`).join('')}`;
  } else {
    text = `${name.toUpperCase()}(1)                User Commands\n\nNAME\n       ${name} - ${desc}\n\nSYNOPSIS\n       ${synopsis}\n\nDESCRIPTION\n       ${body}\n`;
    if (opts.length) text += `\nOPTIONS\n${opts.map(([f, t]) => `       ${f}\n              ${t}\n`).join('')}`;
  }
  return text;
}
