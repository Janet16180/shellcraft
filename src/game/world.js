/**
 * The starting world of Kernelia, as a patch any backend can load.
 *
 * The overworld is the player's home: the cottage and the areas the chapters
 * use, all owned by the player. The dungeon is the rest of the system, owned
 * by root (and a few system users) with the owners and modes of a real
 * Ubuntu 24.04 server running rsyslog, cron and sshd. The backend owns /usr
 * and /dev, so they are not described here.
 */
import { put, cd, dir, file } from '../backend/spec.js';

const HOST = 'kernelia';

const SCROLL = [
  'THE SCROLL OF AGES', '==================',
  'In the beginning there was only the kernel,', 'and the kernel was silent.',
  'Then came the shell, and with it, the first command.',
  'The first mage typed "ls" and saw the world.',
  'The second mage typed "cd" and walked through it.',
  'The third mage typed "rm -rf /*" and was never seen again.',
  '(Learn from the third mage.)',
  'In the Age of Pipes, commands learned to talk to each other.',
  'Output flowed like rivers from one spell into the next.',
  'A dragon slept beneath the Tower of Echoes.',
  'Its name was written in every log file, yet no one could read it.',
  'The scribes wrote everything in plain text,',
  'for plain text is eternal and every tool can read it.',
  'They say the Dragon of /dev/null devours all output sent its way.',
  'Nothing that enters /dev/null ever returns.',
  'The elders kept their secrets in files that began with a dot.',
  'Plain ls passed them by; ls -a revealed them.',
  'Permissions guarded every door: read, write, and execute.',
  'The number 7 meant all three. The number 4 meant only reading.',
  'A wise mage never ran a script they had not read first.',
  'The daemons came later.',
  'Most were friendly: cron ran the chores on time, sshd kept the gates.',
  'But one daemon grew greedy, and devoured the CPU.',
  'The mages called it the Shadow Daemon.',
  'It ignored polite requests to stop.',
  'In the end the ninth signal ended it, for no program can ignore it.',
  'The last known dragon sighting was recorded in the syslog.',
  'The Library keeps many more scrolls than this one.',
  'But reading them all from the top would take forever.',
  'That is why the mages invented head and tail.',
  'And why they invented grep, to find one line among thousands.',
  'If you have read this far line by line, you are very patient.',
  'A faster mage would have used tail.',
  'Remember: tail -f follows a file as it grows, perfect for logs.',
  'And less lets you scroll a file one page at a time (q quits).',
  'THE WORD OF POWER IS WRITTEN BELOW.',
  'Speak it with echo, and with nothing else.',
  'Word of power: TUX',
].join('\n') + '\n';

const readme = home => `Dear apprentice,

You have awakened in Kernelia, a world built from files and
directories. Here, commands are spells.

A Shadow Daemon has taken over this machine and is eating its
CPU. To stop it, you must master the shell, chapter by chapter.

Every directory is a room and every file is an item. Your home,
${home}, is yours. Outside it lies the dungeon, where most
things belong to root.

Stuck? Ask for a hint. To study a spell, read its manual:
man COMMAND, for example man ls.

    -- The Guardian of Root
`;

const SECRET_MAP = `THE SECRET MAP  (plain ls skips this file; ls -a shows it)

  ~/forest   a cave hides an ancient key
  ~/junk     clean it up, but save the boots
  ~/library  the Scroll of Ages hides a word of power
  ~/tower    four gems, and one of them is hidden
  ~/market   a messy inventory needs sorting
  ~/gate     sealed until its spell is allowed to execute

The Shadow Daemon lurks in the process table.
`;

const BASHRC = `# ~/.bashrc: executed by bash(1) for non-login shells.
alias ll='ls -alF'
alias la='ls -A'
export EDITOR=nano
`;

const KEY = `    ,o.
   8   8=========
    'o'    ||  ||
The Ancient Key. It hums with power.
Engraved on its side: "Copy me with cp and I will be in two places at once."
`;

const GATE_SPELL = `#!/bin/bash
# The ancient spell of the Sealed Gate.
echo "The runes on the gate begin to glow..."
echo "*** The Sealed Gate grinds open! ***"
`;

const INVENTORY = 'potion\nsword\napple\npotion\nshield\napple\npotion\nmap\nsword\ntorch\napple\ntorch\nrope\npotion\n';

/**
 * Everything the player's home holds at the start, by name. Each builder gets
 * node makers that set the player as owner, and the home's absolute path.
 */
