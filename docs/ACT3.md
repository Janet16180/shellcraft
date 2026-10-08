# Act III draft: "The Realm of Others" (chapters 15-21)

Context: Shellcraft 2 teaches total beginners Linux in a simulated bash (browser game, fantasy theme).
Chapters done: 1 awakening (whoami/pwd/ls/cat/man/--help/clear), 2 forest (cd, .., absolute/relative, cd -, Tab),
3 unseen (ls -a, ls -l, hidden files), 4 camp (mkdir, touch, echo >, cp, mv), 5 junkyard (rm, rmdir, rm -r),
6 mirrors (wildcards * ? [], quotes), 7 library (head, tail, wc), 8 tower (grep, -i, -r, find -name),
9 market (sort, uniq, |, >>), 10 descent (/, /etc, /var/log, $PATH, which, type), 11 gate (ls -l permission
string, id, chmod letters and numbers, scripts need r+x, root is denied nothing), 12 well (variables, quotes, $?,
2>, /dev/null, && ||), 13 daemon (ps, ps aux, pgrep, kill, kill -9), 14 forge (scripts, #!, $1, for loops).
Next game after this: Ring Zero (advanced: /proc, signals, job control, fds, inodes, permissions deep, namespaces).
Rule: a lesson panel per chapter (short HTML), 6-9 tasks, a boss with randomised content that proves the skill.
User constraint: permissions confuse beginners -> split over several chapters with characters; group = faction,
others = everyone else. Explain the first char of ls -l (- d l) with colour. Links = pointers, with an
explainer animation before the level, symlink "teleport".

## Ch15 The Guild (users and groups)  -- permissions arc part 1 (who)
World gains people: users `mira` (blacksmith), `oren` (scribe), `tamsin`; groups (factions): `smiths`, `scribes`.
hero joins nothing yet. Teach: /etc/passwd revisit -> users; /etc/group -> factions; `id`, `id mira`,
`groups`, `ls -l` third/fourth column = owner and group of a file; `ls -l /home` shows each person's home.
Tasks: list homes; who owns ~mira's notice; which faction owns the guild hall /srv/guild; read a file whose
group is scribes (denied: you are "others"); see why with id. Visual: the perm-map grid from ch11, now with
faces/badges: owner = a person, group = a faction banner, others = the crowd.
Boss: a sealed chest owned by X, group Y, mode 640: answer who can read it (task checks via `id`/`ls -l`
plus writing the name into answer file?)  [weak: needs a better boss]

## Ch16 The Faction Hall (group permissions, chgrp, sudo-less)  -- part 2 (what each class may do)
hero is given membership in `scribes` (setup: new login / `newgrp`? simpler: world already has hero in scribes
after ch15 story). Teach: group bits matter for members, others bits for everyone else; `chgrp scribes file`;
`chmod g+w`, `chmod o-r`; directories: r = list, x = enter, w = create/delete inside (the confusing part):
a dir with r but no x, x but no r. Tasks: share a scroll with the scribes but not others; lock a directory;
discover you can `cd` into a dir you cannot `ls` (x only).
Boss: set up a shared archive dir: group scribes may read and add, others nothing (chgrp + chmod 770/ug+rwx,o-rwx).

## Ch17 The Crown (sudo, root, chown)  -- part 3
`sudo` asks the realm's permission (password simulated or none), `sudo cat /var/log/syslog` (finally read
what ch10 refused), `sudo chown`, why not to live as root, `sudo -l`. Maybe apt as "the market of spells"
(sudo apt install cowsay?) simulated. Boss: recover a file owned by root in your home with sudo chown.

## Ch18 Portals (file types, soft and hard links)
Explainer animation first (art/animation subagent): a file name is a signpost pointing at the data
(inode). Hard link = a second signpost to the same data. Soft link = a signpost pointing at another
signpost (a name). Delete/move the original name: hard link still works, soft link breaks (red, dangling).
Teach: first char of ls -l: - d l (c b p s mentioned once, colour legend); `ln -s ~/forest/cave/deep portal`
then `cd portal` = teleport, `pwd` vs `pwd -P`; `ls -l` shows `portal -> target`; `readlink`; `ln` hard link,
`ls -li` same inode number, link count column (2nd column of ls -l, finally explained); edit through one name
changes both; rm original: hard survives, soft dangles (`cat` says No such file); fix by recreating.
Boss: a maze of portals: follow symlinks to find the real treasure, and repair a broken portal.

