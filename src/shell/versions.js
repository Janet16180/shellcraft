/**
 * What `--version` prints for the simulated programs, as on Ubuntu 24.04
 * (coreutils 9.4, grep 3.11, findutils 4.9.0, tree 2.1.1).
 */

import { nameTable } from './table.js';

const GPL = 'License GPLv3+: GNU GPL version 3 or later <https://gnu.org/licenses/gpl.html>.\nThis is free software: you are free to change and redistribute it.\nThere is NO WARRANTY, to the extent permitted by law.\n';
const COREUTILS_AUTHORS = nameTable({
  ls: 'Richard M. Stallman and David MacKenzie.',
  dir: 'Richard M. Stallman and David MacKenzie.',
  cat: 'Torbjörn Granlund and Richard M. Stallman.',
  whoami: 'Richard Mlynarik.',
  who: 'Joseph Arceneaux, David MacKenzie, and Michael Stone.',
  mkdir: 'David MacKenzie.',
  rmdir: 'David MacKenzie.',
  rm: 'Paul Rubin, David MacKenzie, Richard M. Stallman,\nand Jim Meyering.',
  cp: 'Torbjörn Granlund, David MacKenzie, and Jim Meyering.',
  mv: 'Mike Parker, David MacKenzie, and Jim Meyering.',
  touch: 'Paul Rubin, Arnold Robbins, Jim Kingdon,\nDavid MacKenzie, and Randy Smith.',
  head: 'David MacKenzie and Jim Meyering.',
  tail: 'Paul Rubin, David MacKenzie, Ian Lance Taylor,\nand Jim Meyering.',
  wc: 'Paul Rubin and David MacKenzie.',
  sort: 'Mike Haertel and Paul Eggert.',
  uniq: 'Richard M. Stallman and David MacKenzie.',
  chmod: 'David MacKenzie and Jim Meyering.',
  chown: 'David MacKenzie and Jim Meyering.',
  chgrp: 'David MacKenzie and Jim Meyering.',
  date: 'David MacKenzie.',
  uname: 'David MacKenzie.',
  id: 'Arnold Robbins and David MacKenzie.',
  groups: 'David MacKenzie and James Youngman.',
  env: 'Richard Mlynarik, David MacKenzie, and Assaf Gordon.',
  printenv: 'David MacKenzie and Richard Mlynarik.',
});
const OTHERS = nameTable({
  grep: `grep (GNU grep) 3.11\nCopyright (C) 2023 Free Software Foundation, Inc.\n${GPL}\nWritten by Mike Haertel and others; see\n<https://git.savannah.gnu.org/cgit/grep.git/tree/AUTHORS>.\n\ngrep -P uses PCRE2 10.42 2022-12-11\n`,
  find: `find (GNU findutils) 4.9.0\nCopyright (C) 2022 Free Software Foundation, Inc.\n${GPL}\nWritten by Eric B. Decker, James Youngman, and Kevin Dalley.\nFeatures enabled: D_TYPE O_NOFOLLOW(enabled) LEAF_OPTIMISATION FTS(FTS_CWDFD) CBO(level=2) \n`,
  hostname: 'hostname 3.23\n',
  man: 'man 2.12.0\n',
  apropos: 'apropos 2.12.0\n',
  whatis: 'whatis 2.12.0\n',
  tree: 'tree v2.1.1 © 1996 - 2023 by Steve Baker, Thomas Moore, Francesc Rocher, Florian Sesser, Kyosuke Tokoro\n',
});

/**
 * @param {string} name A command name.
 * @returns {string|null} What `name --version` prints, or null if the simulator does not know it.
 */
export function versionText(name) {
  let text = OTHERS[name] ?? null;
  if (COREUTILS_AUTHORS[name]) text = `${name} (GNU coreutils) 9.4\nCopyright (C) 2023 Free Software Foundation, Inc.\n${GPL}\nWritten by ${COREUTILS_AUTHORS[name]}\n`;
  return text;
}
