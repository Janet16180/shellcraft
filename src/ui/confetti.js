/**
 * Square pixel confetti on a full-screen canvas, after Ring Zero's Pixel
 * Dungeon celebration. Nothing is drawn when the player prefers reduced motion.
 */

const COLOR_TOKENS = ['--c-gold', '--c-ember', '--c-leaf', '--c-lilac', '--c-blood', '--c-bone'];
const GRID = 3;
const MAX_MS = 6000;

/**
 * Burst confetti from points on the screen.
 *
 * @param {HTMLCanvasElement} canvas The full-screen confetti canvas.
 * @param {object} [opts]
 * @param {number[][]} [opts.origins] [x, y] as fractions of the screen.
 * @param {number} [opts.count] Pieces per origin.
 * @returns {void}
 */
export function confetti(canvas, { origins = [[0.5, 0.35]], count = 70 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = devicePixelRatio || 1;
  const width = innerWidth;
  const height = innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const style = getComputedStyle(document.documentElement);
  const colors = COLOR_TOKENS.map(token => style.getPropertyValue(token).trim());
  const parts = origins.flatMap(([x, y]) => Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    return {
      x: x * width,
      y: y * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      life: 1,
      decay: 0.006 + Math.random() * 0.01,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 1 + Math.floor(Math.random() * 3),
    };
  }));
  const started = performance.now();

  function frame(now) {
    ctx.clearRect(0, 0, width, height);
    const alive = parts.filter(p => p.life > 0);
    for (const p of alive) {
      p.vx *= 0.97;
      p.vy = p.vy * 0.97 + 0.22;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      // Hard-edged squares that move on a 3px grid.
      ctx.fillRect(Math.round(p.x / GRID) * GRID, Math.round(p.y / GRID) * GRID, p.size * GRID, p.size * GRID);
    }
    if (alive.length && now - started < MAX_MS) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, width, height);
  }
  requestAnimationFrame(frame);
}
