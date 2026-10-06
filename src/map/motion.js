/**
 * Tweens and particles, driven by the frame clock. Nothing here touches a
 * canvas: the map calls step(now) once per frame and draws the particles.
 * With reduced motion every tween ends at once and bursts throw nothing.
 */

const FRAME = 1000 / 60;
const GRAVITY = 0.04;

/**
 * @typedef {{x: number, y: number, vx: number, vy: number, life: number, colour: string}} Particle
 */

/**
 * Create a motion clock.
 *
 * @param {{reducedMotion: boolean, random: () => number}} opts Reduced motion, and the randomness for particles.
 * @returns {{tween: (ms: number, fn: (p: number) => void) => Promise<void>, wait: (ms: number) => Promise<void>,
 *   burst: (x: number, y: number, colours: string[], count?: number, speed?: number) => void,
 *   step: (now: number) => void, finish: () => void, busy: () => boolean, particles: Particle[]}} The clock.
 */
export function createMotion({ reducedMotion, random }) {
  const tweens = [];
  const particles = [];
  let last = null;

  function tween(ms, fn) {
    if (reducedMotion) {
      fn(1);
      return Promise.resolve();
    }
    return new Promise(resolve => tweens.push({ start: null, ms, fn, resolve }));
  }

  function burst(x, y, colours, count = 24, speed = 1.6) {
    if (reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const v = (0.4 + random()) * speed;
      particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 0.6, life: 40 + random() * 30, colour: colours[i % colours.length] });
    }
  }

  function stepTweens(now) {
    for (const tw of [...tweens]) {
      tw.start ??= now;
      const p = Math.min(1, (now - tw.start) / tw.ms);
      tw.fn(p);
      if (p < 1) continue;
      tweens.splice(tweens.indexOf(tw), 1);
      tw.resolve();
    }
  }

  function stepParticles(frames) {
    for (const pt of [...particles]) {
      pt.x += pt.vx * frames;
      pt.y += pt.vy * frames;
      pt.vy += GRAVITY * frames;
      pt.life -= frames;
      if (pt.life <= 0) particles.splice(particles.indexOf(pt), 1);
    }
  }

  function step(now) {
    stepTweens(now);
    stepParticles(last === null ? 0 : Math.min(4, (now - last) / FRAME));
    last = now;
  }

  function finish() {
    for (const tw of tweens.splice(0)) {
      tw.fn(1);
      tw.resolve();
    }
  }

  return {
    tween,
    wait: ms => tween(ms, () => {}),
    burst,
    step,
    finish,
    busy: () => tweens.length > 0,
    particles,
  };
}
