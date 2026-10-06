/**
 * The toast line over the map, as a queue: one toast at a time, none while a
 * card covers the page, and a toast a card cut short comes back when it closes.
 *
 * @param {object} io
 * @param {(html: string) => void} io.show Put a toast on screen.
 * @param {() => void} io.hide Take it away.
 * @param {(done: () => void) => {cancel: () => void}} io.wait Call `done` once the toast has been read.
 * @returns {{add: (html: string) => void, hold: () => void, release: () => void}} The queue.
 */
export function createToasts({ show, hide, wait }) {
  const pending = [];
  let current = null;
  let timer = null;
  let held = false;

  function pump() {
    if (current !== null || held || pending.length === 0) return;
    current = pending.shift();
    show(current);
    timer = wait(() => {
      hide();
      current = null;
      pump();
    });
  }

  function hold() {
    held = true;
    if (current === null) return;
    timer.cancel();
    hide();
    pending.unshift(current);
    current = null;
  }

  function release() {
    held = false;
    pump();
  }

  return {
    add(html) {
      pending.push(html);
      pump();
    },
    hold,
    release,
  };
}
