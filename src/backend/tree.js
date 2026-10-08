/**
 * Questions about the observed tree that every layer asks: what is at a path
 * (following symbolic links as the kernel does), path arithmetic (parent, base name, join), whether a path lies inside a
 * directory, and the order names sort in. One home for them, so the shell,
 * the rules, the map and the page agree.
 */

/**
 * One entry of a directory by name. Only the directory's own entries count,
 * so a name like `constructor` or `__proto__` never finds what a plain object
 * inherits.
 *
 * @param {object|null} node A TreeNode, or null.
 * @param {string} name An entry name.
 * @returns {object|null} The entry, or null if node is not a directory holding it.
 */
export function childOf(node, name) {
  const children = node?.children;
  return children && Object.hasOwn(children, name) ? children[name] : null;
}

/** How many symbolic links Linux follows while resolving one path before it gives up (ELOOP). */
export const MAX_SYMLINKS = 40;

const namesOf = path => path.split('/').filter(Boolean);

/**
 * Walk a path one name at a time, the way the kernel resolves it: a symbolic
 * link is replaced by its target text (from the root if the text is absolute,
 * else from the link's directory), and `..` goes up from wherever the walk is.
 * A link in the last place is followed only when `follow` is true or the path
 * ends in a slash.
 *
 * @param {{name: string, node: object}[]} start Where the walk begins: the root first, then each
 *   directory down to the starting one. A path starting with `/` begins at the root.
 * @param {string} path The path.
 * @param {{follow?: boolean, check?: (dir: object, name: string, stack: object[]) => string|null}} [opts]
 *   Follow a link in the last place; `check` may refuse a step with an error code (EACCES).
 * @returns {{stack: {name: string, node: object|null}[], error: 'ENOENT'|'ENOTDIR'|'ELOOP'|string|null, parent: object|null}}
 *   The directories walked through and what the walk reached. On ENOENT at the
 *   last name, the stack ends with that name and a null node, and `parent` is
 *   the directory it would be created in; otherwise `parent` is null.
 */
export function walkPath(start, path, { follow = true, check = () => null } = {}) {
  const walk = { stack: path.startsWith('/') ? [start[0]] : [...start], queue: namesOf(path), error: null, parent: null, hops: 0 };
  const followLast = follow || /[^/]\/+$/.test(path);
  while (!walk.error && walk.queue.length) step(walk, walk.queue.shift(), followLast, check);
  return { stack: walk.stack, error: walk.error, parent: walk.parent };
}

function step(walk, name, followLast, check) {
  const { stack, queue } = walk;
  const dir = stack.at(-1).node;
  const last = queue.length === 0;
  walk.error = dir.type === 'dir' ? check(dir, name, stack) : 'ENOTDIR';
  const child = walk.error ? null : childOf(dir, name);
  if (walk.error || name === '.') return;
  if (name === '..') {
    if (stack.length > 1) stack.pop();
  } else if (child?.type === 'symlink' && (!last || followLast)) {
    walk.hops++;
    if (walk.hops > MAX_SYMLINKS) walk.error = 'ELOOP';
    else if (child.target.startsWith('/')) stack.length = 1;
    queue.unshift(...namesOf(child.target));
  } else if (child) {
    stack.push({ name, node: child });
  } else {
    walk.error = 'ENOENT';
    if (last) {
      walk.parent = dir;
      stack.push({ name, node: null });
    }
  }
}

/**
 * Find the node at an absolute path in an observed tree, following symbolic
 * links like `stat` does (or, with `follow: false`, like `lstat`: a link in
 * the last place is returned itself).
 *
 * @param {object} tree The TreeNode rooted at '/'.
 * @param {string} path Absolute path.
 * @param {{follow?: boolean}} [opts] Follow a symbolic link in the last place (default true).
 * @returns {object|null} The node, or null if nothing is there (a dangling link or a loop included).
 * @throws {Error} If path is not absolute.
 */
export function nodeAt(tree, path, { follow = true } = {}) {
  requireAbsolute(path);
  const walked = walkPath([{ name: '', node: tree }], path, { follow });
  return walked.error ? null : walked.stack.at(-1).node;
}

function requireAbsolute(path) {
  if (!path.startsWith('/')) throw new Error(`path must be absolute, got ${path}`);
}

/**
 * The parent directory of a path; the root is its own parent.
 *
 * @param {string} path Absolute path without a trailing slash (or '/').
 * @returns {string} The parent's absolute path.
 * @throws {Error} If path is not absolute.
 */
export function parentOf(path) {
  requireAbsolute(path);
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

/**
 * The last name of a path.
 *
 * @param {string} path Absolute path without a trailing slash (or '/').
 * @returns {string} The name after the last slash; '' for '/'.
 * @throws {Error} If path is not absolute.
 */
export function baseName(path) {
  requireAbsolute(path);
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Join a name onto a directory path with exactly one slash between them.
 *
 * @param {string} dir A directory path, '/' included.
 * @param {string} name An entry name.
 * @returns {string} The entry's path.
 */
export function joinPath(dir, name) {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

/**
 * Whether a path is a directory itself or lies below it. Both are absolute.
 *
 * @param {string} path The path to test.
 * @param {string} dir The directory.
 * @returns {boolean} True for dir itself and everything under it.
 */
export function isInside(path, dir) {
  const prefix = dir.endsWith('/') ? dir : `${dir}/`;
  return path === dir || path.startsWith(prefix);
}

/**
 * Compare two names the way LC_ALL=C.UTF-8 sorts them: by code point, which
 * is the order of their UTF-8 bytes. Capitals sort before lowercase, and a
 * leading dot is an ordinary character.
 *
 * @param {string} x A name.
 * @param {string} y Another name.
 * @returns {number} Negative, zero or positive, for Array.prototype.sort.
 */
export function compareNames(x, y) {
  const a = [...x];
  const b = [...y];
  const n = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < n && diff === 0; i++) diff = a[i].codePointAt(0) - b[i].codePointAt(0);
  return diff || a.length - b.length;
}
