/**
 * A stand-in for art's createMap: draws the room as labelled boxes so the page
 * layout can be checked before the real renderer is merged.
 */

function childrenAt(tree, path) {
  return path.split('/').filter(Boolean).reduce((node, name) => node.children[name], tree).children;
}

/**
 * @param {HTMLCanvasElement} canvas The map canvas.
 * @param {{onPick: Function}} opts Pick callback (unused here).
 * @returns {object} The map API.
 */
export function createStubMap(canvas) {
  const ctx = canvas.getContext('2d');
  function show(obs) {
    const entries = Object.entries(childrenAt(obs.tree, obs.cwd)).filter(([name]) => !name.startsWith('.'));
    ctx.fillStyle = '#2e4d2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#4f8a3c';
    ctx.fillRect(0, 140, canvas.width, canvas.height - 140);
    ctx.font = '600 16px "IBM Plex Mono", monospace';
    entries.forEach(([name, node], i) => {
      const x = 40 + (i % 5) * 120;
      const y = node.type === 'dir' ? 60 : 250;
      ctx.fillStyle = node.type === 'dir' ? '#2b1d12' : '#e0b85a';
      ctx.fillRect(x, y, 64, node.type === 'dir' ? 80 : 40);
      ctx.fillStyle = '#f4f0e4';
      ctx.fillText(node.type === 'dir' ? `${name}/` : name, x - 4, y + (node.type === 'dir' ? 100 : 60));
    });
    ctx.fillStyle = '#ffd348';
    ctx.fillRect(canvas.width / 2 - 12, 320, 24, 40);
  }
  return {
    show,
    play: async (_effects, obs) => show(obs),
    say: () => {},
    destroy: () => {},
  };
}

/**
 * @param {object} obs An Observation.
 * @returns {string} A text description of the room.
 */
export function describeStubRoom(obs) {
  return `You are in ${obs.cwd}.`;
}
