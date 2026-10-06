import { actName } from './panels.js';

const MAX_HEARTS = 3;
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
 * @param {number} hearts Hearts left.
 * @param {number} [max] Hearts in all.
 * @returns {string} SVG markup.
 */
export function heartsHTML(hearts, max = MAX_HEARTS) {
  return Array.from({ length: max }, (_, i) => (i < hearts ? HEART : HEART.replace('<svg', '<svg class="lost"'))).join('');
}

/**
 * Draw the HUD from the View.
 *
 * @param {Document} doc The page.
 * @param {{chapter: object, xp: number, rank: object, hearts: number, sound: boolean}} view The session View.
 * @returns {void}
 */
export function renderHUD(doc, { chapter, xp, rank, hearts, sound }) {
  const percent = xpPercent(xp, rank);
  doc.getElementById('chapNum').textContent = chapterLabel(chapter);
  doc.getElementById('chapName').textContent = chapter.title;
  doc.getElementById('xpFill').style.width = `${percent}%`;
  doc.getElementById('xpBar').setAttribute('aria-valuenow', String(Math.round(percent)));
  doc.getElementById('xpText').textContent = `${xp} XP`;
  doc.getElementById('rank').textContent = rank.title;
  const heartsEl = doc.getElementById('hearts');
  heartsEl.innerHTML = heartsHTML(hearts);
  heartsEl.setAttribute('aria-label', `${hearts} of ${MAX_HEARTS} hearts`);
  const soundBtn = doc.getElementById('soundBtn');
  soundBtn.textContent = `Sound: ${sound ? 'on' : 'off'}`;
  soundBtn.setAttribute('aria-pressed', String(sound));
}