const HOME_ENTRIES = {
  'readme.txt': ({ f }, home) => f(readme(home)),
  '.secret_map': ({ f }) => f(SECRET_MAP),
  '.bashrc': ({ f }) => f(BASHRC),
  forest: ({ d, f }, home) => d({
    clearing: d({ 'mushroom.txt': f('A glowing mushroom whispers:\n"Lost? Type pwd. Want to go back up? cd .."\n') }),
    river: d({ 'fish.txt': f(`A fish leaps out of the water and says:\n"Absolute paths start with a slash, like ${home}/forest/river."\n`) }),
    cave: d({
      'bat.txt': f('A bat squeaks. Deeper still, something glitters...\n(try ls, then cd deep)\n'),
      deep: d({ 'ancient_key.txt': f(KEY) }),
    }),
  }),
  junk: ({ d, f }) => d({
    'rotten_apple.txt': f('It smells terrible. Flies everywhere.\n'),
    'old_boots.txt': f('Worn but sturdy leather boots. Keep these!\n'),
    empty_crate: d({}),
    cobwebs: d({
      'spider.txt': f('A very offended spider.\n'),
      'web1.txt': f('Sticky.\n'),
      'web2.txt': f('Stickier.\n'),
    }),
  }),
  library: ({ d, f }) => d({
    'scroll_of_ages.txt': f(SCROLL),
    'librarian.txt': f('The librarian whispers: "Nobody reads a whole scroll. Use head and tail."\n'),
  }),
  tower: ({ d, f }) => d({
    floor1: d({
      'note.txt': f('Someone scratched into the wall:\n"the password is not on this floor"\n'),
      'ruby.gem': f('A blood-red ruby. Worth 300 gold.\n'),
    }),
    floor2: d({
      'diary.txt': f('Day 12: the stairs keep moving.\nDay 13: I hid my things upstairs.\nDay 14: the password to the vault is penguin42\nDay 15: I forgot where I put the vault.\n'),
      'sapphire.gem': f('A deep blue sapphire. Worth 450 gold.\n'),
    }),
    floor3: d({
      'bones.txt': f('Old bones. Probably a mage who never learned find.\n'),
      'emerald.gem': f('A green emerald. Worth 500 gold.\n'),
      '.opal.gem': f('A shimmering opal, hidden from plain ls.\nfind sees hidden files. That is how you found me.\nWorth 1000 gold.\n'),
    }),
  }),
  market: ({ d, f }) => d({
    'inventory.txt': f(INVENTORY),
    'merchant.txt': f('The merchant sighs: "My inventory is a mess. Duplicates everywhere."\n'),
  }),
  gate: ({ d, f }) => d({
    'open_gate.sh': f(GATE_SPELL),
    'inscription.txt': f('Only a spell that is allowed to EXECUTE may open this gate.\nCheck the permissions with ls -l.\n'),
  }),
};

const SYSTEM_USERS = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/run/ircd:/usr/sbin/nologin
_apt:x:42:65534::/nonexistent:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
syslog:x:101:102::/nonexistent:/usr/sbin/nologin
sshd:x:102:65534::/run/sshd:/usr/sbin/nologin
`;

const groups = user => `root:x:0:
daemon:x:1:
bin:x:2:
sys:x:3:
adm:x:4:syslog
tty:x:5:
disk:x:6:
lp:x:7:
mail:x:8:
news:x:9:
uucp:x:10:
man:x:12:
proxy:x:13:
kmem:x:15:
dialout:x:20:
fax:x:21:
voice:x:22:
cdrom:x:24:
floppy:x:25:
tape:x:26:
sudo:x:27:
audio:x:29:
dip:x:30:
www-data:x:33:
backup:x:34:
operator:x:37:
list:x:38:
irc:x:39:
src:x:40:
shadow:x:42:
utmp:x:43:
video:x:44:
sasl:x:45:
plugdev:x:46:
staff:x:50:
games:x:60:
users:x:100:
nogroup:x:65534:
crontab:x:997:
syslog:x:102:
_ssh:x:103:
${user}:x:1000:
`;

const OS_RELEASE = `PRETTY_NAME="Ubuntu 24.04.5 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.5 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=noble
LOGO=ubuntu-logo
`;

const CRONTAB = `# /etc/crontab: system-wide crontab
# Unlike any other crontab you don't have to run the \`crontab'
# command to install the new version when you edit this file
# and files in /etc/cron.d. These files also have username fields,
# that none of the other crontabs do.

SHELL=/bin/sh
# You can also override PATH, but by default, newer versions inherit it from the environment
#PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Example of job definition:
# .---------------- minute (0 - 59)
# |  .------------- hour (0 - 23)
# |  |  .---------- day of month (1 - 31)
# |  |  |  .------- month (1 - 12) OR jan,feb,mar,apr ...
# |  |  |  |  .---- day of week (0 - 6) (Sunday=0 or 7) OR sun,mon,tue,wed,thu,fri,sat
# |  |  |  |  |
# *  *  *  *  * user-name command to be executed
17 *\t* * *\troot\tcd / && run-parts --report /etc/cron.hourly
25 6\t* * *\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }
47 6\t* * 7\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.weekly; }
52 6\t1 * *\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.monthly; }
#
`;

const motd = home => `Welcome to Kernelia (Ubuntu 24.04.5 LTS).

