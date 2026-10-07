/**
 * Synthesized 8-bit sound effects (no audio files), off until the player
 * turns them on. Each effect is a list of notes:
 * [frequency Hz, duration s, oscillator type, volume, delay s].
 */

const SFX = {
  key: [[1400, 0.012, 'square', 0.006, 0]],
  ok: [[660, 0.08, 'square', 0.04, 0], [990, 0.12, 'square', 0.04, 0.08]],
  err: [[140, 0.15, 'sawtooth', 0.035, 0]],
  level: [523, 659, 784, 1047, 1319].map((f, i) => [f, 0.16, 'square', 0.045, i * 0.11]),
  hurt: [[220, 0.1, 'sawtooth', 0.05, 0], [110, 0.25, 'sawtooth', 0.05, 0.1]],
  step: [[90, 0.05, 'triangle', 0.05, 0]],
  boss: [[196, 0.18, 'square', 0.045, 0], [185, 0.18, 'square', 0.045, 0.2], [147, 0.45, 'sawtooth', 0.04, 0.4]],
  hint: [[880, 0.06, 'triangle', 0.04, 0], [1175, 0.08, 'triangle', 0.035, 0.06]],
  discover: [1047, 1319, 1568, 2093].map((f, i) => [f, 0.09, 'triangle', 0.04, i * 0.06]),
  create: [[523, 0.06, 'square', 0.03, 0], [784, 0.08, 'square', 0.03, 0.05]],
  remove: [[330, 0.06, 'square', 0.03, 0], [196, 0.1, 'square', 0.03, 0.05]],
};

/**
 * Create the sound player. Browsers only allow audio after the player has
 * interacted with the page, so the audio context is made on the first sound.
 *
 * @returns {{setOn: (on: boolean) => void, play: (name: string) => void}} The player. `play`
 *   raises on a name it has no sound for, even while the sound is off.
 */
export function createSound() {
  let on = false;
  let audio = null;

  function note([freq, dur, type, vol, delay]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = audio.currentTime + delay;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * Play one effect, if the sound is on.
   *
   * @param {string} name One of the effects in SFX.
   * @returns {void}
   * @throws {Error} If there is no effect by that name, whether the sound is on or off.
   */
  function play(name) {
    if (!(name in SFX)) throw new Error(`unknown sound: ${name}`);
    if (!on) return;
    audio ??= new AudioContext();
    SFX[name].forEach(note);
  }

  return { setOn: value => { on = value; }, play };
}