## Ch19 The Scribe's Desk (nano, history, keyboard)
Editor: simulated nano (big build: a mini full-screen editor in the terminal: type, ^O save, ^X exit).
History: up arrow, `history`, `!N`, Ctrl+R (engine has `!` now), Ctrl+C to abort a line/command, Ctrl+L.
Boss: fix a broken script with nano and run it.

## Ch20 Background Tasks (jobs)
`sleep 100 &`, `jobs`, `fg`, Ctrl+Z, `bg`, `kill %1`, `tail -f` a log that grows. Prepares Ring Zero.

## Ch21 Pack and Travel (archives, disk, env)
`tar -czf`, `tar -xzf`, `tar -tzf`, `du -sh`, `df -h`, `export`, `alias`, `~/.bashrc`, `source`.
Boss: pack the adventure into an archive / set an alias that persists.

Not included (Ring Zero or later): ssh, curl, networking, cron, systemd, xargs, cut/tr, diff (maybe in 21?), file.

Open questions:
1. Is 3 chapters of permissions right, or 2 (merge sudo/chown into 16)?
2. Order: links before people? (links reuse ls -l columns; the link count column needs inodes)
3. Is nano worth the engine cost vs teaching `echo >`/heredoc? Beginners will meet nano/vim immediately in real life.
4. Better bosses for ch15.
5. Missing basics I forgot?

## REVISED after review (act3-review agent)
Order: 15 Identity (users, groups, owner/group columns, ONLY ONE triplet applies; boss: find the one readable file
among random owners/groups/modes, copy its token) -> 16 Shared Hall (directory r/w/x, delete depends on parent dir,
chgrp; boss: shared faction dir, verified by create/delete probes) -> 17 Portals (file-type char - d l, ln -s teleport,
hard links, inode; explainer animation first; boss: repair a broken portal, hard link survives rm of original) ->
18 The Crown (sudo honestly = policy + your password, chown, least privilege; boss: minimal fix of a root-owned tree,
reject 777) -> 19 Fluency (history, !N, Ctrl-R, Ctrl-C, export/alias/source) -> 20 Jobs (&, jobs, fg, bg, Ctrl-Z,
kill %1) -> 21 Archives (tar).
No nano sim (huge cost); maybe a "scribe" textarea later, labelled honestly.
Engine work needed: user/group database + id USER; chown/chgrp; sudo; symlinks+inodes+ln+readlink; job table; tar.
# Ch15 "The Guild" (id: guild) — who may read what

World: /home/mira, /home/oren, /home/tamsin (drwxr-x---, owned by each). /srv/guild (the guild hall).
Users: mira (smith), oren (scribe), tamsin (scribe+smith). Groups (factions): smiths, scribes.
Story: the Guild of Kernelia welcomed you as a scribe at the gate; you logged in again (setup: /etc/group puts
hero in scribes, then login()).
Explainer first: "Which three letters are yours?" (ladder: owner? -> group? -> everyone else; only one counts).

Lesson (short): people = users; factions = groups; ls -l columns 3 and 4; the ladder (same colours);
`id` you, `id NAME` someone else; `groups NAME`.

Tasks:
1. See who lives in the realm: `ls -l /home` (owner column = each person).
2. Ask which factions you belong to: `id` (or `groups`).
3. Ask about Mira: `id mira`.
4. Look at the guild hall in detail: `ls -l /srv/guild` (owner and group of every scroll).
5. Read the scribes' ledger `/srv/guild/ledger.txt` (oren:scribes 640): you are not the owner, but you are a scribe,
   so the group letters r-- count.
6. Try to read the smiths' plans `/srv/guild/plans.txt` (mira:smiths 640) and read why it refuses: you are
   "everyone else": ---.
7. The trap: `~/guild/my_notice.txt` is yours with mode 044 (----r--r--). Try to read it: denied, although everyone
   else may. (only the owner letters count for you)
8. Fix it: give yourself read back (`chmod u+r ~/guild/my_notice.txt`), then read it.

