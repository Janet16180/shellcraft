/**
 * chown and chgrp, following coreutils 9.4 for a user who is not root: the
 * kernel lets you change a file only if you own it, and only to yourself and
 * to a group you belong to. Messages, including -v and -c, match the real ones.
 */

import { resolve, errorText } from '../paths.js';
import { compareNames } from '../../backend/tree.js';
import { joinDisp } from '../fs.js';
import { can } from '../perms.js';
import { findUser, findGroup, ownerLabel, groupLabel } from '../accounts.js';
import { parseOptions, mapLongOptions, optionFailure } from '../options.js';
import { shellQuote, localeQuote } from '../quote.js';
import { result } from '../result.js';

const LONG = { '--recursive': 'R', '--verbose': 'v', '--changes': 'c', '--silent': 'f', '--quiet': 'f' };
const tryHelp = name => `Try '${name} --help' for more information.`;
const quoted = name => shellQuote(name, { always: true });
const digits = s => /^\d+$/.test(s);

const userId = (sys, spec) => findUser(sys, spec)?.uid ?? (digits(spec) ? Number(spec) : null);
const groupId = (sys, spec) => findGroup(sys, spec)?.gid ?? (digits(spec) ? Number(spec) : null);
const userName = (sys, uid) => findUser(sys, String(uid))?.name ?? String(uid);
const groupName = (sys, gid) => findGroup(sys, String(gid))?.name ?? String(gid);

// chown's OWNER[:[GROUP]]: ids to set (null to keep) and the names -v shows.
function ownerSpec(sys, spec) {
  let sep = spec.indexOf(':');
  let warning = null;
  if (sep < 0 && spec.includes('.') && userId(sys, spec) === null) {
    sep = spec.indexOf('.');
    warning = `chown: warning: '.' should be ':': ${localeQuote(spec)}`;
  }
  const userPart = sep < 0 ? spec : spec.slice(0, sep);
  const groupPart = sep < 0 ? null : spec.slice(sep + 1);
  const want = { uid: null, gid: null, user: null, group: null, warning };
  if (userPart !== '') {
    want.uid = userId(sys, userPart);
    if (want.uid === null) return { err: groupPart === '' ? `invalid spec: ${localeQuote(spec)}` : `invalid user: ${localeQuote(spec)}` };
    want.user = userPart;
  }
  if (groupPart === '' && userPart !== '') {
    const account = findUser(sys, userPart);
    if (!account) return { err: `invalid spec: ${localeQuote(spec)}` };
    want.gid = account.gid;
    want.group = groupName(sys, account.gid);
  } else if (groupPart) {
    want.gid = groupId(sys, groupPart);
    if (want.gid === null) return { err: `invalid group: ${localeQuote(spec)}` };
    want.group = groupPart;
    want.user ??= '';
  }
  return want;
}

function groupSpec(sys, spec) {
  const gid = groupId(sys, spec);
  return gid === null ? { err: `invalid group: ${localeQuote(spec)}` } : { uid: null, gid, user: null, group: spec, warning: null };
}

// The kernel's rule for chown(2) when you are not root.
function permitted(sys, node, want) {
  if (sys.user === 'root' || (want.uid === null && want.gid === null)) return true;
  const me = findUser(sys, sys.user)?.uid;
  const mine = node.owner === sys.user || userId(sys, node.owner) === me;
  const uidOk = want.uid === null || want.uid === me;
  const gidOk = want.gid === null || want.gid === groupId(sys, node.group) || sys.gids.includes(want.gid);
  return mine && uidOk && gidOk;
}

const joinSpec = (user, group) => {
  if (user !== null && group !== null) return `${user}:${group}`;
  return user ?? group;
};

