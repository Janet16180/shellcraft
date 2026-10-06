/**
 * Who the player is on the machine: one definition for every layer. The
 * composition root passes it to the backend, the base world builds /etc and
 * the home from it, and the page reads it from the observation, never as a
 * literal.
 *
 * @type {Readonly<{user: string, host: string, home: string}>}
 */
export const PLAYER = Object.freeze({ user: 'hero', host: 'kernelia', home: '/home/hero' });
