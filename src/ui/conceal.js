/**
 * Keeps paths the game has not let the player find yet (a boss room's note
 * before ls) off the map: the map, its room buttons and its words draw from
 * the concealed observation, the shell and the checks keep the real one.
 */

function without(node, parts) {
  const [name, ...rest] = parts;
  const child = node.children?.[name];
  if (!child) return node;
  const children = { ...node.children };
  if (rest.length === 0) delete children[name];
  else children[name] = without(child, rest);
  return { ...node, children };
}

/**
 * @param {object} obs An Observation.
 * @param {string[]} paths Absolute paths to leave out.
 * @returns {object} The observation without those paths; the same object when there are none.
 */
export function conceal(obs, paths) {
  if (paths.length === 0) return obs;
  const tree = paths.reduce((node, path) => without(node, path.split('/').filter(Boolean)), obs.tree);
  return { ...obs, tree };
}

/**
 * @param {object[]} effects A turn's effects.
 * @param {string[]} paths Absolute paths to leave out.
 * @returns {object[]} The effects that do not touch those paths.
 */
export const concealEffects = (effects, paths) => effects.filter(e => !paths.includes(e.path));
