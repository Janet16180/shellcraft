/**
 * Every colour the map uses. Sprites are grids of letters; each sprite names
 * the palette its letters come from.
 */

/** Ring Zero's 16-colour Pixel Dungeon palette: the dungeon is drawn from it. */
export const INK = {
  k: '#0b0a12', n: '#1c1930', d: '#353050', s: '#615b80',
  l: '#a3a0bf', w: '#f4f0e4', r: '#5e2e22', b: '#a24f34',
  o: '#f08a2a', y: '#ffd348', g: '#3e7a3c', G: '#8fd14f',
  u: '#2c5aa8', p: '#6d2f9c', v: '#c792ff', e: '#e2434f',
};

/** The original game's sprite colours: the hero, scrolls, gems, potions, the daemon. */
export const TOON = {
  h: '#7b5cff', y: '#ffd36b', s: '#f2c9a0', e: '#1b1633', r: '#4a3aa8', b: '#2a2140', w: '#f3e3bd',
  d: '#c9a26b', k: '#8a6a44', o: '#ff7a3d', g: '#9be15d', l: '#e8ffd0', G: '#8d93a8', c: '#cfd8ff',
};

/** Palettes by the name a sprite gives in its `pal` field. */
export const PALETTES = { ink: INK, toon: TOON };

/** The Shadow Daemon: its body, its eyes (and its flash), its ghostly highlight. */
export const DAEMON = { body: '#3b1d5c', eye: '#ff3355', glow: '#e8d7ff' };

/** A dangling symlink: the portal sprite gone cold, grey with a red core. */
export const BROKEN_PORTAL = { v: '#a3a0bf', p: '#615b80', n: '#353050', w: '#e2434f' };

/** Gem colours by the word in the file name: body, highlight, shadow. */
export const GEMS = {
  ruby: { c: '#ff4d6d', l: '#ffb3c1', d: '#a3122f' },
  sapphire: { c: '#4d7cff', l: '#bcd0ff', d: '#1f3a99' },
  emerald: { c: '#3ddc84', l: '#c6ffe0', d: '#137a43' },
  opal: { c: '#f5e6ff', l: '#ffffff', d: '#b68fd6' },
};

/**
 * The other people of the realm, as the hero's sprite recoloured: h is the
 * hat, r the robe. Mira and oren are smiths, tamsin
 * a scribe.
 */
export const PEOPLE = {
  mira: { h: '#e2434f', r: '#a24f34' },
  oren: { h: '#8fd14f', r: '#2c5aa8' },
  tamsin: { h: '#ffd348', r: '#3e7a3c' },
};

/** Label colours match ls --color: directories blue, executables green. */
export const LABEL = {
  back: 'rgba(11, 10, 18, 0.86)',
  door: '#8fbaff',
  item: '#efe6d2',
  runnable: '#9be15d',
  hidden: '#c8c2e6',
  locked: '#ff8a94',
  link: '#6fe0e8',
  orphan: '#ff5c66',
  more: '#ffd348',
  creature: '#ffab8a',
  hover: '#ffd348',
};

/** The night-blue the original used for fades, banners and the gaps around the picture. */
export const NIGHT = '#0a0818';
