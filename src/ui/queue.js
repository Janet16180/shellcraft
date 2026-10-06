/**
 * Run async steps strictly one after another: the page's calls into the
 * session, and the map's animations and the cards that wait for them.
 *
 * @returns {{add: (step: () => unknown) => Promise<unknown>}} The queue. `add`
 *   returns the step's own promise; a failure rejects it and later steps still run.
 */
export function createQueue() {
  let tail = Promise.resolve();
  return {
    add(step) {
      const run = tail.then(step);
      tail = run.then(() => {}, () => {});
      return run;
    },
  };
}
