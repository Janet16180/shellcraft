/**
 * Differential tests: run each case in the simulator and in a real bash in
 * the reference container, and compare stdout, stderr and exit status per line.
 *
 * Usage: node difftest/run.js [NAME_FILTER] [--jobs N] [--verbose]
 * Exit status: 0 all cases pass, 1 some case differs, 2 skipped (no Docker).
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { materialize } from './materialize.js';
import { inputScript, splitOutput } from './protocol.js';
import { runSim } from './sim.js';
import { WORLDS } from './worlds.js';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '..');
const IMAGE = 'shellcraft-difftest';
const ALIASES = { ll: 'ls -alF', la: 'ls -A' };
const TIMEOUT_MS = 60_000;
const ENV = [
  'HOME=/home/hero', 'USER=hero', 'LOGNAME=hero', 'SHELL=/bin/bash',
  'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', 'TERM=xterm-256color', 'PS1=', 'PS2=', 'HISTCONTROL=ignoreboth',
];
const RUN_SH = `bash /case/setup.sh
cd /home/hero 2>/dev/null || cd /
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
  writeFileSync(path.join(dir, 'setup.sh'), script);
  writeFileSync(path.join(dir, 'input.sh'), inputScript(lines, { cds, aliases: ALIASES }));
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
  const realLines = c.lines.filter(l => intended.get(l)?.real !== false);
  const [sim, real] = await Promise.all([runSim(world, c.lines, worldTime), runReal(c, index, world, worldTime, realLines)]);
  let k = 0;
  const lines = c.lines.map((line, i) => {
    const runsReal = intended.get(line)?.real !== false;
    const r = runsReal ? real[k++] : null;
    const same = r !== null && r.out === sim[i].out && r.err === sim[i].err && r.status === sim[i].status;
    let verdict = same ? 'same' : 'differ';
    if (intended.has(line)) verdict = 'intended';
    return { line, verdict, real: r, sim: sim[i], reason: intended.get(line)?.reason };
  });
  return { case: c, lines };
}

async function pool(items, jobs, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, worker));
  return results;
}

const show = s => JSON.stringify(s);

function report(results, verbose) {
  const counts = { passed: 0, intendedCases: 0, failed: 0, same: 0, intended: 0, differ: 0 };
  for (const { case: c, lines } of results) {
    const differ = lines.filter(l => l.verdict === 'differ');
    const intended = lines.filter(l => l.verdict === 'intended');
    for (const l of lines) counts[l.verdict]++;
    if (differ.length) counts.failed++;
    else if (intended.length) counts.intendedCases++;
    else counts.passed++;
    console.log(`${differ.length ? 'FAIL' : 'ok  '}  ${c.file}: ${c.name}${intended.length ? ` (${intended.length} intended)` : ''}`);
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
