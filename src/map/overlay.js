/**
 * Everything drawn at screen resolution over the scaled-up picture: name
 * labels, speech bubbles, banners and fades. Names are always IBM Plex Mono so
 * that Z/2, 0/O and 1/l/I never look alike; the pixel font is for titles only.
 */

import { fitLabel } from './layout.js';
import { LABEL, NIGHT, INK } from './palette.js';

/** The font of every name label. */
export const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const TITLE = '"Pixelify Sans", "IBM Plex Mono", monospace';

/**
 * @typedef {object} View How art pixels map to the screen canvas.
 * @property {number} scale Device pixels per art pixel.
 * @property {number} ox Left edge of the picture, device pixels.
 * @property {number} oy Top edge of the picture, device pixels.
 * @property {number} dpr Device pixels per CSS pixel.
 * @property {number} font Label font size, device pixels.
 * @property {number} width Canvas width, device pixels.
 * @property {number} height Canvas height, device pixels.
 */

const sx = (view, x) => view.ox + x * view.scale;
const sy = (view, y) => view.oy + y * view.scale;

function tag(g, view, text, x, y, { colour, anchor = 'top', ring = false }) {
  g.font = `${view.font}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const pad = Math.round(view.font * 0.3);
  const w = Math.ceil(g.measureText(text).width) + 2 * pad;
  const h = Math.round(view.font * 1.3);
  const top = Math.round(anchor === 'bottom' ? y - h : anchor === 'middle' ? y - h / 2 : y);
  const left = Math.round(x - w / 2);
  g.fillStyle = LABEL.back;
  g.fillRect(left, top, w, h);
  if (ring) {
    g.strokeStyle = LABEL.hover;
    g.lineWidth = Math.max(1, Math.round(view.dpr));
    g.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
  }
  g.fillStyle = colour;
  g.fillText(text, x, top + h / 2 + view.font * 0.05);
}

function charsIn(g, view, slot) {
  g.font = `${view.font}px ${MONO}`;
  return Math.max(3, Math.floor((slot * view.scale) / g.measureText('M').width) - 1);
}

function itemColour(item) {
  let colour = LABEL.item;
  if (item.hidden) colour = LABEL.hidden;
  else if (item.runnable) colour = LABEL.runnable;
  return colour;
}

function statusText(layout) {
  const texts = { dark: 'too dark to see: no read permission', gone: 'this directory no longer exists' };
  return texts[layout.status] ?? null;
}

/**
 * Label every door, item, marker and the exit with its real name.
 *
 * @param {CanvasRenderingContext2D} g The screen canvas.
 * @param {View} view The mapping.
 * @param {import('./layout.js').Layout} layout The room.
 * @param {string[]} ringed Paths whose labels get a gold ring (under the pointer, or in focus).
 */
export function drawLabels(g, view, layout, ringed) {
  const gap = 2 * view.dpr;
  for (const door of layout.doors) {
    const text = fitLabel(door.name, charsIn(g, view, door.slot), '/');
    tag(g, view, text, sx(view, door.cx), sy(view, door.y - 2) - gap, { colour: door.hidden ? LABEL.hidden : LABEL.door, anchor: 'bottom', ring: ringed.includes(door.path) });
  }
  for (const item of layout.items) {
    const text = fitLabel(item.name, charsIn(g, view, item.slot));
    tag(g, view, text, sx(view, item.cx), sy(view, item.y + item.h + 1) + gap, { colour: itemColour(item), ring: ringed.includes(item.path) });
  }
  if (layout.moreDoors) tag(g, view, `+${layout.moreDoors.count}`, sx(view, layout.moreDoors.cx), sy(view, layout.moreDoors.y + 15), { colour: LABEL.more, anchor: 'middle' });
  if (layout.moreItems) tag(g, view, `+${layout.moreItems.count} more`, sx(view, layout.moreItems.cx), sy(view, layout.moreItems.y + 17) + gap, { colour: LABEL.more });
  if (layout.exit) tag(g, view, '..', sx(view, layout.exit.x + layout.exit.w + 12), sy(view, layout.exit.y + 7), { colour: LABEL.door, anchor: 'middle', ring: ringed.includes(layout.exit.path) });
  else tag(g, view, '/ (the root of everything)', sx(view, 160), sy(view, 193), { colour: LABEL.door, anchor: 'middle' });
  const status = statusText(layout);
  if (status) tag(g, view, status, sx(view, 160), sy(view, 110), { colour: LABEL.item, anchor: 'middle' });
}

/**
 * Label every creature with "PID name" under its feet, kept inside the picture.
 *
 * @param {CanvasRenderingContext2D} g The screen canvas.
 * @param {View} view The mapping.
 * @param {{label: string, x: number, y: number}[]} creatures The creatures, with their current centres.
 */
export function drawCreatureLabels(g, view, creatures) {
  g.font = `${view.font}px ${MONO}`;
  const pad = Math.round(view.font * 0.3);
  const left = sx(view, 0);
  const right = sx(view, 320);
  for (const { label, x, y } of creatures) {
    const half = Math.ceil(g.measureText(label).width) / 2 + pad;
    const cx = Math.max(left + half, Math.min(right - half, sx(view, x)));
    tag(g, view, label, cx, sy(view, y + 15), { colour: LABEL.creature });
  }
}

/**
 * Draw speech bubbles over their speakers.
 *
 * @param {CanvasRenderingContext2D} g The screen canvas.
 * @param {View} view The mapping.
 * @param {{text: string, who: string}[]} bubbles The bubbles to show.
 * @param {Record<string, {x: number, y: number}>} anchors Art position of each speaker's head.
 */
export function drawBubbles(g, view, bubbles, anchors) {
  g.font = `${view.font}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const { text, who } of bubbles) {
    const at = anchors[who] ?? anchors.player;
    const dark = who !== 'player' && who in anchors;
    const w = Math.min(view.width - 12 * view.dpr, g.measureText(text).width + view.font * 1.4);
    const h = Math.round(view.font * 1.9);
    const left = Math.max(6 * view.dpr, Math.min(view.width - 6 * view.dpr - w, sx(view, at.x) - w / 2));
    const bottom = Math.max(h + 4 * view.dpr, sy(view, at.y));
    g.fillStyle = dark ? '#2a0f3d' : '#fff8e6';
    g.fillRect(left, bottom - h, w, h);
    g.strokeStyle = dark ? '#c79bff' : '#1b1633';
    g.lineWidth = 2 * view.dpr;
    g.strokeRect(left, bottom - h, w, h);
    g.fillStyle = dark ? '#f0dcff' : '#1b1633';
    g.fillText(text, left + w / 2, bottom - h / 2, w - view.font);
  }
}

