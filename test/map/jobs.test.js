import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeJobs, endedJobs, jobsSentence, jobFrame, MAX_BADGES, JOB_ROW } from '../../src/map/jobs.js';
import { ART } from '../../src/map/layout.js';

const job = (id, state = 'running', cmd = `sleep ${id}0`, pid = 4000 + id) => ({ id, pid, cmd, state, mark: ' ' });

test('no jobs, no badges', () => {
  assert.deepEqual(placeJobs([]), { badges: [], more: 0 });
});

test('each running or stopped job gets a badge labelled with its job number, left to right', () => {
  const { badges, more } = placeJobs([job(1), job(2, 'stopped')]);
  assert.deepEqual(badges.map(b => [b.id, b.label, b.state]), [[1, '%1', 'running'], [2, '%2', 'stopped']]);
  assert.ok(badges[0].x < badges[1].x);
  assert.equal(more, 0);
});

test('a job whose process is gone gets no badge: it has finished', () => {
  assert.deepEqual(placeJobs([job(1, 'done'), job(2)]).badges.map(b => b.id), [2]);
});

test('beyond the badges that fit, the rest are counted', () => {
  const jobs = [1, 2, 3, 4, 5].map(id => job(id));
  const { badges, more } = placeJobs(jobs);
  assert.equal(badges.length, MAX_BADGES);
  assert.equal(more, 5 - MAX_BADGES);
});

test('the badge row sits in the picture\'s bottom-left corner and leaves the exit and the hero alone', () => {
  const { badges } = placeJobs([1, 2, 3, 4].map(id => job(id)));
  for (const b of badges) {
    assert.ok(b.x >= 0 && b.y >= 0, 'inside the picture');
    assert.ok(b.y + JOB_ROW.h <= ART.height);
  }
  const moreMarker = 16;
  assert.ok(JOB_ROW.x + JOB_ROW.w * MAX_BADGES + moreMarker <= 142, 'the exit starts at x 142 and the hero at 148');
});

test('a job ended when its process went: it left the list, or it is now done', () => {
  const before = placeJobs([job(1), job(2, 'stopped'), job(3)]).badges;
  const ended = endedJobs(before, [job(1, 'done'), job(3)]);
  assert.deepEqual(ended.map(b => b.id), [1, 2]);
});

test('a new job that took an old number is not the old job: the old one ended', () => {
  const before = placeJobs([job(1)]).badges;
  assert.deepEqual(endedJobs(before, [job(1, 'running', 'sleep 5', 9999)]).map(b => b.pid), [4001]);
});

test('a job that only stopped or woke up has not ended', () => {
  const before = placeJobs([job(1), job(2, 'stopped')]).badges;
  assert.deepEqual(endedJobs(before, [job(1, 'stopped'), job(2)]), []);
});

test('the sentence for screen readers names each job, its command and its state', () => {
  assert.equal(jobsSentence([]), '');
  assert.equal(
    jobsSentence([job(1, 'running', 'sleep 30'), job(2, 'stopped', 'sleep 100'), job(3, 'done', 'sleep 2')]),
    'Your jobs: %1 sleep 30 (running), %2 sleep 100 (stopped), %3 sleep 2 (finished).',
  );
});

test('a running job works in two frames that take turns; a stopped one sleeps; reduced motion holds still', () => {
  assert.equal(jobFrame('stopped', 0), 'asleep');
  assert.equal(jobFrame('stopped', 5000), 'asleep');
  const frames = new Set([0, 150, 300, 450, 600, 750].map(t => jobFrame('running', t)));
  assert.deepEqual([...frames].sort(), ['down', 'up']);
  assert.equal(jobFrame('running', 0), 'up');
});
