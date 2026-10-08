/**
 * Pixel sprites as grids of palette letters ('.' is transparent). The
 * overworld sprites come from the original game, the dungeon tiles, torch,
 * ring and chest from Ring Zero's Pixel Dungeon.
 */

const toon = rows => ({ pal: 'toon', rows });
const ink = rows => ({ pal: 'ink', rows });

/**
 * Every sprite by name; an array is an animation's frames.
 *
 * @type {Record<string, {pal: 'ink'|'toon', rows: string[]} | {pal: 'ink'|'toon', rows: string[]}[]>}
 */
export const SPRITES = {
  player: toon(['...hhhh...', '..hhyhhh..', '.hhhhhhhh.', 'hhhhhhhhhh', '..ssssss..', '..sesses..', '..ssssss..', '.rrrrrrrr.', 'srrrrrrrrs', '.rrryyrrr.', '.rrrrrrrr.']),
  legs: [toon(['..bb..bb..']), toon(['.bb....bb.'])],
  scroll: toon(['........', '.dwwwwd.', '.wkkkkw.', '.wwwwww.', '.wkkkww.', '.wwwwww.', '.dwwwwd.', '........']),
  gem: toon(['..cccc..', '.clccdc.', 'clcccccd', 'cccccccd', '.cccccd.', '..cccd..', '...cd...', '........']),
  key: toon(['........', '.yyy....', 'y...y...', 'y...yyyy', 'y...y.yy', '.yyy....', '........', '........']),
  potion: toon(['...kk...', '...cc...', '..c..c..', '.cggggc.', '.cgllgc.', '.cggggc.', '..cccc..', '........']),
  fire: [
    toon(['...o....', '..oyo...', '..oyyo..', '.oyyyo..', '.oyyyyo.', '..kkkk..', '.k.kk.k.', '........']),
    toon(['....o...', '...oyo..', '..oyyo..', '..oyyyo.', '.oyyyyo.', '..kkkk..', '.k.kk.k.', '........']),
  ],
  ghost: toon(['....kkkk....', '..kkkkkkkk..', '.kkkkkkkkkk.', '.kkrrkkrrkk.', 'kkkrrkkrrkkk', 'kkkkkkkkkkkk', 'kkkkwwwwkkkk', 'kkkwkkkkwkkk', 'kkkkkkkkkkkk', 'kkkkkkkkkkkk', 'kk.kkk.kkk.k', 'k...k...k...']),
  book: ink(['........', '.kk..kk.', 'kwwkkwwk', 'kwlwwlwk', 'kwwwwwwk', 'kwlwwlwk', 'kbbkkbbk', '.kk..kk.']),
  void: ink(['..pppp..', '.pkkkkp.', 'pkkvkkkp', 'pkkkkkkp', 'pkkkkvkp', 'pkkkkkkp', '.pkkkkp.', '..pppp..']),
  padlock: ink(['..lll..', '.l...l.', '.l...l.', 'kkkkkkk', 'kyyyyyk', 'kyykyyk', 'kyykyyk', 'koooook', 'kkkkkkk']),
  brick: ink([
    'dddddddkdddddddk', 'nnnnnnnknnnnnnnk', 'nnnnnnnknnnnnnnk', 'kkkkkkkkkkkkkkkk',
    'dddkdddddddkdddd', 'nnnknnnnnnnknnnn', 'nnnknnnnnnnknnnn', 'kkkkkkkkkkkkkkkk',
    'nnnnnnnkdddddddk', 'nnnnnnnknnnnnnnk', 'nnnnnnnknnnnnnnk', 'kkkkkkkkkkkkkkkk',
    'dddkdddddddknnnn', 'nnnknnnnnnnknnnn', 'nnnknnnnnnnknnnn', 'kkkkkkkkkkkkkkkk',
  ]),
  flagstone: ink([
    'ddnnnnnkdnnnnnnk', 'dnnnnnnknnnnnnnk', 'nnnnnnnknnnnnnnk', 'nnnnnnnknnnnndnk',
    'nnnndnnknnnnnnnk', 'nnnnnnnknnnnnnnk', 'nnnnnnnknnnnnnnk', 'kkkkkkkkkkkkkkkk',
    'nnnkddnnnnnkddnn', 'nnnkdnnnnnnkdnnn', 'nnnknnnnnnnknnnn', 'nnnknnnnnnnknnnn',
    'ndnknnnnnnnknnnn', 'nnnknnnndnnknnnn', 'nnnknnnnnnnknnnn', 'kkkkkkkkkkkkkkkk',
  ]),
  torch: [
    ink(['....y...', '...yy...', '...yoy..', '..yoyy..', '..yoyoy.', '.yoyyyo.', '.oyyyyo.', '.ooyyoo.', '..oooo..', '.kssssk.', '.klllsk.', '..kssk..', '..kbrk..', '..kbrk..', '.kkbrkk.', 'kllbrllk', '.kkbrkk.', '..kbrk..', '..kbrk..', '...kk...']),
    ink(['........', '...y....', '...yy...', '..yyoy..', '..yoyy..', '.yoyyoy.', '.oyyyyo.', '.ooyyoo.', '..oooo..', '.kssssk.', '.klllsk.', '..kssk..', '..kbrk..', '..kbrk..', '.kkbrkk.', 'kllbrllk', '.kkbrkk.', '..kbrk..', '..kbrk..', '...kk...']),
    ink(['...y....', '...y....', '..yyy...', '..yoy...', '.yoyoy..', '.oyyyoy.', '.oyyyyo.', '.ooyyoo.', '..oooo..', '.kssssk.', '.klllsk.', '..kssk..', '..kbrk..', '..kbrk..', '.kkbrkk.', 'kllbrllk', '.kkbrkk.', '..kbrk..', '..kbrk..', '...kk...']),
  ],
  ring: ink(['....ee....', '...ewee...', '...yeey...', '..yy..yy..', '.yy....yy.', '.y......y.', '.o......o.', '.oo....oo.', '..oo..oo..', '...oooo...']),
  chest: ink([
    '....w.........y.......', '...www.......yyy......', '....w.........y.......', '...kkkkkkkkkkkkkkkk...',
    '..kbbbbbbbbbbbbbbbbk..', '..kbrrrrrrrrrrrrrrbk..', '..kyyyyyyyyyyyyyyyyk..', '.kyywyyoyyyywyyoyyyyk.',
    '.kyoyyyyoyyyyyyyoyyyk.', '.kkkkkkkkkkkkkkkkkkkk.', '.kyybbbbbbbbbbbbbbyyk.', '.kyyrrrrrkyykrrrrryyk.',
    '.kyybbbbkyyyykbbbbyyk.', '.kyybbbbkykkykbbbbyyk.', '.kyybbbbkyyyykbbbbyyk.', '.kyyrrrrkkkkkkrrrryyk.',
    '.kyybbbbbbbbbbbbbbyyk.', '.kyyrrrrrrrrrrrrrryyk.', '.kkkkkkkkkkkkkkkkkkkk.',
  ]),
  shield: ink(['kkkkkkkk', 'kbbyybbk', 'kbbyybbk', 'kyyyyyyk', 'kbbyybbk', '.kbyybk.', '.kbyybk.', '..kyyk..', '...kk...']),
  anvil: ink(['kkkkkkkkkkkkkk', 'klllllllllllkk', 'ksssssssssssk.', '.kkkssssssskk.', '....kssssk....', '....kssssk....', '...kssssssk...', '..kddddddddk..', '..kkkkkkkkkk..']),
  rune: ink([
    '....pppp....', '..pp....pp..', '.p...vv...p.', '.p..v..v..p.', 'p..v....v..p', 'p.v..vv..v.p',
    'p.v..vv..v.p', 'p..v....v..p', '.p..v..v..p.', '.p...vv...p.', '..pp....pp..', '....pppp....',
  ]),
  web: ink(['lllllll.', 'll..l...', 'l.l.l...', 'l..l....', 'lll.....', 'l.......', 'l.......', '........']),
  bones: ink(['ww.....ww', '.ww...ww.', '...www...', '.ww...ww.', 'ww.....ww']),
  barrel: ink(['..kkkkkk..', '.krbbbbrk.', 'kssssssssk', 'krbbbbbbrk', 'krbbbbbbrk', 'kssssssssk', 'krbbbbbbrk', 'krbbbbbbrk', 'kssssssssk', '.krbbbbrk.', '..kkkkkk..']),
  crate: ink(['kkkkkkkkkkkk', 'kbbbbbbbbbbk', 'kbrbbbbbbrbk', 'kbbrbbbbrbbk', 'kbbbrbbrbbbk', 'kbbbbrrbbbbk', 'kbbbrbbrbbbk', 'kbbrbbbbrbbk', 'kbrbbbbbbrbk', 'kkkkkkkkkkkk']),
  smithsMark: ink(['.......', 'kkkkkkk', '.kkkkkk', '...kkk.', '...kkk.', '..kkkkk', '.kkkkkk']),
  scribesMark: ink(['.....kk', '....kkk', '...kkk.', '...kk..', '..k....', '.k.....', 'k......']),
};
