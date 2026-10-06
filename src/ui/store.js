/**
 * Where the session keeps its save: browser storage when the browser allows
 * it, memory for this visit when it does not (a private window, blocked site
 * data or a full quota). The session owns the keys and the format.
 */

function attempt(action, fallback) {
  try {
    return action();
  } catch (error) {
    // Browsers refuse storage with a DOMException (SecurityError, QuotaExceededError).
    if (!(error instanceof DOMException)) throw error;
    return fallback();
  }
}

/**
 * Create the store the session reads and writes.
 *
 * @param {() => Storage} getStorage Returns the storage; reaching it may itself throw.
 * @returns {{getItem: (key: string) => string|null, setItem: (key: string, text: string) => void}} A store that never throws on a refusal.
 */
export function createStore(getStorage) {
  const memory = new Map();
  return {
    getItem: key => (memory.has(key) ? memory.get(key) : attempt(() => getStorage().getItem(key), () => null)),
    setItem: (key, text) => attempt(() => {
      getStorage().setItem(key, text);
      memory.delete(key);
    }, () => memory.set(key, text)),
  };
}
