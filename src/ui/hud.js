import { actName } from './panels.js';

const HEART = '<svg viewBox="0 0 7 6" width="21" height="18" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/></svg>';

/**
 * How full the XP bar is: the way from this rank's floor to the next rank.
 *
 * @param {number} xp Total XP.
 * @param {{floor: number, next: number|null}} rank The current rank; `next` is null at the top.
 * @returns {number} A percentage from 0 to 100.
 */
export function xpPercent(xp, { floor, next }) {
  if (next == null) return 100;
  return Math.min(100, Math.max(0, ((xp - floor) / (next - floor)) * 100));
}

/**
 * The HUD's line above the chapter title.
 *
 * @param {{act: number, number: number, total: number}} chapter From the View.
 * @returns {string} For example "Act I · Chapter 2 of 14".
 */
export function chapterLabel({ act, number, total }) {
  return `Act ${actName(act)} · Chapter ${number} of ${total}`;
}

/**
 * Pixel hearts, the lost ones dimmed.
 *
 * @param {{left: number, max: number}} hearts Hearts left and in all.
 * @returns {string} SVG markup.
 */
export function heartsHTML({ left, max }) {
  return Array.from({ length: max }, (_, i) => (i < left ? HEART : HEART.replace('<svg', '<svg class="lost"'))).join('');
}

const LAYOUT_BUTTON = {
  stacked: { text: 'Terminal: below', label: 'Terminal below the map. Switch to the terminal on the right', next: 'side' },
  side: { text: 'Terminal: right', label: 'Terminal on the right. Switch to the terminal below the map', next: 'stacked' },
};

/**
 * The layout switch: where the terminal is now, and the layout a click picks.
 *
 * @param {'stacked'|'side'} layout The layout in use.
 * @returns {{text: string, label: string, next: 'stacked'|'side'}} The button's text, its
 *   accessible name and the layout to switch to.
 */
export function layoutButton(layout) {
  return LAYOUT_BUTTON[layout];
}

/** The windows where the HUD starts collapsed to one slim bar. */
export const SMALL_WINDOW = '(max-width: 760px), (max-height: 699px)';

/**
 * Whether the HUD shows its buttons: the player's last choice, else open unless the window is small.
 *
 * @param {{small: boolean, chosen: boolean|null}} state Whether SMALL_WINDOW matches, and the player's choice.
 * @returns {boolean}
 */
export function hudOpen({ small, chosen }) {
  return chosen ?? !small;
}

/**
 * The HUD toggle's text and aria-expanded value.
 *
 * @param {boolean} open Whether the HUD is open.
 * @returns {{text: string, expanded: 'true'|'false'}}
 */
export function hudToggle(open) {
  return { text: open ? 'Hide menu' : 'Menu', expanded: String(open) };
}

/**
 * Draw the HUD from the View.
 *
 * @param {Document} doc The page.
 * @param {{chapter: object, xp: number, rank: object, hearts: {left: number, max: number}, sound: boolean, layout: 'stacked'|'side'}} view The session View.
 * @returns {void}
 */
export function renderHUD(doc, { chapter, xp, rank, hearts, sound, layout }) {
  const percent = xpPercent(xp, rank);
  doc.getElementById('chapNum').textContent = chapterLabel(chapter);
  doc.getElementById('chapName').textContent = chapter.title;
  doc.getElementById('xpFill').style.width = `${percent}%`;
  doc.getElementById('xpBar').setAttribute('aria-valuenow', String(Math.round(percent)));
  doc.getElementById('xpText').textContent = `${xp} XP`;
  doc.getElementById('rank').textContent = rank.title;
  const heartsEl = doc.getElementById('hearts');
  heartsEl.innerHTML = heartsHTML(hearts);
  heartsEl.setAttribute('aria-label', `${hearts.left} of ${hearts.max} hearts`);
  const soundBtn = doc.getElementById('soundBtn');
  soundBtn.textContent = `Sound: ${sound ? 'on' : 'off'}`;
  soundBtn.setAttribute('aria-pressed', String(sound));
  const { text, label } = layoutButton(layout);
  const layoutBtn = doc.getElementById('layoutBtn');
  layoutBtn.textContent = text;
  layoutBtn.setAttribute('aria-label', label);
  doc.getElementById('app').dataset.layout = layout;
}
