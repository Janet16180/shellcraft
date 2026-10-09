/**
 * The player's jobs (`sleep 30 &`, a command paused with Ctrl+Z) as small
 * workers in a row at the picture's bottom-left corner, in every room: a
 * running job hammers, a stopped one sleeps, and one that ended bursts.
 * Pure: the stage keeps the row and the painter draws it.
 */

/** The most job badges on show; the rest are counted as "+N". */
export const MAX_BADGES = 3;

/** Where the row sits and how big each badge is, in art pixels. */
export const JOB_ROW = { x: 2, y: 176, w: 40, h: 22 };

const SWING_MS = 300;

/**
 * @typedef {import('../backend/port.js').JobRecord} JobRecord
 */

/**
 * @typedef {object} JobBadge
 * @property {number} id The job number.
 * @property {number} pid Its process.
 * @property {'running'|'stopped'} state
 * @property {string} label `%N`, the job spec fg, bg and kill take.
 * @property {number} x Left edge of the badge.
 * @property {number} y Top edge of the badge.
 */

const alive = job => job.state !== 'done';

/**
 * The badges for the shell's jobs. A job whose process is gone (`done`)
 * gets none.
 *
 * @param {JobRecord[]} jobs The observation's jobs.
 * @returns {{badges: JobBadge[], more: number}} At most MAX_BADGES badges, left to right, and how many more jobs run.
 */
export function placeJobs(jobs) {
  const live = jobs.filter(alive);
  const badges = live.slice(0, MAX_BADGES).map(({ id, pid, state }, i) => ({
    id, pid, state, label: `%${id}`, x: JOB_ROW.x + i * JOB_ROW.w, y: JOB_ROW.y,
  }));
  return { badges, more: live.length - badges.length };
}

/**
 * The badges whose job ended since: its process is gone or the job left the list.
 *
 * @param {JobBadge[]} previous The badges on show before.
 * @param {JobRecord[]} jobs The observation's jobs now.
 * @returns {JobBadge[]} The ones from previous whose process no longer runs as a job.
 */
export function endedJobs(previous, jobs) {
  return previous.filter(badge => !jobs.some(job => job.pid === badge.pid && alive(job)));
}

const STATE_WORDS = { running: 'running', stopped: 'stopped', done: 'finished' };

/**
 * The jobs in words, for the room description.
 *
 * @param {JobRecord[]} jobs The observation's jobs.
 * @returns {string} "Your jobs: %1 sleep 30 (running), ..." or '' when there are none.
 */
export function jobsSentence(jobs) {
  const listed = jobs.map(({ id, cmd, state }) => `%${id} ${cmd} (${STATE_WORDS[state]})`);
  return listed.length ? `Your jobs: ${listed.join(', ')}.` : '';
}

/**
 * Which picture a job's worker shows at a moment: a running one swings its
 * hammer up and down, a stopped one sleeps.
 *
 * @param {'running'|'stopped'} state The job's state.
 * @param {number} t Animation clock in ms (0 with reduced motion).
 * @returns {'up'|'down'|'asleep'} The frame.
 */
export function jobFrame(state, t) {
  let frame = 'asleep';
  if (state === 'running') frame = Math.floor(t / SWING_MS) % 2 ? 'down' : 'up';
  return frame;
}