Your home is ${home}. Outside it, most files belong to root:
you can read many of them, but you cannot change them.
`;

const syslog = home => `2026-09-25T09:00:02.412577+00:00 ${HOST} guardian: a new apprentice has awakened in ${home}
2026-09-25T09:13:37.104829+00:00 ${HOST} watchtower: dragon sighted near /dev/null
2026-09-25T09:17:01.205316+00:00 ${HOST} CRON[1203]: (root) CMD (cd / && run-parts --report /etc/cron.hourly)
2026-09-25T09:42:00.008163+00:00 ${HOST} shadow_daemon: awake, and the CPU is mine
2026-09-25T09:42:15.311740+00:00 ${HOST} shadow_daemon: caught SIGTERM, and kept running
2026-09-25T10:17:01.198771+00:00 ${HOST} CRON[1377]: (root) CMD (cd / && run-parts --report /etc/cron.hourly)
`;

const AUTH_LOG = `2026-09-25T09:17:01.201244+00:00 ${HOST} CRON[1202]: pam_unix(cron:session): session opened for user root(uid=0) by root(uid=0)
2026-09-25T09:17:01.209512+00:00 ${HOST} CRON[1202]: pam_unix(cron:session): session closed for user root
2026-09-25T10:17:01.195160+00:00 ${HOST} CRON[1376]: pam_unix(cron:session): session opened for user root(uid=0) by root(uid=0)
2026-09-25T10:17:01.202945+00:00 ${HOST} CRON[1376]: pam_unix(cron:session): session closed for user root
`;

const DPKG_LOG = `2026-09-17 02:29:17 install unminimize:amd64 <none> 0.2.1
2026-09-17 02:29:17 status half-installed unminimize:amd64 0.2.1
2026-09-17 02:29:17 status unpacked unminimize:amd64 0.2.1
2026-09-17 02:29:17 startup packages configure
2026-09-17 02:29:17 configure unminimize:amd64 0.2.1 <none>
2026-09-17 02:29:17 status unpacked unminimize:amd64 0.2.1
2026-09-17 02:29:17 status half-configured unminimize:amd64 0.2.1
2026-09-17 02:29:17 status installed unminimize:amd64 0.2.1
`;

const APT_HISTORY = `
Start-Date: 2026-09-17  02:29:17
Commandline: apt-get --yes -oDebug::pkgDepCache::AutoInstall=yes --no-install-recommends install unminimize
Install: unminimize:amd64 (0.2.1)
End-Date: 2026-09-17  02:29:17
`;

const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1);

function ownedBy(user) {
  return {
    d: (children, mode = 0o755) => dir(children, { owner: user, mode }),
    f: (content, mode = 0o644) => file(content, { owner: user, mode }),
  };
}

function checkPlayer({ home, user }) {
  if (home !== `/home/${user}`) throw new Error(`the player's home must be /home/${user}, got ${home}`);
}

function etc({ home, user }) {
  return dir({
    crontab: file(CRONTAB),
    group: file(groups(user)),
    hostname: file(`${HOST}\n`),
    motd: file(motd(home)),
    'os-release': file(OS_RELEASE),
    passwd: file(`${SYSTEM_USERS}${user}:x:1000:1000:${capitalize(user)},,,:${home}:/bin/bash\n`),
  });
}

function varLog(home) {
  return dir({
    apt: dir({ 'history.log': file(APT_HISTORY) }),
    'auth.log': file(AUTH_LOG, { owner: 'syslog', group: 'adm', mode: 0o640 }),
    'dpkg.log': file(DPKG_LOG),
    syslog: file(syslog(home), { owner: 'syslog', group: 'adm', mode: 0o640 }),
  }, { group: 'syslog', mode: 0o775 });
}

function homeDir({ home, user }) {
  const makers = ownedBy(user);
  const children = Object.fromEntries(Object.entries(HOME_ENTRIES).map(([name, build]) => [name, build(makers, home)]));
  return dir(children, { owner: user, mode: 0o750 });
}

/**
 * Names of everything the player's home starts with: the files of the
 * cottage and the overworld areas.
 *
 * @type {string[]}
 */
export const HOME_NAMES = Object.keys(HOME_ENTRIES);

/**
 * The whole starting world: the dungeon outside home and the overworld inside
 * it. Loading it replaces /etc, /home, /root, /tmp and /var, then puts the
 * player at home.
 *
 * @param {{home: string, user: string}} player The player's user name and home.
 * @returns {object[]} The patch.
 * @throws {Error} If home is not /home/USER.
 */
export function baseWorld(player) {
  checkPlayer(player);
  return [
    put('/etc', etc(player)),
    put('/home', dir({ [player.user]: homeDir(player) })),
    put('/root', dir({}, { mode: 0o700 })),
    put('/tmp', dir({}, { mode: 0o1777 })),
    put('/var', dir({ log: varLog(player.home) })),
    cd(player.home),
  ];
}

/**
 * Put one entry of the starting home back as it was at the start: an area
 * like `forest` with everything inside it, or a file like `readme.txt`.
 * Chapters use it to reset the places they play in.
 *
 * @param {string} name A name from HOME_NAMES.
 * @param {{home: string, user: string}} player The player's user name and home.
 * @returns {object[]} The patch.
 * @throws {Error} If the name is not in HOME_NAMES or home is not /home/USER.
 */
export function restore(name, player) {
  if (!(name in HOME_ENTRIES)) throw new Error(`unknown home entry: ${name}`);
  checkPlayer(player);
  return [put(`${player.home}/${name}`, HOME_ENTRIES[name](ownedBy(player.user), player.home))];
}
