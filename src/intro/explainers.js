/**
 * The chapter explainers, as data so a fact-checker can read every sentence.
 * A chapter shows one by declaring `explainer: EXPLAINERS.links` (AUTHORING.md
 * section 2). Each step has a caption of one to three short sentences, an
 * optional little terminal, and a diagram drawn by the explainer's `draw`.
 *
 * Every sentence and every terminal line is meant to be true on Ubuntu 24.04
 * with bash 5.2 and coreutils 9.4 (docs/verification/explainers.md).
 */

import { drawPerms } from './perms.js';
import { drawLinks } from './links.js';

const PLANS = { mode: '-rw-r-----', owner: 'mira', group: 'smiths', size: 812, name: 'plans.txt' };
const NOTES = { mode: '----r--r--', owner: 'hero', group: 'hero', size: 40, name: 'notes.txt' };

// The hero's sprite in other colours: h is the hat, r the robe.
const MIRA = { user: 'mira', groups: ['mira', 'smiths'], colours: { h: '#e2434f', r: '#a24f34' } };
const OREN = { user: 'oren', groups: ['oren', 'smiths'], colours: { h: '#8fd14f', r: '#2c5aa8' } };
const HERO = { user: 'hero', groups: ['hero'] };

const perms = {
  id: 'perms',
  title: 'Which three letters are yours?',
  draw: drawPerms,
  steps: [
    {
      title: 'Three sets of letters',
      text: [
        '<code>ls -l</code> starts each line with a mode, like <code>-rw-r-----</code>. After the first character come three sets of three letters: one for the owner, one for the group and one for everyone else.',
        'Only one set counts for you.',
      ],
      term: [{ type: 'ls -l plans.txt', output: ['-rw-r----- 1 mira smiths 812 Oct  7 09:00 plans.txt'] }],
      diagram: { show: 'sets', file: PLANS },
    },
    {
      title: 'Question 1: are you the owner?',
      text: [
        'Linux asks up to three questions, in order. The first is: is your user name the file\'s owner? For <code>mira</code> the answer is yes, so the owner letters <code>rw-</code> count.',
      ],
      diagram: { show: 'ladder', file: PLANS, people: [MIRA] },
    },
    {
      title: 'Question 2: are you in the group?',
      text: [
        'If not, Linux asks: is the file\'s group one of your groups? <code>id</code> lists your groups. <code>oren</code> is in <code>smiths</code>, so the group letters <code>r--</code> count for him.',
      ],
      term: [{ user: 'oren', type: 'id', output: ['uid=1002(oren) gid=1002(oren) groups=1002(oren),1001(smiths)'] }],
      diagram: { show: 'ladder', file: PLANS, people: [OREN] },
    },
    {
      title: 'Otherwise: everyone else',
      text: [
        'If both answers are no, the last three letters count. <code>hero</code> is not <code>mira</code> and not in <code>smiths</code>, so he gets <code>---</code> and may not read the file.',
      ],
      term: [{ type: 'cat plans.txt', output: ['cat: plans.txt: Permission denied'], fails: true }],
      diagram: { show: 'ladder', file: PLANS, people: [HERO] },
    },
    {
      title: 'Only the first yes counts',
      text: [
        'Linux stops at the first yes and never looks at the other letters. <code>hero</code> owns <code>notes.txt</code>, so he gets the owner letters <code>---</code>. Everyone else may read it, but he may not.',
      ],
      term: [{ type: 'cat notes.txt', output: ['cat: notes.txt: Permission denied'], fails: true }],
      diagram: { show: 'ladder', file: NOTES, people: [HERO] },
    },
    {
      title: 'Three people, one file',
      text: [
        'Each person goes down the same questions and stops at the first yes. <code>mira</code> stops at owner, <code>oren</code> at group, and <code>hero</code> ends at everyone else. Only <code>hero</code> may not read <code>plans.txt</code>.',
      ],
      diagram: { show: 'walk', file: PLANS, people: [MIRA, OREN, HERO] },
    },
  ],
};

const MAP_TEXT = 'A map to the old well.';
const OAK_TEXT = 'Turn left at the oak.';
const DEEP = '/home/hero/forest/cave/deep';

