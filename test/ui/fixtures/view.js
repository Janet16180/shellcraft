/**
 * A View shaped like the one src/game/session.js returns, for tests.
 * Each call returns a fresh object so tests cannot share mutations.
 *
 * @param {object} [over] Top-level fields to replace.
 * @returns {object} The view.
 */
export function sampleView(over = {}) {
  return {
    chapter: {
      id: 'awakening',
      number: 1,
      total: 14,
      act: 1,
      title: 'The Awakening',
      phase: 'quest',
      lesson: '<p>You wake up inside a terminal. Type <code>whoami</code>.</p>',
      replay: false,
      tasks: [
        { goal: 'Ask the terminal who you are', done: true, next: false, hints: [] },
        { goal: 'Find out where you are standing', done: false, next: true, hints: ['Which command prints the working directory?'] },
        { goal: 'Read the <letter> left for you', done: false, next: false, hints: [] },
      ],
      boss: { title: 'The Lost Name', briefing: '<p>Find the file whose name the daemon hid.</p>', hints: [] },
    },
    xp: 40,
    rank: { title: 'Novice', floor: 0, next: 150 },
    hearts: { left: 2, max: 3 },
    sound: false,
    introSeen: true,
    hint: { level: 2, cost: 3 },
    chapters: [
      { id: 'awakening', number: 1, act: 1, title: 'The Awakening', status: 'playing' },
      { id: 'forest', number: 2, act: 1, title: 'The Whispering Forest', status: 'locked' },
      { id: 'unseen', number: 3, act: 1, title: 'Things Unseen', status: 'soon' },
      { id: 'descent', number: 10, act: 2, title: 'The Descent', status: 'soon' },
    ],
    spellbook: [
      { name: 'pwd', summary: 'Print the working directory.', examples: [['pwd', 'prints /home/hero']], unlocked: true },
      { name: 'cd', summary: 'Change directory.', examples: [['cd forest', 'relative path']], unlocked: false },
    ],
    prompt: { user: 'hero', host: 'kernelia', cwd: '/home/hero', home: '/home/hero' },
    boot: 'resumed',
    ...over,
  };
}
