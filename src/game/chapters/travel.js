/**
 * Chapter 21, Pack and Travel: archives. du -sh for how much space a
 * directory takes, tar -cf to pack it into one file, tar -tf to list it,
 * tar -czf to pack and compress, file to tell the kinds apart, tar -xzf with
 * -C to unpack somewhere else, and gzip and zcat for a single file. The boss:
 * a packing list for the journey to Ring Zero, with a random archive name and
 * two or three things to pack, and the cursed junk left behind.
 */
import { put, remove, cd, dir, file } from '../../backend/spec.js';
import { token, shuffle } from '../rng.js';
import { nodeAt } from '../../backend/tree.js';

const NOTES = 'Notes for the road: the kernel is below. Ring Zero waits.\n';
const ITEMS = ['library', 'tower', 'market', 'gate', 'readme.txt'];

const travelOf = ctx => `${ctx.home}/travel`;
const tarOf = ctx => `${travelOf(ctx)}/library.tar`;
const tgzOf = ctx => `${travelOf(ctx)}/library.tar.gz`;
const unpackedOf = ctx => `${travelOf(ctx)}/unpacked`;
const notesOf = ctx => `${travelOf(ctx)}/notes.txt`;
const tilde = path => path.replace(/^\/home\/[^/]+/, '~');
const firstNote = rules => rules.find(([when]) => when())?.[1] ?? null;

// A member path as tar -t prints it, read from the home: home/hero/library/x and library/x are the same.
const fromHome = (ctx, path) => path.replace(new RegExp(`^${ctx.home.slice(1)}/`), '');
const members = (ctx, path) => (ctx.archive(path) ?? []).map(m => fromHome(ctx, m.path));
const holdsLibrary = (ctx, path) => members(ctx, path).includes('library/scroll_of_ages.txt');
const tarFlag = (ctx, letter) => record => record.name === 'tar' && ctx.flag(record, letter);
const unpackedScroll = ctx => [`${unpackedOf(ctx)}/library/scroll_of_ages.txt`, `${unpackedOf(ctx)}${ctx.home}/library/scroll_of_ages.txt`].some(path => ctx.node(path));

function setupBoss(random, { home, user }) {
  const items = shuffle(random, ITEMS).slice(0, 2 + Math.floor(random() * 2));
  const archive = `${home}/travel/journey_${token(random, 3)}.tar.gz`;
  const list = `PACKING LIST FOR THE JOURNEY TO RING ZERO
Pack these, and only these, into one compressed archive, ${tilde(archive)}:
${items.map(item => `~/${item}`).join('\n')}
Do not pack ~/junk: it is cursed.
`;
  return {
    patch: [
      remove(`${home}/travel`),
      put(`${home}/travel`, dir({ 'notes.txt': file(NOTES, { owner: user }), 'packing_list.txt': file(list, { owner: user }) }, { owner: user })),
      cd(home),
    ],
    secret: { archive, items },
  };
}

const topLevel = (ctx, path) => [...new Set(members(ctx, path).map(m => m.split('/')[0]))].sort();

function bossDone(ctx, { archive, items }) {
  return ctx.gzipped(archive) !== null && JSON.stringify(topLevel(ctx, archive)) === JSON.stringify([...items].sort());
}

function bossNear(ctx, secret) {
  const { archive, items } = secret;
  if (!ctx.tried('tar') || bossDone(ctx, secret)) return null;
  const packed = topLevel(ctx, archive);
  const other = Object.keys(ctx.node(travelOf(ctx))?.children ?? {}).some(name => /^journey.*\.tar/.test(name) && `${travelOf(ctx)}/${name}` !== archive);
  return firstNote([
    [() => ctx.archive(archive) === null && other, `The archive must have the name in packing_list.txt: ${tilde(archive)}.`],
    [() => ctx.archive(archive) !== null && ctx.gzipped(archive) === null, 'That archive is not compressed. Add -z: tar -czf.'],
    [() => packed.includes('junk'), 'The junk is in the archive, and it is cursed. Pack it again without ~/junk.'],
    [() => items.some(item => !packed.includes(item)), `Something is missing: ${items.filter(item => !packed.includes(item)).map(item => `~/${item}`).join(', ')}. Name every item in one tar -czf.`],
    [() => packed.some(name => !items.includes(name)), `Pack only what the list names. Pack it again with exactly: ${items.map(item => `~/${item}`).join(' ')}.`],
  ]);
}