Boss "Oren's Errand": /srv/guild/archive has 4-5 scrolls scroll_xxx with random owner/group/mode, made so exactly one
can be read by oren. Decoys: owned by oren with 0o044 (owner trap), group scribes with 0o604 (group trap; oren is a
scribe so group --- counts, not others), group smiths 0o640 (oren not a smith), owner mira 0o600.
Task: write the name of the one oren can read into ~/guild/answer.txt. Player must use ls -l and id oren.
Notes per wrong answer explain which letters count for oren on that scroll.
Check: answer file content (trimmed, basename accepted) == winner.

# Ch16 "The Shared Hall" (id: hall) — directories and sharing

Setup: hero also joins smiths (new login). ~/hall with dirs owned by hero.
Lesson: on a directory r = list names, x = go in and use names inside, w = add/remove/rename names (needs x too).
Deleting a file is a change to its DIRECTORY: it needs w on the directory, not on the file. chgrp FACTION PATH.
Table: letters on a file vs on a directory.

Tasks:
1. Take x away from ~/hall/vault (`chmod u-x`), then try `cd ~/hall/vault`: Permission denied.
2. Give x back, take r away (`chmod u+x,u-r` or 300... keep letters: two commands ok); try `ls ~/hall/vault`: denied.
3. Still read `~/hall/vault/key.txt` by its name (x without r: you can use a name you know).
4. ~/hall/archive is r-x: try `rm ~/hall/archive/old.txt` (a file you own, rw-) and read why it refuses.
5. Give yourself w on the archive directory, then remove old.txt.
6. Share ~/hall/shared with the scribes: `chgrp scribes ~/hall/shared`.
7. Let the group in fully: `chmod g+rwx ~/hall/shared` (or 770 / 775...) and keep everyone else out: `chmod o-rwx`.
Boss "The Faction Room": random faction (one of hero's) and random room name ~/hall/room_xxx: make it a room
where that faction can enter, list, add and remove, and nobody else (except you) can even enter.
Check: group == faction, mode exactly 0o770 (owner rwx, group rwx, others ---). Accept 0o770 and 0o2770? keep 770.
Notes: wrong group, others still have x, group missing w, 777 rejected with explanation.

# Ch17 "Portals" (id: portals) — file types, soft and hard links

Explainer first: "Names are pointers" (`explainer: 'links'`).
Lesson: the first character of `ls -l`: `-` file, `d` directory, `l` link (colour legend, like ch11's
perm-map). A name points at data (an inode, `ls -i`). `ln -s TARGET NAME` makes a soft link: it points
at a name, so `ls -l` shows `portal -> TARGET`. `ln TARGET NAME` makes a hard link: a second name for the
same data; the second column of `ls -l` counts the names. Table: hard vs soft (from the explainer).

Tasks (area `~/portals`, with `~/portals/scroll.txt`):
1. Look at the types in your home: `ls -l ~` (first character: `-` or `d`).
2. Make a portal to the deep cave: `ln -s ~/forest/cave/deep ~/portal` (new: clue `ln -s`).
3. See where it points: `ls -l ~/portal` (shows `l` and `-> /home/hero/forest/cave/deep`).
4. Step through it: `cd ~/portal`, then `ls` (the key is there); `pwd` shows the link's name.
5. Make a second name for the scroll: `ln ~/portals/scroll.txt ~/portals/copy.txt`; compare `ls -li` (same inode, link count 2).
6. Remove the first name: `rm ~/portals/scroll.txt`; read `copy.txt` (the data survived).
7. Break a portal: `ln -s ~/portals/scroll.txt ~/portals/old_portal` was made in setup and now dangles
   after task 6: `cat ~/portals/old_portal` fails although `ls -l` shows it (red).
8. Fix it: point it at the surviving name (`ln -sf ~/portals/copy.txt ~/portals/old_portal` or rm + ln -s).
Boss "The Portal Maze": `~/maze` holds 4–5 symlinks `gate_xxx` with random targets, one dangling and
one leading to the treasure directory with `treasure.txt` (random token). Tasks in the briefing:
find the portal that leads to the treasure (ls -l shows targets) and read the treasure through it,
then repair the broken portal so it points at an existing target named in `~/maze/map.txt`.
Checks: read treasure via a path through a symlink; the broken link now resolves to the named target.
Engine needed: slice/links (in progress).
