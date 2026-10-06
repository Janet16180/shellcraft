# Teaching review: the vertical slice (intro, chapters 1 and 2)

Reviewer: `teacher`, 2026-10-06, branch `review/teacher` at `7f4c3b7`.

## How I played

I played it as a beginner who has never opened a terminal. I used `node scripts/serve.js` and
headless Chrome through playwright-core. I played the intro step by step, then chapter 1 and its
boss room, then chapter 2 and its boss room, at 1400x900. I played the intro, chapter 1 and
its boss again at 900x900, in a fresh save. I typed with the keyboard only, read every screen
from screenshots, and made the usual beginner mistakes: `Whoami`, `who am i`, `whomai`, `PWD`,
`LS`, `cat readme`, `ls -help`, Ctrl+L instead of `clear`, `cd forrest`, `cdforest`,
`cd Forest`, `cat forest`, `cd forest/cave/deep` from inside the forest, `cd /forest/cave/deep`,
`cat ancient key.txt`, `cd..`, `cd ../river` for an "absolute" task, `cd ~` for "the shortest
command", typing `cd forest` in full for the Tab task, following a forged letter, and reaching
the beacon the wrong way. I used every hint level at least once. I read DESIGN sections 1, 3,
4, 5 and 7, the methodology's fun toolkit, and the two chapter files only after playing.

The findings are ranked by how much they hurt a learner who is struggling.

## Findings

### 1. The terminal grows past the screen, and the newest output disappears (blocker)

I sent this to `main` early because it affects every playtest.

**Evidence.** At 1400x900, after about 30 lines of output, `#term` grows taller than the
viewport. In my run the grid row was 874 px and `#cmd` sat at y=946. Body is `overflow:hidden`,
so the learner cannot scroll. The browser still scrolls the document to keep the focused input
visible. I typed `cat readme.txt` with the keyboard only (no click) and `scrollY` went from 0 to
109. The header, the XP bar and the "Next task" strip slid off the top, and the readme text, the
first thing the game asks you to read, was below the bottom edge. After `clear` the page stayed
scrolled at 715 px, so the screen was almost empty: only a strip of the quest panel showed, then
a void. The `.sr-only` spans in the quest task list are `position:absolute`, so they escape the
`.side` overflow clip and stretch the document to 1453 px. That is why the bottom half was empty.

**Suggestion.** Give `#screen` a bounded height so it scrolls inside the terminal (for example
`flex:1; min-height:0` in a column capped to the grid row). Make the task list (or `.side`)
`position:relative` so the sr-only spans stay clipped. Add a browser test that types 60 lines at
1400x900 and checks that `scrollY` stays 0 and that `#cmd` stays inside the viewport.

### 2. The right result reached the wrong way gives no feedback, and two of these cases are dead ends

DESIGN section 6 says every task has a near-miss test that must fail. The checks do fail, but the
learner is never told why. Twice this left me stuck with every hint spent.

**2a. The `cd -` dead end (chapter 2, task 6).** I followed a path a beginner would take. From
the cave I typed `cd ../river`. It reached the river but did not count, because it is relative,
and nothing said so. Then I typed `cd ~/forest/river` while already standing in the river, and
that counted for task 5. Next I typed `cd -`. It printed `/home/hero/forest/river` and left me in
the same room, because the previous directory was the river itself. The check
(`ctx.cwd !== ctx.before.cwd`, forest.js:124) failed silently. Hint 1, hint 2 and hint 3
(`cd -`, 8 XP in total) all told me to type what I had already typed twice. A real beginner
stops here.
- Fix the check: count `cd -` when it succeeds
  (`ctx.ran('cd', r => r.args[0] === '-' && r.status === 0)`). The learner showed the skill, and
  the shell did what it should.
- If the room has to change, print a note when `cd -` lands in the same room:
  "» `cd -` took you back to the directory you were in before, and that was this same room.
  Walk somewhere else first, then try `cd -` again."

**2b. The beacon dead end (chapter 2 boss).** From the dungeon I found the beacon with
`ls ~/forest/cave` and reached it with a relative path
(`cd ../../../home/hero/forest/cave/beacon_fx4`). Nothing happened. Then:
- The room contains `flame.txt`, which says "A warm flame. You found your way back with one
  absolute path." That is false: I had not, and the boss was still open.
- Hint 3 is `cd /home/hero/forest/cave/beacon_fx4`. I typed it exactly, from inside the beacon,
  and it did not count, because the jump only counts from the dungeon. No hint says how to get
  back to the dungeon.

