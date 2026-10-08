/**
 * A button that acts only on a second click, so one stray click never throws
 * progress away. Leaving the button disarms it.
 */

/**
 * Make a button ask for a second click before it runs.
 *
 * @param {HTMLButtonElement} button The button.
 * @param {{label: string, confirm: string, run: () => (void|Promise<void>)}} opts Its text, its
 *   text once armed, and what the second click does.
 * @returns {void}
 */
export function wireConfirm(button, { label, confirm, run }) {
  let armed = false;
  const disarm = () => {
    armed = false;
    button.textContent = label;
  };
  button.addEventListener('click', async () => {
    armed = !armed;
    button.textContent = armed ? confirm : label;
    if (!armed) await run();
  });
  button.addEventListener('blur', disarm);
}