// coreutils' describe_change.
function describe(name, path, outcome, want, old) {
  const what = name === 'chgrp' ? 'group' : 'ownership';
  const spec = joinSpec(want.user, want.group);
  const oldSpec = joinSpec(want.user === null ? null : old.user, want.group === null ? null : old.group);
  if (outcome === 'changed') return `changed ${what} of ${quoted(path)} from ${oldSpec} to ${spec}`;
  if (outcome === 'failed') return `failed to change ${what} of ${quoted(path)} from ${oldSpec} to ${spec}`;
  if (oldSpec === null) return `ownership of ${quoted(path)} retained`;
  return `${want.user === null ? 'group' : 'ownership'} of ${quoted(path)} retained as ${oldSpec}`;
}

// Set the ids; whether anything really changed.
function apply(sys, node, want) {
  const changes = (want.uid !== null && want.uid !== userId(sys, node.owner)) || (want.gid !== null && want.gid !== groupId(sys, node.group));
  if (want.uid !== null) node.owner = userName(sys, want.uid);
  if (want.gid !== null) node.group = groupName(sys, want.gid);
  return changes;
}

function changeOne(job, node, path, cause = null) {
  const { sys, name, want, opts } = job;
  const old = { user: ownerLabel(sys, node.owner, false).text, group: groupLabel(sys, node.group, false).text };
  let outcome;
  if (cause || !permitted(sys, node, want)) {
    outcome = 'failed';
    const doing = name === 'chgrp' || want.uid === null ? 'changing group of' : 'changing ownership of';
    job.fail(`${name}: ${doing} ${quoted(path)}: ${cause ?? 'Operation not permitted'}`);
  } else {
    outcome = apply(sys, node, want) ? 'changed' : 'retained';
  }
  if (opts.verbose || (opts.changes && outcome === 'changed')) job.out.push(describe(name, path, outcome, want, old));
}

// -R works like fts: the contents first, then the directory itself.
function visit(job, node, path) {
  if (job.opts.recursive && node.type === 'dir') {
    if (!can(job.sys, node, 'r')) {
      job.fail(`${job.name}: cannot read directory ${quoted(path)}: Permission denied`);
      return;
    }
    const searchable = can(job.sys, node, 'x');
    for (const child of Object.keys(node.children).sort(compareNames)) {
      if (searchable) visit(job, node.children[child], joinDisp(path, child));
      else changeOne(job, node.children[child], joinDisp(path, child), 'Permission denied');
    }
  }
  changeOne(job, node, path);
}

function changeOwners(name, args, { sys }) {
  const long = mapLongOptions(name, args, LONG);
  const o = long.err || long.unsimulated ? long : parseOptions(name, long.args, 'Rvcf');
  const failed = optionFailure(name, o, 1);
  if (failed) return failed;
  if (!o.rest.length) return result('', `${name}: missing operand\n${tryHelp(name)}`, 1);
  if (o.rest.length < 2) return result('', `${name}: missing operand after ${localeQuote(o.rest[0])}\n${tryHelp(name)}`, 1);
  const [spec, ...files] = o.rest;
  const want = name === 'chgrp' ? groupSpec(sys, spec) : ownerSpec(sys, spec);
  if (want.err) return result('', `${name}: ${want.err}`, 1);
  const opts = { recursive: o.flags.has('R'), verbose: o.flags.has('v'), changes: o.flags.has('c'), silent: o.flags.has('f') };
  const errs = want.warning ? [want.warning] : [];
  let status = 0;
  const job = { sys, name, want, opts, out: [], fail: msg => { status = 1; if (!opts.silent) errs.push(msg); } };
  for (const f of files) {
    const r = resolve(sys, f);
    const link = r.error && resolve(sys, f, { follow: false }).node?.type === 'symlink';
    if (r.error) job.fail(`${name}: cannot ${link ? 'dereference' : 'access'} ${quoted(f)}: ${errorText(r.error)}`);
    else visit(job, r.node, f);
  }
  return result(job.out.map(l => `${l}\n`).join(''), errs.join('\n'), status);
}

export default {
  chown: (args, ctx) => changeOwners('chown', args, ctx),
  chgrp: (args, ctx) => changeOwners('chgrp', args, ctx),
};