Suggestions:
- Print a near-miss note when the learner reaches the target without a qualifying jump:
  "» You reached the beacon, but the Guardian wanted one absolute `cd` from the dungeon. Go back
  outside your home (for example `cd /tmp`) and jump again with a path that starts with `/` or
  `~`."
- Make hint 3 work from wherever the learner stands: "From anywhere outside your home:
  `cd /home/hero/forest/cave/beacon_xxx`. If you are inside your home now, first go out with
  `cd /tmp`."
- Make `flame.txt` neutral ("A warm flame burns here: the Guardian's beacon.") and let the
  success message do the praising.

**2c. Silent non-credit elsewhere.** These did not trap me, but each one left me looking at a
finished-looking screen with the task still open:

| What I did | What the task wanted | Suggested note |
|---|---|---|
| Ctrl+L (chapter 1, task 7). The screen went blank, yet the strip still said "Next task 7 of 7: Wipe the screen clean". The lesson itself says "Ctrl+L clears it too." | `clear` | Accept Ctrl+L. Failing that, print "» Ctrl+L clears the screen too, but this task wants the command: type `clear`." |
| `cd ../river` (task 5) | an absolute path | "» You reached the river with a relative path. This task wants an absolute one, starting with `/`." |
| `cd ~` (task 7) | bare `cd` | "» You are home. `cd ~` works, but there is a shorter way: `cd` on its own." |
| typed `cd forest` in full (task 8) | Tab completion | "» You typed the whole name. Try `cd fo` and press Tab." |

One mechanism covers them all: when the task's place or result is reached but the method check
fails, print one `»` line that names the missing part. That mechanism also fixes 2a and 2b.

### 3. The commonest beginner typos get bare bash errors with no game note

The game already has good notes for two cases: "» Commands are case-sensitive. Try whoami" and
"» Put a space between cd and the dots: cd ..". The same help is missing for these:

| I typed | Shown | Suggested `»` note |
|---|---|---|
| `cdforest` | `bash: cdforest: command not found` | "Put a space between the command and its argument: `cd forest`" |
| `cd Forest` | `No such file or directory` | "Names are case-sensitive too: the door is `forest`." |
| `cd forrest`, `cat readme` | `No such file or directory` | "Check the spelling: `ls` shows the names here. Type the first letters and press Tab to finish a name." For `cat readme`: "The file is `readme.txt`: `.txt` is part of its name." |
| `cat forest` | `cat: forest: Is a directory` | "`forest` is a directory (a door). `cat` reads files. `ls forest` shows what is inside; `cd forest` walks in." |
| `cat ancient key.txt` | two `No such file` lines | "Spaces split a line into words, so `cat` looked for two files. The name uses an underscore: `ancient_key.txt`." This reuses intro step 10 exactly when it matters. |
| `ls -help` | `ls: invalid option -- 'e'` | "One dash starts short options, so `-help` means `-h -e -l -p`. Long options take two dashes: `--help`." |
| `cd forest/cave/deep` while in `~/forest` | `No such file or directory` | "You are already in forest (the prompt shows `~/forest`). From here the path is `cave/deep`." This is the central relative-path misconception, and hint 1 ("The cave is in the forest...") does not address it. |
| `cd /forest/cave/deep` | `No such file or directory` | "A path that starts with `/` starts at the root, not at your home. Your forest is `/home/hero/forest`, or `~/forest`." |
| `who am i` | `bash: who: command not found` | "`whoami` is one word." Also for `factcheck`/`shell`: `who` exists on a real Ubuntu, and `who am i` prints your login line. The title card promises "Where the game's simulation differs, the terminal tells you", and here it does not. |

### 4. "Up" and "down" mean both directions within chapter 2

The lesson handles the inversion honestly: "`cd ..` takes you one level up the tree... Kernelia
draws the tree the way trees grow, with its root underground: from your home, the way toward `/`
leads down the stairs." Then the tasks use both words for both directions:
- Task 2: "**Walk down** to the deepest part of the cave": here down means away from `/`.
- Task 4: "From deep, **climb back up** into the cave with `..`". Meanwhile the sprite walks onto
  the stairs at the bottom of the room, which look like stairs going down.
- Recap and Spellbook: "`cd ..` go up to the parent directory". Map key "Way back": "(cd .. goes
  up one level)", next to an icon of stairs going down.

The metaphor itself works (see "What works"). Only the verbs collide. Suggestion: in game text,
use "deeper" and "back out" for the map. Keep "up" only in the one sentence that explains
tree diagrams.
- Task 2: "Go to the deepest part of the cave: `forest/cave/deep`"
- Task 4: "From deep, step back out into the cave with `..`"
- Recap and Spellbook: "`cd ..` go back to the parent directory"
- Map key, Way back: "The parent directory, `..`. `cd ..` takes you there."