function solveBoss(obs) {
  const list = nodeAt(obs.tree, `${obs.home}/travel/packing_list.txt`).content.split('\n');
  const archive = list[1].match(/~\/(\S+\.tar\.gz)/)[1];
  const items = list.filter(line => /^~\/\S+$/.test(line)).map(line => line.slice(2));
  return ['cat ~/travel/packing_list.txt', 'cd', `tar -czf ${archive} ${items.join(' ')}`];
}

export default {
  id: 'travel',
  act: 3,
  title: 'Pack and Travel',
  setup: (_random, { home, user }) => [
    remove(`${home}/travel`),
    put(`${home}/travel`, dir({ 'notes.txt': file(NOTES, { owner: user }) }, { owner: user })),
    cd(home),
  ],
  lesson: `<p>Your adventure in Kernelia is almost over: the road leads down to Ring Zero, the kernel. Time to pack.</p>
<ul>
<li><code>du -sh DIR</code> (disk usage) prints how much space a directory takes, <code>-s</code> as one sum, <code>-h</code> in K, M and G.</li>
<li><code>tar</code> packs many files and directories into one file, an <b>archive</b>, usually ending in <code>.tar</code>. Its letters: <code>c</code> create, <code>x</code> extract (unpack), <code>t</code> list, <code>v</code> verbose (name each file), and <code>f</code> followed by the archive's name.
<ul>
<li><code>tar -cf ARCHIVE THINGS</code> packs; <code>tar -tf ARCHIVE</code> lists; <code>tar -xf ARCHIVE</code> unpacks into the directory you are in.</li>
<li><code>-C DIR</code> unpacks into another directory, which must exist.</li>
<li><code>z</code> also compresses with gzip, so the file is smaller: <code>tar -czf library.tar.gz library</code>, and <code>tar -xzf</code> to unpack. The name then ends in <code>.tar.gz</code>.</li>
</ul></li>
<li><code>gzip FILE</code> compresses one file into <code>FILE.gz</code> (the original goes away); <code>gunzip</code> undoes it, and <code>zcat</code> prints the text without unpacking.</li>
<li><code>file</code> tells what kind of file something is, whatever its name says.</li>
</ul>`,
  tasks: [
    {
      goal: 'See how much space `~/library` takes (`du -sh`)',
      tip: '`du -sh DIR` prints one total for the directory, in K, M or G.',
      hints: [
        '`du` measures; `-s` gives one sum and `-h` easy units.',
        '`du -sh` and the library\'s path.',
        'du -sh ~/library',
      ],
      done: ctx => ctx.ran('du', record => ctx.flag(record, 's') && ctx.hasPath(record, `${ctx.home}/library`)),
    },
    {
      goal: 'Pack `~/library` into one archive, `~/travel/library.tar` (`tar -cf`: create, file name)',
      tip: '`tar -cf ARCHIVE THINGS` packs the things into a new archive named ARCHIVE.',
      hints: [
        'After `-cf` comes the archive\'s name first, then what to pack.',
        '`tar -cf ~/travel/library.tar ~/library`.',
        'tar -cf ~/travel/library.tar ~/library',
      ],
      done: ctx => ctx.ran('tar', tarFlag(ctx, 'c')) && holdsLibrary(ctx, tarOf(ctx)) && ctx.gzipped(tarOf(ctx)) === null,
      near: ctx => (ctx.archive(tarOf(ctx)) && !holdsLibrary(ctx, tarOf(ctx)) ? 'That archive does not hold the library. Pack ~/library into it.' : null),
    },
    {
      goal: 'List what is inside `~/travel/library.tar` (`tar -tf`)',
      tip: '`tar -tf ARCHIVE` lists its contents without unpacking anything.',
      hints: [
        'The letter for list is `t`.',
        '`tar -tf` and the archive.',
        'tar -tf ~/travel/library.tar',
      ],
      done: ctx => ctx.ran('tar', record => ctx.flag(record, 't') && ctx.paths(record).some(path => holdsLibrary(ctx, path))),
      near: ctx => (ctx.ran('cat', record => ctx.paths(record).some(path => ctx.archive(path))) ? 'An archive is not text. tar -tf lists what is in it.' : null),
    },
    {
      goal: 'Pack `~/library` again, compressed, into `~/travel/library.tar.gz` (`tar -czf`: `z` for gzip)',
      tip: 'With `z`, tar also compresses the archive, so it takes less space.',
      hints: [
        'The same as before, with one more letter.',
        '`tar -czf ~/travel/library.tar.gz ~/library`.',
        'tar -czf ~/travel/library.tar.gz ~/library',
      ],
      done: ctx => ctx.ran('tar', tarFlag(ctx, 'c')) && holdsLibrary(ctx, tgzOf(ctx)) && ctx.gzipped(tgzOf(ctx)) !== null,
      near: ctx => (ctx.archive(tgzOf(ctx)) && ctx.gzipped(tgzOf(ctx)) === null ? 'A name ending in .gz does not compress anything: add -z.' : null),
    },
    {
      goal: 'Ask what kind of file each archive in `~/travel` is (`file`)',
      tip: '`file` looks inside a file and names its kind: text, tar archive, gzip data.',
      hints: [
        '`file` takes one or more paths; a wildcard works.',
        '`file ~/travel/*`.',
        'file ~/travel/*',
      ],
      done: ctx => ctx.ran('file', record => ctx.paths(record).some(path => ctx.archive(path) || ctx.gzipped(path) !== null)),
    },
    {
      goal: 'Unpack `~/travel/library.tar.gz` into a new directory `~/travel/unpacked` (`tar -xzf`, and `-C` for where)',
      tip: '`tar -xzf ARCHIVE -C DIR` unpacks into DIR, which must exist: make it with `mkdir` first.',
      hints: [
        'First `mkdir ~/travel/unpacked`, then `tar -xzf` with `-C` and that directory.',
        '`x` for extract, `z` for gzip, `f` for the file, then `-C ~/travel/unpacked`.',
        'mkdir ~/travel/unpacked && tar -xzf ~/travel/library.tar.gz -C ~/travel/unpacked',
      ],
      done: ctx => ctx.ran('tar', tarFlag(ctx, 'x')) && unpackedScroll(ctx),
      near: ctx => firstNote([
        [() => ctx.tried('tar', record => record.status !== 0 && ctx.flag(record, 'x') && record.args.includes('-C')), 'The directory for -C must exist: mkdir ~/travel/unpacked first.'],
        [() => ctx.ran('tar', record => ctx.flag(record, 'x') && !record.args.includes('-C')), `That unpacked into ${tilde(ctx.cwd)}, where you stand. Add -C ~/travel/unpacked.`],
      ]),
    },
    {
      goal: 'Compress the single file `~/travel/notes.txt` (`gzip`), then read it without unpacking (`zcat`)',
      tip: '`gzip FILE` makes `FILE.gz`; `zcat FILE.gz` prints the text inside.',
      hints: [
        'Two commands: `gzip` the file, then `zcat` the new `.gz` file.',
        '`gzip ~/travel/notes.txt`, then `zcat ~/travel/notes.txt.gz`.',
        'gzip ~/travel/notes.txt && zcat ~/travel/notes.txt.gz',
      ],
      done: ctx => ctx.ran('zcat', record => ctx.hasPath(record, `${notesOf(ctx)}.gz`)),
      near: ctx => (ctx.ran('cat', record => ctx.hasPath(record, `${notesOf(ctx)}.gz`)) ? 'cat shows the compressed bytes. zcat prints the text inside.' : null),
    },
  ],
  solve: [
    'du -sh library',
    'tar -cf travel/library.tar library',
    'tar -tf travel/library.tar',
    'tar -czf travel/library.tar.gz library',
    'file travel/*',
    'mkdir travel/unpacked',
    'tar -xzf travel/library.tar.gz -C travel/unpacked',
    'gzip travel/notes.txt',
    'zcat travel/notes.txt.gz',
  ],
  boss: {
    title: 'The Journey Down',
    briefing: `<p>The road to Ring Zero opens. Your packing list, <code>~/travel/packing_list.txt</code>, names the archive to make and the two or three things to pack into it, compressed. Pack exactly those, and leave the cursed <code>~/junk</code> behind.</p>`,
    setup: setupBoss,
    hints: [
      'Read the list with `cat ~/travel/packing_list.txt`.',
      'One `tar -czf`, the archive\'s name from the list, then every item it names.',
      ({ archive, items }) => `tar -czf ${tilde(archive)} ${items.map(item => `~/${item}`).join(' ')}`,
    ],
    done: bossDone,
    near: bossNear,
    solve: solveBoss,
  },
  recap: [
    ['du -sh ~/library', 'how much space a directory takes'],
    ['tar -cf ~/travel/library.tar ~/library', 'pack a directory into an archive'],
    ['tar -tf ~/travel/library.tar', 'list an archive'],
    ['tar -czf ~/travel/library.tar.gz ~/library', 'pack and compress'],
    ['tar -xzf ~/travel/library.tar.gz -C ~/travel/unpacked', 'unpack into a directory'],
    ['gzip ~/travel/notes.txt', 'compress one file'],
    ['zcat ~/travel/notes.txt.gz', 'read a compressed file'],
  ],
  why: `<p>Why one file? Copying, sending or backing up one archive is simpler and faster than thousands of small files, and the archive keeps each file's name, place, permissions and date.</p>
<p>Why are tar and gzip two tools? Each does one job: <code>tar</code> packs, <code>gzip</code> compresses. The <code>z</code> letter only asks tar to call gzip for you. This is the Unix way: small tools that work together, as you saw with pipes.</p>
<p>That was the last chapter of Kernelia. You can move around, read, search, change and share files, run programs and scripts, and manage what runs. Ring Zero takes you below, to what the kernel does underneath.</p>`,
  field: [
    ['tar -cjf FILE.tar.bz2 DIR', 'bzip2 instead of gzip: smaller, slower'],
    ['tar -xzf FILE.tar.gz FILE_INSIDE', 'unpack only one file'],
    ['zip -r FILE.zip DIR', 'a zip archive, common on other systems'],
    ['df -h', 'how full each disk is'],
  ],
  spells: [
    { name: 'tar', summary: 'Pack, list and unpack archives.', examples: [['tar -czf ~/travel/library.tar.gz ~/library', 'pack and compress'], ['tar -tf ~/travel/library.tar', 'list'], ['tar -xzf ~/travel/library.tar.gz -C ~/travel/unpacked', 'unpack']] },
    { name: 'gzip / zcat', summary: 'Compress one file, and read it compressed.', examples: [['gzip ~/travel/notes.txt', 'makes notes.txt.gz'], ['zcat ~/travel/notes.txt.gz', 'print the text']] },
    { name: 'du -sh', summary: 'How much space a directory takes.', examples: [['du -sh ~/library', 'one total']] },
    { name: 'file', summary: 'What kind of file something is.', examples: [['file ~/travel/*', 'text, tar, gzip...']] },
  ],
};