/**
 * Draw a banner across the middle: a title in the pixel font and a subtitle
 * (which may hold paths) in the mono font.
 *
 * @param {CanvasRenderingContext2D} g The screen canvas.
 * @param {View} view The mapping.
 * @param {{title: string, sub: string}} banner The text.
 * @param {number} alpha Opacity, for fading in and out.
 */
export function drawBanner(g, view, { title, sub }, alpha) {
  const top = sy(view, 72);
  const h = 56 * view.scale;
  const rule = Math.max(2, Math.round(1.5 * view.scale));
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(10, 8, 24, 0.88)';
  g.fillRect(view.ox, top, 320 * view.scale, h);
  g.fillStyle = INK.o;
  g.fillRect(view.ox, top, 320 * view.scale, rule);
  g.fillRect(view.ox, top + h - rule, 320 * view.scale, rule);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.round(view.font * 2.1)}px ${TITLE}`;
  g.fillStyle = INK.y;
  g.fillText(title, sx(view, 160), top + h * 0.4, 300 * view.scale);
  g.font = `${view.font}px ${MONO}`;
  g.fillStyle = INK.l;
  g.fillText(sub, sx(view, 160), top + h * 0.76, 300 * view.scale);
  g.globalAlpha = 1;
}

/**
 * Cover the picture with a colour, for fades and flashes.
 *
 * @param {CanvasRenderingContext2D} g The screen canvas.
 * @param {View} view The mapping.
 * @param {number} alpha Opacity.
 * @param {string} [colour] CSS colour; the night blue by default.
 */
export function drawVeil(g, view, alpha, colour = NIGHT) {
  if (alpha <= 0) return;
  g.globalAlpha = alpha;
  g.fillStyle = colour;
  g.fillRect(view.ox, view.oy, 320 * view.scale, 200 * view.scale);
  g.globalAlpha = 1;
}