### 5. Too much reading before the first task, some of it repeated, and placed out of sight

- Chapter 1's lesson (212 words) opens by explaining the prompt again: user, machine, `~`, `$`
  and `#`. The intro spent four screens on exactly that a minute earlier. It then lists seven
  commands, several with extra detail (arrow keys and `q` for man, Ctrl+L, `--help`) before the
  learner has typed anything.
- Chapter 2's lesson (256 words) introduces nine ideas before task 1: the tree, root, relative,
  absolute, `..`, the up/down inversion, `.`, `~`, bare `cd`, `cd -`, `ls` with a path, and Tab.
  The single `.` is never used in the chapter.
- Placement: at 1400x900 the lesson starts below the map. Without scrolling the left column you
  see only the title and its first line. At 900 px the lesson starts at y=1334, below a tall,
  mostly empty terminal, so the learner scrolls down to read and back up to type, for every task.

Suggestions:
- Chapter 1: replace the prompt paragraph with one line: "You met the prompt in the intro:
  `hero@kernelia:~$`. Type a command after it and press Enter." Keep the case-sensitivity
  sentence.
- Chapter 2: drop the single `.` and move the up/down sentence into the map key (finding 9).
- Pair each task with the one or two sentences it needs, shown when it becomes current. The
  "Next task" strip already has room for it, for example "Next task 6 of 8: Jump back to where
  you were with `cd -` (the dash means: the directory you were in before)". The full lesson
  stays as a reference.
- At narrow widths, put the current task's explanation above the terminal, or cap the empty
  terminal's height.

### 6. The intro promises things the game does not do

