# Publish the complete Shellcraft adventure with secure CI

Shellcraft teaches Linux commands through a browser-based adventure, guided quests, a pixel-art map, and a simulated shell. The game was created with help from AI for educational purposes.

This change merges the newer `slice/act3` work, including the additional chapters and shell behavior, into the public release. It adds a short player README with install and run instructions and real screenshots in the game's dark interface. Portable launchers handle dependency setup and start a localhost server. Browser tools no longer assume a fixed Chrome installation path.

The repository uses the personal identity Janet16180 and clarajanet16180@outlook.com. The history audit found no work identity or personal checkout paths. Intentional paths in the simulated game filesystem remain because the lessons teach how Linux paths work.

CI checks lint, tests, browser behavior, the production bundle, Bash reference cases, and Git history for credentials. Container publishing, artifact uploads, and deployment are disabled. Main requires passing Tests, CodeQL, resolved review discussions, and owner code review, with no bypass actors.

Local validation passed: lint, all 2,779 Node tests, the production bundle, launcher syntax, sandboxed desktop/mobile browser checks, and the credential scan across all refs. CI also runs the layout checks and Bash reference cases before merge. The reference container base is pinned to a digest; dependency updates arrive as reviewed pull requests. The map test harness uses fixed case names and text-only captions, and ambiguous string replacements were removed to address the initial CodeQL findings.
