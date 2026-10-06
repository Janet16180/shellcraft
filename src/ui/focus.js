const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])';

/**
 * A keydown handler that keeps Tab and Shift+Tab cycling inside a dialog.
 *
 * @param {HTMLElement} container The dialog.
 * @returns {(event: KeyboardEvent) => void} The handler.
 */
export function keepFocusIn(container) {
  return event => {
    if (event.key !== 'Tab') return;
    const items = [...container.querySelectorAll(FOCUSABLE)];
    const edge = event.shiftKey ? items[0] : items.at(-1);
    if (container.ownerDocument.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? items.at(-1) : items[0]).focus();
  };
}