- Step 1 says "It is dark because you have not looked around yet", and step 6 says "The room
  lights up" after `ls`. In the game every room is lit on arrival: home is lit before any `ls`,
  and so are the forest and the cave. A beginner learns a rule that is never used. Either build
  the fog of war (the methodology's fun toolkit lists it) or change step 1 to "The map shows the
  directory you are in: doors are directories, items are files." and drop "The room lights up"
  from step 6.
- Step 11 says "Type cd fo and press Tab" but the demo terminal does not show it happening. The
  intro animates every other command. Animate this one too: type `cd fo`, press Tab, show the
  line become `cd forest/`. Tab is the key beginners need most, and task 8 tests it.
- The intro's world differs from the game's world: home has only `forest` and `readme.txt`, the
  readme text is different, and `ls -l forest` shows `cave` and `mushroom.txt`. In the game the
  forest holds `cave`, `clearing` and `river`, and the mushroom is in the clearing. That is fine
  as a sandbox, but say so in step 1 ("a small practice room") or match the game.
- Step 6's aside "(names that start with a dot stay hidden unless you ask)" is chapter 3
  material on the learner's sixth screen. Cut it.
- Step 10 shows `ls -l` columns (permissions, owner, size, date, `total 8`). Add "You will learn
  to read these columns in chapter 3." so nobody tries to understand them now.

### 7. The adventure log opens scrolled past its own title

**Evidence.** Chapter 1's log at 1400 and at 900 px, and chapter 2's log at 1400 px, open with
the card already scrolled (151 px for chapter 1), because the focused button is scrolled into
view. The first thing on screen is the middle of "Spells
mastered". The "Chapter 1 cleared" heading, the chapter name and "+47 XP" are hidden. That is
the celebration line.

**Suggestion.** Focus the button with `focus({ preventScroll: true })` and leave the card at the
top, or make the buttons a sticky footer. Also:
- Add one recap line for the boss, for example "Boss: you spotted the forgeries by their
  signatures and opened `man clear`" or "Boss: from `/var/log/apt` you found the beacon with
  `ls ~/forest/...` and jumped there with one absolute path". The log currently lists only the
  guided-quest commands.
- After chapter 2 was cleared, the Chapters tab still said "PLAYING" for it.

### 8. Celebrations get swallowed

- The last task's toast fires as the boss briefing opens, so it shows only dimmed behind the
  card ("Quest complete: Wipe the s...").
- The rank-up from Novice to Apprentice (150 XP, during chapter 2's guided quest) went by without
  my noticing: `app.js:65` shows a toast, but when I next looked, the HUD just said Apprentice. A
  rank is a milestone; a brief toast in the same spot as task toasts is easy to miss.
- Toasts live in the map area. When the learner scrolls the left column to read the lesson, the
  map, and every toast with it, is out of view.
- Long goals truncate the XP: "Quest complete: Walk down to the deepest part of the cave:
  `forest/cave/deep` +7...".
- The toast says "Quest complete" for a single task, while the panel calls the whole chapter the
  Quest.

Suggestions: echo each completion in the terminal, where the learner is looking ("» Task done:
Read what glitters down there. +10 XP"). Hold the boss card about 1.5 s, or show a rank-up
inside the card. Say "Task done" instead of "Quest complete". Put the XP first so truncation
cuts the goal, not the reward.

### 9. Smaller things that would help a struggling learner

- **Forgeries get no reaction.** Doing a forged letter's deed (`whoami --help`) does nothing,
  and trying all four deeds wins without comparing signatures. A one-line reaction keeps the
  "read carefully" point and adds fun: "» Somewhere, the Shadow Daemon snickers. That letter
  was signed The Guardian of Boot. Compare the signatures with `readme.txt`." No heart lost.
- **Hearts are never explained.** Three hearts sit in the HUD from the first second, and
  chapters 1 and 2 never mention them. Add to intro step 11: "Hearts: a few dangerous commands
  cost one. Lose all three and the Guardian sets the room up again; you never lose XP."
- **The map key is buried.** "Map key: what each picture really is" is the clearest explanation
  of the metaphor, but it sits collapsed at the very bottom of the left column, below the
  Chapters list. Link it from chapter 2's lesson ("The Map key under the map shows what each
  picture is") or add a `?` to the map header.
- **Skip loses the coach.** After Skip intro there is no "Your turn: type `whoami`" coach. The
  impatient learner who skips needs it most.
- **The first hint is vague.** Hint 1 for `whoami` ("Your name is in the prompt, but a command
  can tell you too") comes after the coach mark and the lesson have already named the command.
  Fine, but hint 2 is the one that helps ("who am i, written as one word"). Consider swapping
  them for task 1 only.

## What works well (keep it)

- **The intro.** It is truly player-paced: Back, Next, Skip, and Enter advances. The prompt
  breakdown with boxed labels (USER, MACHINE, DIRECTORY, REGULAR USER) and the colour split of
  `ls -l forest` into COMMAND, OPTION and ARGUMENT are the clearest explanation of a command line
  I have seen in a beginner game. The final "Your turn" step hands over to the real terminal,
  and the coach mark there is a good bridge.
- **The "Next task" strip** in the terminal header keeps the goal where the learner types.
- **The two typo notes that exist** ("Commands are case-sensitive. Try whoami" and "Put a space
  between cd and the dots") are exactly the right tone: short, specific, kind. Finding 3 asks
  for more of them.
- **The hint ladder.** Costs are stated before you pay ("Type hint again for hint 2 (costs 3
  XP)"). Whoami's hint 2 names the real misconception. In chapter 2, the level-3 hints for tasks
  2 and 3 use `~/...` paths that work from wherever the learner stands.
- **Honest simulation notes.** "» A real man page opens in a pager: arrow keys to scroll, / to
  search, q to quit." printed before `man` output.
- **Boss 1** is a reading puzzle with personality: Root, Boot, Soot, Rot and Loot differ by one
  letter. `HAS_HELP` keeps every deed fair (no `clear --help`, no builtin `pwd --help`).
  "While you were reading, four letters slid under your door" is a lovely line.
- **Boss 2** is the best moment in the slice. The trapdoor, "Look at your prompt: it now shows
  the full path of where you landed", and a reason to need absolute paths turn a definition into
  an incident.
- **The metaphor works.** Home is the sunny cottage and forest, everything else is the dungeon.
  The staircase descent, "THE DUNGEON / outside your home" and "BACK HOME / /home/hero, your
  home" banners, the padlocked `root/`, "/ (the root of everything)", the `hero/` door glowing
  with daylight seen from `/home`, and room descriptions that say "in the dungeon, outside your
  home". A beginner gets an exact sense of `~` versus the rest of the system. Only the verbs in
  finding 4 need fixing.
- **The adventure log's "Why it matters" and "Try it on a real machine".** "Bash replaces `~`
  with your home's path before the command runs, so `cd ~/forest` is really
  `cd /home/hero/forest`" ties the chapter together. `hostname` as "the part of the prompt after
  the @" closes the loop with the intro.
- **Clickable chips** under the map put `cd forest` or `cat readme.txt` in the input without
  running it. Good scaffolding for the first minutes.
- **Tab completion** works, and an ambiguous Tab lists the matches (`cave/  clearing/`).
