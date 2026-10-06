/**
 * Path arithmetic for the map. Paths here are already absolute and normalized
 * (the backend reports them that way), so no `.` or `..` handling is needed.
 */

/**
 * The parent directory of a path; the root is its own parent.
 *
 * @param {string} path Absolute path.
 * @returns {string} The parent's absolute path.
 */
export function parentOf(path) {
  return path.slice(0, path.lastIndexOf('/')) || '/';
}

/**
 * Join a name onto a directory path.
 *
 * @param {string} dir Absolute directory path.
 * @param {string} name One path component.
 * @returns {string} The child's absolute path.
 */
export function joinPath(dir, name) {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}