const links = {
  id: 'links',
  title: 'Names are pointers',
  draw: drawLinks,
  steps: [
    {
      title: 'A name points at data',
      text: [
        'A file is data on the disk, plus a name that points at the data, like a signpost. The data has a number, its inode, and <code>ls -i</code> shows it.',
      ],
      term: [{ type: 'ls -i scroll.txt', output: ['1847 scroll.txt'] }],
      diagram: { show: 'signs', signs: [{ name: 'scroll.txt' }], data: { inode: 1847, lines: [MAP_TEXT], mark: 0 } },
    },
    {
      title: '<code>ln</code> adds a second name',
      sound: 'create',
      text: [
        '<code>ln scroll.txt copy.txt</code> makes a hard link: a second signpost that points at the same data, so both names show inode 1847.',
        'Add a line through <code>copy.txt</code> and <code>scroll.txt</code> shows it too, because there is only one copy of the text.',
      ],
      term: [
        { type: 'ln scroll.txt copy.txt' },
        { type: 'ls -i', output: ['1847 copy.txt  1847 scroll.txt'] },
        { type: `echo "${OAK_TEXT}" >> copy.txt` },
        { type: 'cat scroll.txt', output: [MAP_TEXT, OAK_TEXT] },
      ],
      diagram: {
        show: 'signs',
        signs: [{ name: 'scroll.txt' }, { name: 'copy.txt', added: 0 }],
        data: { inode: 1847, lines: [MAP_TEXT], added: { line: OAK_TEXT, at: 2 }, mark: 1 },
      },
    },
    {
      title: '<code>rm</code> removes a name, not the data',
      sound: 'remove',
      text: [
        '<code>rm scroll.txt</code> takes away only that signpost. The data stays as long as another name points at it, so <code>copy.txt</code> still works.',
      ],
      term: [{ type: 'rm scroll.txt' }, { type: 'cat copy.txt', output: [MAP_TEXT, OAK_TEXT] }],
      diagram: {
        show: 'signs',
        signs: [{ name: 'scroll.txt', removed: 0 }, { name: 'copy.txt' }],
        data: { inode: 1847, lines: [MAP_TEXT, OAK_TEXT], alive: 1 },
      },
    },
    {
      title: 'A soft link points at a name',
      sound: 'create',
      text: [
        '<code>ln -s</code> makes a soft link, also called a symlink. It is a signpost that points at a name, the path <code>/home/hero/forest/cave/deep</code>, not at the data. <code>ls -l</code> shows that path after an arrow.',
      ],
      term: [
        { type: 'ln -s ~/forest/cave/deep portal' },
        { type: 'ls -l portal', output: [`lrwxrwxrwx 1 hero hero 27 Oct  7 09:00 portal -> ${DEEP}`] },
      ],
      diagram: { show: 'symlink', link: 'portal', target: DEEP, dir: 'deep', added: 0 },
    },
    {
      title: 'Step through the portal',
      sound: 'discover',
      text: [
        '<code>cd portal</code> follows the signpost to the name, and the name to the directory. You land in the cave, next to <code>ancient_key.txt</code>. The prompt shows <code>~/portal</code>, the name you used.',
      ],
      term: [{ type: 'cd portal' }, { type: 'ls', cwd: '/home/hero/portal', wait: 2.4, output: ['ancient_key.txt'] }],
      diagram: { show: 'teleport', link: 'portal', from: '~', to: '~/forest/cave/deep', item: 'ancient_key.txt', at: 0 },
    },
    {
      title: 'A broken link points at nothing',
      sound: 'err',
      text: [
        'If the target is moved or deleted, the soft link points at a name that no longer exists: it is a broken link, and <code>cd portal</code> fails. A hard link cannot break like this, because it points at the data itself.',
      ],
      term: [
        { type: 'mv ~/forest/cave/deep ~/forest/cave/deeper' },
        { type: 'cd portal', output: ['bash: cd: portal: No such file or directory'], fails: true },
      ],
      diagram: { show: 'symlink', link: 'portal', target: DEEP, dir: 'deep', moved: { to: 'deeper', at: 0 }, broken: 1, hard: { name: 'copy.txt', inode: 1847 } },
    },
    {
      title: 'Hard link or soft link?',
      text: ['Both are names that lead to a file. A hard link points at the data, and a soft link points at a name.'],
      diagram: {
        show: 'table',
        head: ['Hard link <code>ln</code>', 'Soft link <code>ln -s</code>'],
        rows: [
          ['Points at', 'the data (its inode)', 'a name (a path)'],
          ['Still works after <code>rm</code> of the original name', 'yes', 'no'],
          ['Can point at a directory', 'no', 'yes'],
        ],
      },
    },
  ],
};

/** Every explainer by id. */
export const EXPLAINERS = Object.freeze({ perms, links });
