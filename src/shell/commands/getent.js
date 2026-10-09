/**
 * getent from glibc 2.39, for the two databases the game keeps in files:
 * passwd and group. A key is a name or a numeric id; with no key, every
 * entry. Exit status 2 when a key was not found. Like argp, the "Try" line
 * of a usage error goes to standard output.
 */

import { lookup } from '../fs.js';
import { result, withNote } from '../result.js';

const TRY = "Try `getent --help' or `getent --usage' for more information.";
const FILES = { passwd: '/etc/passwd', group: '/etc/group' };
const OTHERS = new Set(['ahosts', 'ahostsv4', 'ahostsv6', 'aliases', 'ethers', 'gshadow', 'hosts', 'initgroups', 'netgroup', 'networks', 'protocols', 'rpc', 'services', 'shadow']);
const ID_FIELD = 2;

function entries(sys, database) {
  const node = lookup(sys.root, FILES[database]);
  return node?.type === 'file' ? node.content.split('\n').filter(line => line && !line.startsWith('#')) : [];
}

const matches = (line, key) => {
  const fields = line.split(':');
  return /^\d+$/.test(key) ? fields[ID_FIELD] === key : fields[0] === key;
};

function getent(args, { sys }) {
  const [database, ...keys] = args;
  let r;
  if (!args.length) r = result(`${TRY}\n`, 'getent: wrong number of arguments', 1);
  else if (database.startsWith('-')) r = withNote(result('', '', 1), `getent ${database} is a real option, but this game does not simulate it.`);
  else if (OTHERS.has(database)) r = withNote(result('', '', 1), `getent ${database} is real, but this game simulates only getent passwd and getent group.`);
  else if (!FILES[database]) r = result(`${TRY}\n`, `Unknown database: ${database}`, 1);
  else {
    const lines = entries(sys, database);
    const found = keys.map(key => lines.find(line => matches(line, key)) ?? null);
    const shown = keys.length ? found.filter(Boolean) : lines;
    r = result(shown.map(line => `${line}\n`).join(''), '', found.includes(null) ? 2 : 0);
  }
  return r;
}

export default { getent };
