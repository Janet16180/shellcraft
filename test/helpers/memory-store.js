/**
 * A Storage-like store (getItem, setItem) kept in a Map, standing in for
 * window.localStorage in tests.
 *
 * @param {Record<string, string>} [initial] Stored text by key.
 * @returns {{getItem: (key: string) => string|null, setItem: (key: string, text: string) => void, items: Map<string, string>}} The store.
 */
export function createMemoryStore(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: key => items.get(key) ?? null,
    setItem: (key, text) => { items.set(key, String(text)); },
  };
}
