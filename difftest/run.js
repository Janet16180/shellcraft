/**
 * Differential tests: run each case in the simulator and in a real bash in
 * the reference container, and compare stdout, stderr and exit status per line.
 *
 * Usage: node difftest/run.js [NAME_FILTER] [--jobs N] [--verbose]
 * Exit status: 0 all cases pass, 1 some case differs, 2 skipped (no Docker).
 * Each case runs once. The simulator runs after the container, at the clock
 * the container had for each line (see clock.js).
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { materialize, loginRecord } from './materialize.js';
import { lineClocks, crossedMinute } from './clock.js';
import { inputScript, splitOutput } from './protocol.js';
import { runSim } from './sim.js';
import { WORLDS } from './worlds.js';
import { TERMINAL } from '../src/shell/system.js';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '..');
const IMAGE = 'shellcraft-difftest';
const TIMEOUT_MS = 60_000;
const LATEST_START_SECOND = 45;
const ENV = [
  'HOME=/home/hero', 'USER=hero', 'LOGNAME=hero', 'SHELL=/bin/bash',
  'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', 'TERM=xterm-256color', 'PS1=', 'PS2=', 'HISTCONTROL=ignoreboth',
];
// Like a real machine (and the game's /etc/hosts), the host name resolves;
// without it sudo warns that it cannot.
const RUN_SH = `bash /case/setup.sh
grep -q kernelia /etc/hosts || echo '127.0.1.1 kernelia' >> /etc/hosts
cd /home/hero 2>/dev/null || cd /
while [ "$(date +%-S)" -ge ${LATEST_START_SECOND} ]; do sleep 0.5; done
exec script -qec "stty -onlcr cols 80 rows 24; exec setpriv --reuid=1000 --regid=1000 --init-groups env -i ${ENV.join(' ')} bash --norc --noprofile --noediting -i < /case/input.sh 2>/out/err" /dev/null < /dev/null
`;

function loadCases(filter) {
  const dir = path.join(HERE, 'cases');
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .flatMap(f => JSON.parse(readFileSync(path.join(dir, f), 'utf8')).map(c => ({ ...c, file: f })))
    .filter(c => !filter || c.name.includes(filter) || c.file.includes(filter));
}

function worldTimeOf(c) {
  return c.worldTime ? Date.parse(c.worldTime) : Math.floor((Date.now() - 3_600_000) / 60_000) * 60_000;
}

function docker(args, input) {
  return new Promise(resolve => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => err.push(d));
    child.on('close', status => resolve({ status, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }));
    child.stdin.end(input ?? '');
  });
}

async function runReal(c, index, world, worldTime, lines) {
  const dir = mkdtempSync(path.join(ROOT, '.scratch', 'shell-dt-'));
  const name = `${IMAGE}-${process.pid}-${index}`;
  const { script, cds } = materialize(world, worldTime);
  mkdirSync(path.join(dir, 'out'));
  writeFileSync(path.join(dir, 'setup.sh'), script + loginRecord('hero', TERMINAL, worldTime));
  writeFileSync(path.join(dir, 'input.sh'), inputScript(lines, { cds }));
  writeFileSync(path.join(dir, 'run.sh'), RUN_SH);
  const timer = setTimeout(() => spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' }), TIMEOUT_MS);
  const r = await docker(['run', '--rm', '-i', '--name', name, '--hostname', 'kernelia', '--network', 'none',
    '-v', `${dir}:/case:ro`, '-v', `${path.join(dir, 'out')}:/out`, IMAGE, 'bash', '/case/run.sh']);
  clearTimeout(timer);
  let stderr = '';
  try {
    stderr = readFileSync(path.join(dir, 'out', 'err'), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  rmSync(dir, { recursive: true });
  if (r.status !== 0) throw new Error(`case ${c.name}: container exited ${r.status}: ${r.stderr.trim()}`);
  return splitOutput(r.stdout, stderr, lines.length);
}

async function runCase(c, index) {
  if (!WORLDS[c.world]) throw new Error(`case ${c.name}: unknown world ${c.world}`);
  const world = WORLDS[c.world]();
  const worldTime = worldTimeOf(c);
  const intended = new Map((c.intended ?? []).map(x => [x.line, x]));
  const runsReal = line => intended.get(line)?.real !== false;
  const real = await runReal(c, index, world, worldTime, c.lines.filter(runsReal));
  let k = 0;
  const paired = c.lines.map(line => (runsReal(line) ? real[k++] : null));
  const sim = await runSim(world, c.lines, worldTime, lineClocks(paired, Math.floor(Date.now() / 1000)));
  const lines = c.lines.map((line, i) => {
    const r = paired[i];
    const same = r !== null && r.out === sim[i].out && r.err === sim[i].err && r.status === sim[i].status;
    let verdict = same ? 'same' : 'differ';
    if (intended.has(line)) verdict = 'intended';
    return { line, verdict, real: r, sim: sim[i], reason: intended.get(line)?.reason };
  });
  return { case: c, lines, crossed: crossedMinute(real) };
}

// After a failure no new case starts, and the ones already running finish
// and remove their containers and directories before the error is raised.
async function pool(items, jobs, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failure = null;
  const worker = async () => {
    while (next < items.length && !failure) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, worker));
  if (failure) throw failure;
  return results;
}

const show = s => JSON.stringify(s);
const timeOf = seconds => new Date(seconds * 1000).toISOString().slice(11, 19);

function report(results, verbose) {
  const counts = { passed: 0, intendedCases: 0, failed: 0, same: 0, intended: 0, differ: 0 };
  for (const { case: c, lines, crossed } of results) {
    const differ = lines.filter(l => l.verdict === 'differ');
    const intended = lines.filter(l => l.verdict === 'intended');
    const failed = differ.length > 0 || crossed !== null;
    for (const l of lines) counts[l.verdict]++;
    if (failed) counts.failed++;
    else if (intended.length) counts.intendedCases++;
    else counts.passed++;
    console.log(`${failed ? 'FAIL' : 'ok  '}  ${c.file}: ${c.name}${intended.length ? ` (${intended.length} intended)` : ''}`);
    if (crossed) console.log(`      ran from ${timeOf(crossed.from)} to ${timeOf(crossed.to)}, across a minute: file times cannot match`);
    for (const l of differ) {
      console.log(`      $ ${l.line}`);
      for (const k of ['out', 'err', 'status']) {
        if (l.real[k] !== l.sim[k]) console.log(`        ${k} real ${show(l.real[k])}\n        ${k} sim  ${show(l.sim[k])}`);
      }
    }
    if (verbose) for (const l of intended) console.log(`      ~ ${l.line}: ${l.reason}`);
  }
  console.log(`\ncases: ${counts.passed} passed, ${counts.intendedCases} passed with intended differences, ${counts.failed} failed`);
  console.log(`lines: ${counts.same} same, ${counts.intended} intended differences, ${counts.differ} differ`);
  return counts.failed;
}

async function main() {
  const args = process.argv.slice(2);
  const jobsAt = args.indexOf('--jobs');
  const jobs = jobsAt >= 0 ? Number(args[jobsAt + 1]) : 4;
  const filter = args.find((a, i) => !a.startsWith('--') && (jobsAt < 0 || i !== jobsAt + 1));
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    console.log('SKIPPED: Docker is not available, so nothing was compared.');
    process.exitCode = 2;
    return;
  }
  const build = spawnSync('docker', ['build', '-q', '-t', IMAGE, HERE], { encoding: 'utf8' });
  if (build.status !== 0) throw new Error(`docker build failed:\n${build.stderr}`);
  mkdirSync(path.join(ROOT, '.scratch'), { recursive: true });
  const results = await pool(loadCases(filter), jobs, runCase);
  process.exitCode = report(results, args.includes('--verbose')) ? 1 : 0;
}

await main();
