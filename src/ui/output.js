/**
 * Pure text helpers for the terminal: escaping, the prompt, and turning the
 * backend's output chunks into lines the page can append.
 */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape text for use inside HTML, attributes included.
 *
 * @param {string} text Any text.
 * @returns {string} The text with & < > " ' replaced by entities.
 */
export function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ENTITIES[c]);
}

/**
 * Show a path the way bash's \w does: the home directory and paths under it
 * start with a tilde.
 *
 * @param {string} path Absolute path.
 * @param {string} home Absolute path of the home directory.
 * @returns {string} The path to display.
 */
export function displayPath(path, home) {
  let shown = path;
  if (path === home) shown = '~';
  else if (path.startsWith(`${home}/`)) shown = `~${path.slice(home.length)}`;
  return shown;
}

/**
 * The prompt Ubuntu's default bash prints (user@host:dir$ ), as HTML.
 *
 * @param {{user: string, host: string, cwd: string, home: string}} prompt Who and where.
 * @returns {string} HTML ending with the sigil and a space.
 */
export function promptHTML({ user, host, cwd, home }) {
  const sigil = user === 'root' ? '#' : '$';
  return `<span class="pu">${esc(`${user}@${host}`)}</span>:<span class="pp">${esc(displayPath(cwd, home))}</span>${sigil} `;
}

/**
 * Turn one output chunk into a terminal line. The final newline a program
 * writes is dropped because each line is its own block.
 *
 * @param {import('../backend/port.js').OutputChunk} chunk One piece of output.
 * @returns {{cls: string, html: string} | null} Classes and HTML for the line, or null when there is nothing to show.
 */
export function chunkLine({ stream, text, html, tone }) {
  if (text === '' && !html) return null;
  const classes = ['ln'];
  if (stream !== 'out') classes.push(stream);
  if (tone) classes.push(`tone-${tone}`);
  let body = html ?? esc(text);
  body = body.endsWith('\n') ? body.slice(0, -1) : body;
  if (stream === 'note') body = `» ${body}`;
  return { cls: classes.join(' '), html: body };
}
